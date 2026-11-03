import { Types, type ClientSession } from "mongoose";
import { Shop } from "../../models/boutique.model.js";
import { Product, productBoutique } from "../../models/product.model.js";
import { Review } from "../../models/review.model.js";
import {
  Sanction,
  SanctionTargetKind,
  SanctionType,
  type ISanction,
} from "../../models/sanction.model.js";
import { ShopOrder, ShopOrderActor, ShopOrderStatus, type IShopOrder } from "../../models/shopOrder.model.js";
import { User } from "../../models/user.model.js";
import { destroyUserSessions } from "../config/session.config.js";
import logger from "../logger/logger.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { sendNoticeMail } from "../helpers/mail.helper.js";
import { recomputeRating } from "../helpers/review.helper.js";
import { ShopOrderAction } from "../helpers/shopOrder.workflow.js";
import { SUSPENSION_DAYS } from "../helpers/support.workflow.js";
import { runInTransaction } from "../helpers/transaction.js";
import { applyShopOrderAction, settleProviderRefund } from "./shopOrder.service.js";
import { Promotion, PromotionStatus } from "../../models/promotion.model.js";
import { recomputeOfferPricing } from "./pricing.service.js";
import { stopShopBoosts } from "./boost.service.js";
import { deliverNotices, noticesForAction } from "./shopOrder.notifications.js";

// ─────────────────────────────────────────────
//  Sanctions : appliquer une mesure, la lever.
//
//  Une mesure agit là où elle compte : l'offre ou l'avis masqué sort de la
//  vue publique, la boutique suspendue ne prend plus de commande, le compte
//  bloqué ne se connecte plus (ses sessions sont fermées, ses commandes non
//  expédiées annulées et remboursées). Le document Sanction garde la trace,
//  motif et levée compris ; le concerné est prévenu par email.
// ─────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
/** « Sans fin » : une suspension qui suit le blocage du gérant. */
export const FAR_FUTURE = new Date("9999-12-31T00:00:00.000Z");

export const SANCTION_LABELS: Record<SanctionType, string> = {
  [SanctionType.HIDE]: "Masquage",
  [SanctionType.WARNING]: "Avertissement",
  [SanctionType.SUSPENSION]: "Suspension",
  [SanctionType.BLOCK]: "Blocage",
  [SanctionType.PROMO_BAN]: "Promotions suspendues",
};

/** Quelle mesure vise quoi. */
const ALLOWED_TARGETS: Record<SanctionType, readonly SanctionTargetKind[]> = {
  [SanctionType.HIDE]: [SanctionTargetKind.OFFER, SanctionTargetKind.REVIEW],
  [SanctionType.WARNING]: [SanctionTargetKind.SHOP, SanctionTargetKind.USER],
  [SanctionType.SUSPENSION]: [SanctionTargetKind.SHOP],
  [SanctionType.BLOCK]: [SanctionTargetKind.USER],
  [SanctionType.PROMO_BAN]: [SanctionTargetKind.SHOP],
};

export interface ApplySanctionInput {
  type: SanctionType;
  targetKind: SanctionTargetKind;
  targetId: string;
  reason: string;
  ticketId?: string | undefined;
  days?: number | undefined;
  createdBy?: string | null | undefined;
  provisional?: boolean | undefined;
  now?: Date | undefined;
}

/** Ce que la mesure vise, et qui doit en être prévenu. */
const resolveTarget = async (kind: SanctionTargetKind, id: string, session: import("mongoose").ClientSession) => {
  switch (kind) {
    case SanctionTargetKind.OFFER: {
      const offer = await productBoutique.findById(id).session(session);
      if (!offer) throw new HttpError("Annonce introuvable.", 404);
      const [product, shop] = [
        await Product.findById(offer.productId).session(session),
        await Shop.findById(offer.boutiqueId).session(session),
      ];
      return { offer, label: `${product?.name ?? "Annonce"} — ${shop?.nom ?? "boutique"}`, notify: shop?.ownerId ?? null, shopId: shop?._id ?? null };
    }
    case SanctionTargetKind.REVIEW: {
      const review = await Review.findById(id).session(session);
      if (!review) throw new HttpError("Avis introuvable.", 404);
      return { review, label: `Avis du ${review.createdAt.toLocaleDateString("fr-FR")}`, notify: review.userId, shopId: null };
    }
    case SanctionTargetKind.SHOP: {
      const shop = await Shop.findById(id).session(session);
      if (!shop) throw new HttpError("Boutique introuvable.", 404);
      return { shop, label: shop.nom, notify: shop.ownerId, shopId: shop._id };
    }
    case SanctionTargetKind.USER: {
      const user = await User.findById(id).session(session);
      if (!user) throw new HttpError("Compte introuvable.", 404);
      return { user, label: `${user.prenom} ${user.nom}`.trim(), notify: user._id, shopId: null };
    }
    default:
      throw new HttpError("Cible invalide.", 400);
  }
};

export const checkSanctionInput = (input: Pick<ApplySanctionInput, "type" | "targetKind" | "reason" | "days">): string | null => {
  if (!ALLOWED_TARGETS[input.type]?.includes(input.targetKind)) {
    return `${SANCTION_LABELS[input.type] ?? "Cette mesure"} ne vise pas cette cible.`;
  }
  if (!input.reason?.trim()) return "Le motif est requis : la personne visée le lira.";
  if ((input.type === SanctionType.SUSPENSION || input.type === SanctionType.PROMO_BAN) && !SUSPENSION_DAYS.includes(input.days ?? 0)) {
    return `Durée de suspension invalide. Valeurs acceptées : ${SUSPENSION_DAYS.join(", ")} jours.`;
  }
  return null;
};

/** Sous-commandes à annuler quand un compte est bloqué : celles qui ne sont pas encore parties. */
const UNSHIPPED: readonly ShopOrderStatus[] = [ShopOrderStatus.PENDING, ShopOrderStatus.CONFIRMED, ShopOrderStatus.READY_FOR_PICKUP];

const cancelOpenParts = async (filter: Record<string, unknown>, note: string, now: Date): Promise<IShopOrder[]> => {
  const parts = await ShopOrder.find({ ...filter, status: { $in: UNSHIPPED } });
  const cancelled: IShopOrder[] = [];
  for (const part of parts) {
    try {
      const result = await runInTransaction(async (session) => {
        const fresh = await ShopOrder.findById(part._id).session(session);
        if (!fresh || !UNSHIPPED.includes(fresh.status)) return null;
        return applyShopOrderAction({
          part: fresh,
          action: ShopOrderAction.ADMIN_CANCEL,
          actors: [ShopOrderActor.ADMIN],
          input: { note },
          now,
          session,
        });
      });
      if (!result) continue;
      if (result.refundViaProvider) await settleProviderRefund(result.part, result.order);
      await deliverNotices(
        noticesForAction(ShopOrderAction.ADMIN_CANCEL, result.part, { refund: result.refund, input: { note }, from: result.from }),
        result.part
      );
      cancelled.push(result.part);
    } catch (error) {
      logger.error(`Annulation de ${part.reference} après blocage non appliquée : ${(error as Error).message}`);
    }
  }
  return cancelled;
};

const noticeFor = async (sanction: ISanction, lifted: boolean) => {
  if (!sanction.notifiedUserId) return;
  try {
    const user = await User.findById(sanction.notifiedUserId);
    if (!user?.email) return;
    const label = SANCTION_LABELS[sanction.type];
    const until =
      (sanction.type === SanctionType.SUSPENSION || sanction.type === SanctionType.PROMO_BAN) && sanction.endsAt && sanction.endsAt < FAR_FUTURE
        ? ` jusqu'au ${sanction.endsAt.toLocaleDateString("fr-FR")}`
        : "";
    sendNoticeMail({
      to: user.email,
      subject: lifted ? `Mesure levée : ${sanction.target.label}` : `${label} : ${sanction.target.label}`,
      title: lifted ? "La mesure est levée" : `${label}${until}`,
      username: user.prenom,
      paragraphs: lifted
        ? [`La mesure « ${label} » visant ${sanction.target.label} est levée.`, sanction.liftReason ?? ""].filter(Boolean)
        : [
            `Motif : ${sanction.reason}`,
            sanction.type === SanctionType.HIDE && sanction.target.kind === SanctionTargetKind.OFFER
              ? "Corrigez l'annonce depuis votre Espace boutique, puis demandez sa remise en ligne."
              : "Vous pouvez contester cette mesure sous 7 jours.",
          ],
      cta: lifted
        ? undefined
        : { path: `/compte/support/nouvelle?type=sanction_appeal&cible=${String(sanction._id)}`, label: "Contester la mesure" },
    });
  } catch (error) {
    logger.error(`Avis de sanction non envoyé : ${(error as Error).message}`);
  }
};

export const applySanction = async (input: ApplySanctionInput): Promise<ISanction> => {
  const refusal = checkSanctionInput(input);
  if (refusal) throw new HttpError(refusal, 400);
  const now = input.now ?? new Date();

  const sanction = await runInTransaction(async (session) => {
    const target = await resolveTarget(input.targetKind, input.targetId, session);
    const suspendedShopIds: Types.ObjectId[] = [];
    let endsAt: Date | null = null;

    switch (input.type) {
      case SanctionType.HIDE:
        if (target.offer) {
          if (target.offer.hiddenAt) throw new HttpError("Cette annonce est déjà masquée.", 409);
          target.offer.hiddenAt = now;
          target.offer.hiddenReason = input.reason.trim();
          await target.offer.save({ session });
        } else if (target.review) {
          if (target.review.hiddenAt) throw new HttpError("Cet avis est déjà masqué.", 409);
          target.review.hiddenAt = now;
          await target.review.save({ session });
          await recomputeRating(target.review.productBoutiqueId, session);
        }
        break;
      case SanctionType.SUSPENSION: {
        const shop = target.shop!;
        endsAt = new Date(now.getTime() + (input.days ?? 7) * DAY);
        // Une suspension en cours plus longue reste en place.
        if (!shop.suspendedUntil || shop.suspendedUntil < endsAt) shop.suspendedUntil = endsAt;
        await shop.save({ session });
        break;
      }
      case SanctionType.PROMO_BAN: {
        const shop = target.shop!;
        endsAt = new Date(now.getTime() + (input.days ?? 7) * DAY);
        if (!shop.promotionsBlockedUntil || shop.promotionsBlockedUntil < endsAt) shop.promotionsBlockedUntil = endsAt;
        await shop.save({ session });
        // Ses promotions en cours ou à venir s'arrêtent.
        await Promotion.updateMany(
          { boutiqueId: shop._id, status: { $in: [PromotionStatus.DRAFT, PromotionStatus.SCHEDULED, PromotionStatus.ACTIVE, PromotionStatus.PAUSED] } },
          { $set: { status: PromotionStatus.STOPPED, stoppedAt: now, stopReason: "Promotions suspendues par la modération." } },
          { session }
        );
        break;
      }
      case SanctionType.BLOCK: {
        const user = target.user!;
        if (user.blockedAt) throw new HttpError("Ce compte est déjà bloqué.", 409);
        user.blockedAt = now;
        await user.save({ session });
        // Les boutiques d'un gérant bloqué ne prennent plus de commande.
        const shops = await Shop.find({ ownerId: user._id }).session(session);
        for (const shop of shops) {
          if (shop.suspendedUntil?.getTime() === FAR_FUTURE.getTime()) continue;
          shop.suspendedUntil = FAR_FUTURE;
          await shop.save({ session });
          suspendedShopIds.push(shop._id as Types.ObjectId);
        }
        break;
      }
      default:
        break;
    }

    const [created] = await Sanction.create(
      [
        {
          type: input.type,
          target: { kind: input.targetKind, id: new Types.ObjectId(input.targetId), label: target.label },
          notifiedUserId: target.notify,
          reason: input.reason.trim(),
          ticketId: input.ticketId ? new Types.ObjectId(input.ticketId) : null,
          startsAt: now,
          endsAt,
          provisional: input.provisional ?? false,
          createdBy: input.createdBy ? new Types.ObjectId(input.createdBy) : null,
          suspendedShopIds,
        },
      ],
      { session }
    );
    if (!created) throw new Error("La sanction n'a pas pu être enregistrée.");
    return created;
  });

  // Après la transaction : sessions fermées, commandes non expédiées annulées.
  if (sanction.type === SanctionType.BLOCK) {
    const userId = String(sanction.target.id);
    await destroyUserSessions(userId).catch((error) => logger.error(`Sessions de ${userId} non fermées : ${(error as Error).message}`));
    const note = "Compte bloqué par la modération.";
    await cancelOpenParts({ userId: sanction.target.id }, note, now);
    if (sanction.suspendedShopIds.length > 0) {
      await cancelOpenParts({ boutiqueId: { $in: sanction.suspendedShopIds } }, "Boutique fermée par la modération.", now);
    }
  }

  if (sanction.type === SanctionType.PROMO_BAN) {
    const shopId = String(sanction.target.id);
    await recomputeOfferPricing({ boutiqueId: shopId }, now).catch((error) => logger.error(`Prix de ${shopId} non recalculés : ${(error as Error).message}`));
    await stopShopBoosts(shopId, "Promotions suspendues par la modération.", now).catch((error) =>
      logger.error(`Boosts de ${shopId} non arrêtés : ${(error as Error).message}`)
    );
  }

  logger.info(`Sanction ${sanction.type} sur ${sanction.target.kind} ${String(sanction.target.id)}`);
  if (!sanction.provisional) await noticeFor(sanction, false);
  return sanction;
};

/**
 * Ce qui suspend encore une boutique quand la mesure `excludedId` est levée :
 * le blocage de son gérant (date sans fin), sinon la plus lointaine des
 * suspensions en cours, sinon rien. Lever une mesure ne rouvre donc jamais
 * une boutique qu'une autre mesure tient fermée.
 */
const remainingSuspension = async (
  shopId: Types.ObjectId | string,
  excludedId: Types.ObjectId,
  now: Date,
  session: ClientSession
): Promise<Date | null> => {
  const id = new Types.ObjectId(String(shopId));
  const active = await Sanction.find({
    _id: { $ne: excludedId },
    liftedAt: null,
    $or: [
      { type: SanctionType.SUSPENSION, "target.kind": SanctionTargetKind.SHOP, "target.id": id, endsAt: { $gt: now } },
      { type: SanctionType.BLOCK, suspendedShopIds: id },
    ],
  }).session(session);
  if (active.some((other) => other.type === SanctionType.BLOCK)) return FAR_FUTURE;
  const ends = active.map((other) => other.endsAt?.getTime() ?? 0).filter((time) => time > now.getTime());
  return ends.length > 0 ? new Date(Math.max(...ends)) : null;
};

export const liftSanction = async (id: string, by: string | null, reason: string | undefined, now = new Date()): Promise<ISanction> => {
  const sanction = await runInTransaction(async (session) => {
    const found = await Sanction.findById(id).session(session);
    if (!found) throw new HttpError("Mesure introuvable.", 404);
    if (found.liftedAt) throw new HttpError("Cette mesure est déjà levée.", 409);

    const targetId = String(found.target.id);
    switch (found.type) {
      case SanctionType.HIDE:
        if (found.target.kind === SanctionTargetKind.OFFER) {
          const offer = await productBoutique.findById(targetId).session(session);
          if (offer) {
            offer.hiddenAt = null;
            offer.hiddenReason = null;
            await offer.save({ session });
          }
        } else {
          const review = await Review.findById(targetId).session(session);
          if (review) {
            review.hiddenAt = null;
            await review.save({ session });
            await recomputeRating(review.productBoutiqueId, session);
          }
        }
        break;
      case SanctionType.SUSPENSION: {
        const shop = await Shop.findById(targetId).session(session);
        if (shop && shop.suspendedUntil) {
          shop.suspendedUntil = await remainingSuspension(shop._id as Types.ObjectId, found._id as Types.ObjectId, now, session);
          await shop.save({ session });
        }
        break;
      }
      case SanctionType.PROMO_BAN: {
        const shop = await Shop.findById(targetId).session(session);
        if (shop && shop.promotionsBlockedUntil) {
          // Une autre suspension des promotions encore en cours garde sa date.
          const others = await Sanction.find({
            _id: { $ne: found._id },
            type: SanctionType.PROMO_BAN,
            "target.id": shop._id,
            liftedAt: null,
            endsAt: { $gt: now },
          }).session(session);
          const ends = others.map((other) => other.endsAt?.getTime() ?? 0);
          shop.promotionsBlockedUntil = ends.length > 0 ? new Date(Math.max(...ends)) : null;
          await shop.save({ session });
        }
        break;
      }
      case SanctionType.BLOCK: {
        const user = await User.findById(targetId).session(session);
        if (user) {
          user.blockedAt = null;
          await user.save({ session });
        }
        // Une suspension prononcée avant le blocage reprend son cours.
        for (const shopId of found.suspendedShopIds) {
          const shop = await Shop.findById(shopId).session(session);
          if (shop && shop.suspendedUntil?.getTime() === FAR_FUTURE.getTime()) {
            shop.suspendedUntil = await remainingSuspension(shopId, found._id as Types.ObjectId, now, session);
            await shop.save({ session });
          }
        }
        break;
      }
      default:
        break;
    }

    found.liftedAt = now;
    found.liftedBy = by ? new Types.ObjectId(by) : null;
    found.liftReason = reason?.trim() || null;
    await found.save({ session });
    return found;
  });

  logger.info(`Sanction ${String(sanction._id)} levée`);
  await noticeFor(sanction, true);
  return sanction;
};

/**
 * Un masquage provisoire (automatique, après plusieurs signalements) devient
 * définitif quand l'administration confirme le signalement. La boutique,
 * qui n'avait pas été prévenue du provisoire, reçoit alors le motif.
 */
export const confirmProvisional = async (sanction: ISanction): Promise<ISanction> => {
  if (!sanction.provisional || sanction.liftedAt) return sanction;
  sanction.provisional = false;
  await sanction.save();
  await noticeFor(sanction, false);
  return sanction;
};

/** Une boutique a corrigé son annonce masquée et demande sa remise en ligne. */
export const requestLift = async (id: string, userId: string, now = new Date()): Promise<ISanction> => {
  const sanction = await Sanction.findById(id);
  if (!sanction) throw new HttpError("Mesure introuvable.", 404);
  if (String(sanction.notifiedUserId) !== userId) throw new HttpError("Cette mesure ne vous concerne pas.", 403);
  if (sanction.type !== SanctionType.HIDE || sanction.target.kind !== SanctionTargetKind.OFFER) {
    throw new HttpError("Seule une annonce masquée se remet en ligne : contestez les autres mesures.", 400);
  }
  if (sanction.liftedAt) throw new HttpError("Cette annonce est déjà remise en ligne.", 409);
  if (sanction.liftRequestedAt) throw new HttpError("Votre demande de remise en ligne est déjà transmise.", 409);
  sanction.liftRequestedAt = now;
  await sanction.save();
  if (process.env.ADMIN_EMAIL) {
    sendNoticeMail({
      to: process.env.ADMIN_EMAIL,
      subject: `Remise en ligne demandée : ${sanction.target.label}`,
      title: "Une annonce corrigée attend votre validation",
      paragraphs: [sanction.target.label, `Motif du masquage : ${sanction.reason}`],
      cta: { path: "/admin/support", label: "Examiner" },
    });
  }
  return sanction;
};

/**
 * Mesure en cours : ni levée, ni arrivée à échéance. Seule une suspension a
 * une fin ; un masquage, un avertissement ou un blocage valent jusqu'à leur
 * levée. Le barème (suggestSanction) ne retient, lui, que les 12 derniers mois.
 */
export const isSanctionActive = (sanction: Pick<ISanction, "type" | "liftedAt" | "endsAt">, now = new Date()): boolean => {
  if (sanction.liftedAt) return false;
  if (sanction.type === SanctionType.SUSPENSION) return !!sanction.endsAt && sanction.endsAt > now;
  return true;
};
