import { Shop } from "../../models/boutique.model.js";
import { User } from "../../models/user.model.js";
import { ShopOrderStatus, type IShopOrder } from "../../models/shopOrder.model.js";
import logger from "../logger/logger.js";
import { sendNoticeMail } from "../helpers/mail.helper.js";
import {
  CANCELLATION_REASONS,
  DELIVERY_FAILURE_REASONS,
  isPickup,
  REFUSAL_REASONS,
  RETURN_REASONS,
  ShopOrderAction,
  type ActionInput,
} from "../helpers/shopOrder.workflow.js";

// ─────────────────────────────────────────────
//  Qui est prévenu, et de quoi, à chaque étape d'une sous-commande.
//  Chaque changement prévient celui qui doit agir ensuite. Les avis sont
//  construits ici (sans base), puis envoyés après la transaction par
//  deliverNotices : un email qui échoue n'annule jamais une action.
// ─────────────────────────────────────────────

export type NoticeRecipient = "client" | "shop" | "admin";

export interface ShopOrderNotice {
  recipient: NoticeRecipient;
  subject: string;
  title: string;
  paragraphs: string[];
  cta?: { path: string; label: string } | undefined;
}

type Part = Pick<
  IShopOrder,
  "_id" | "orderId" | "boutiqueId" | "boutiqueNom" | "reference" | "amount" | "delivery" | "pickupCode" | "status"
>;

const money = (value: number): string => `${new Intl.NumberFormat("fr-FR").format(value)} GNF`;

const label = (labels: Record<string, string>, reason: string | undefined, note: string | undefined): string => {
  const base = reason ? labels[reason] ?? reason : "";
  if (note?.trim()) return base ? `${base} — ${note.trim()}` : note.trim();
  return base || "aucun motif précisé";
};

const shopName = (part: Part) => part.boutiqueNom ?? "La boutique";

const clientLink = (part: Part) => ({ path: `/compte/commandes/${String(part.orderId)}`, label: "Voir ma commande" });
const shopLink = (part: Part) => ({
  path: `/ma-boutique/${String(part.boutiqueId)}/commandes/${String(part._id)}`,
  label: "Ouvrir la commande",
});
const adminLink = (part: Part) => ({ path: `/admin/commandes/${String(part._id)}`, label: "Examiner" });

const refundLine = (refund: number) =>
  refund > 0 ? `Remboursement : ${money(refund)}.` : "Rien n'a été encaissé : il n'y a rien à rembourser.";

/** Avis envoyés quand une boutique reçoit une nouvelle sous-commande à confirmer. */
export const newPartNotices = (part: Part): ShopOrderNotice[] => [
  {
    recipient: "shop",
    subject: `Nouvelle commande ${part.reference}`,
    title: "Nouvelle commande à confirmer",
    paragraphs: [
      `Vous avez reçu la commande ${part.reference} (${money(part.amount)}).`,
      "Confirmez-la ou refusez-la sous 48 heures : sans réponse, elle expire et le client est remboursé.",
    ],
    cta: shopLink(part),
  },
];

/**
 * Avis qui suivent une action. `refund` = montant rendu au client (0 si rien
 * n'avait été encaissé) ; `from` = statut avant l'action.
 */
export const noticesForAction = (
  action: ShopOrderAction,
  part: Part,
  { refund, input, from }: { refund: number; input: ActionInput; from: ShopOrderStatus }
): ShopOrderNotice[] => {
  const ref = part.reference;
  const name = shopName(part);
  const client = (subject: string, title: string, paragraphs: string[]): ShopOrderNotice => ({
    recipient: "client",
    subject,
    title,
    paragraphs,
    cta: clientLink(part),
  });
  const shop = (subject: string, title: string, paragraphs: string[]): ShopOrderNotice => ({
    recipient: "shop",
    subject,
    title,
    paragraphs,
    cta: shopLink(part),
  });
  const admin = (subject: string, title: string, paragraphs: string[]): ShopOrderNotice => ({
    recipient: "admin",
    subject,
    title,
    paragraphs,
    cta: adminLink(part),
  });

  switch (action) {
    case ShopOrderAction.CONFIRM:
      return [client(`Commande ${ref} confirmée`, "Commande confirmée", [`${name} a confirmé votre commande et la prépare.`])];

    case ShopOrderAction.REFUSE:
      return [
        client(`Commande ${ref} refusée`, "Commande refusée", [
          `${name} ne peut pas honorer votre commande : ${label(REFUSAL_REASONS, input.reason, input.note)}.`,
          refundLine(refund),
        ]),
      ];

    case ShopOrderAction.CANCEL:
      return [
        shop(`Commande ${ref} annulée par le client`, "Commande annulée", [
          `Le client a annulé la commande ${ref} : ${label(CANCELLATION_REASONS, input.reason, input.note)}.`,
          "Le stock réservé a été rendu.",
        ]),
      ];

    case ShopOrderAction.ADMIN_CANCEL:
      return [
        client(`Commande ${ref} annulée`, "Commande annulée", [
          `L'équipe de la plateforme a annulé votre commande : ${label({}, undefined, input.note)}.`,
          refundLine(refund),
        ]),
        shop(`Commande ${ref} annulée par l'administration`, "Commande annulée", [
          `L'administration a annulé la commande ${ref} : ${label({}, undefined, input.note)}.`,
        ]),
      ];

    case ShopOrderAction.SHIP:
    case ShopOrderAction.RETRY_DELIVERY:
      return [
        client(`Commande ${ref} en route`, "Votre commande est en route", [
          `${name} a ${action === ShopOrderAction.RETRY_DELIVERY ? "relancé" : "lancé"} la livraison.`,
          `Votre code de remise : ${part.pickupCode}. Donnez-le au livreur à la réception, pas avant.`,
        ]),
      ];

    case ShopOrderAction.READY:
      return [
        client(`Commande ${ref} prête au retrait`, "Votre commande vous attend", [
          `Retirez-la chez ${name}${part.delivery.pickupAdresse ? `, ${part.delivery.pickupAdresse}` : ""}, sous 7 jours.`,
          `Votre code de remise : ${part.pickupCode}. Donnez-le en boutique au moment du retrait.`,
        ]),
      ];

    case ShopOrderAction.FAIL_DELIVERY:
      return [
        client(`Livraison de ${ref} échouée`, "La livraison a échoué", [
          `${name} n'a pas pu vous livrer : ${label(DELIVERY_FAILURE_REASONS, input.reason, input.note)}.`,
          "La boutique va vous recontacter pour une nouvelle tentative.",
        ]),
      ];

    case ShopOrderAction.ABANDON_DELIVERY:
      return [client(`Livraison de ${ref} abandonnée`, "Échec de livraison", [
        `${name} a abandonné la livraison de votre commande.`,
        refundLine(refund),
      ])];

    case ShopOrderAction.DELIVER:
      return [
        client(`Commande ${ref} ${isPickup(part) ? "retirée" : "livrée"}`, "Commande reçue", [
          "Merci pour votre achat.",
          "Un problème avec un produit ? Vous avez 7 jours pour demander un retour depuis votre commande.",
        ]),
      ];

    case ShopOrderAction.REQUEST_RETURN:
      return [
        shop(`Retour demandé sur ${ref}`, "Demande de retour", [
          `Le client demande un retour : ${label(RETURN_REASONS, input.reason, input.note)}.`,
          "Acceptez ou refusez sous 48 heures ; sans réponse, l'administration tranche.",
        ]),
      ];

    case ShopOrderAction.ACCEPT_RETURN:
      return [client(`Retour accepté sur ${ref}`, "Retour accepté", [`${name} accepte votre retour.`, refundLine(refund)])];

    case ShopOrderAction.REJECT_RETURN:
    case ShopOrderAction.ESCALATE: {
      const why =
        action === ShopOrderAction.ESCALATE
          ? "La boutique n'a pas répondu sous 48 heures."
          : `La boutique refuse le retour : ${input.note?.trim() ?? ""}`;
      return [
        client(`Litige ouvert sur ${ref}`, "Votre retour est examiné par l'équipe", [why, "L'équipe de la plateforme va trancher."]),
        shop(`Litige ouvert sur ${ref}`, "Litige ouvert", [why, "L'administration examine les deux versions."]),
        admin(`Litige à trancher : ${ref}`, "Litige à trancher", [why]),
      ];
    }

    case ShopOrderAction.RESOLVE_DISPUTE: {
      const decision =
        input.resolution === "rejected"
          ? "Le retour est rejeté : la commande est close."
          : `Le retour est accepté. ${refundLine(refund)}`;
      const paragraphs = [decision, `Motif : ${input.note?.trim() ?? ""}`];
      return [
        client(`Décision sur le litige ${ref}`, "Litige tranché", paragraphs),
        shop(`Décision sur le litige ${ref}`, "Litige tranché", paragraphs),
      ];
    }

    case ShopOrderAction.CONFIRM_REFUND:
      return [client(`Remboursement de ${ref}`, "Remboursement effectué", [`${name} déclare vous avoir remboursé.`])];

    case ShopOrderAction.EXPIRE:
      return from === ShopOrderStatus.READY_FOR_PICKUP
        ? [client(`Commande ${ref} non retirée`, "Commande expirée", [
            "Vous n'avez pas retiré votre commande dans les 7 jours : elle est annulée.",
            refundLine(refund),
          ])]
        : [
            client(`Commande ${ref} expirée`, "Commande expirée", [
              `${name} n'a pas confirmé votre commande sous 48 heures.`,
              refundLine(refund),
            ]),
            admin(`Commande expirée : ${ref}`, "Une boutique n'a pas répondu", [
              `${name} a laissé expirer la commande ${ref}.`,
            ]),
          ];

    default:
      return [];
  }
};

/** Rappel avant l'échéance automatique, selon le statut. */
export const reminderNotices = (part: Part): ShopOrderNotice[] => {
  switch (part.status) {
    case ShopOrderStatus.PENDING:
      return [{
        recipient: "shop",
        subject: `Rappel : commande ${part.reference} à confirmer`,
        title: "Commande en attente de votre réponse",
        paragraphs: ["Cette commande expire dans 24 heures si vous ne la confirmez pas."],
        cta: shopLink(part),
      }];
    case ShopOrderStatus.READY_FOR_PICKUP:
      return [{
        recipient: "client",
        subject: `Rappel : commande ${part.reference} à retirer`,
        title: "Votre commande vous attend toujours",
        paragraphs: [`Retirez-la chez ${shopName(part)} dans les 4 jours, sinon elle sera annulée.`],
        cta: clientLink(part),
      }];
    case ShopOrderStatus.RETURN_REQUESTED:
      return [{
        recipient: "shop",
        subject: `Rappel : retour à traiter sur ${part.reference}`,
        title: "Retour en attente de votre réponse",
        paragraphs: ["Sans réponse dans 24 heures, l'administration tranchera."],
        cta: shopLink(part),
      }];
    default:
      return [];
  }
};

/** En livraison depuis 7 jours sans suite : l'administration est alertée. */
export const stalledNotices = (part: Part): ShopOrderNotice[] => [{
  recipient: "admin",
  subject: `Livraison bloquée : ${part.reference}`,
  title: "Livraison sans suite depuis 7 jours",
  paragraphs: [`La commande ${part.reference} de ${shopName(part)} est en livraison depuis 7 jours.`],
  cta: adminLink(part),
}];

// ─────────────────────────────────────────────
//  Envoi : résout les adresses, puis met les emails en file.
//  Le client et le gérant reçoivent l'email de leur compte ; l'administration,
//  ADMIN_EMAIL s'il est défini (sinon ses avis sont seulement journalisés).
// ─────────────────────────────────────────────
export const deliverNotices = async (notices: ShopOrderNotice[], part: Pick<IShopOrder, "userId" | "boutiqueId">) => {
  if (notices.length === 0) return;
  try {
    const needs = new Set(notices.map((notice) => notice.recipient));
    const client = needs.has("client") ? await User.findById(part.userId) : null;
    const shop = needs.has("shop") ? await Shop.findById(part.boutiqueId) : null;
    const owner = shop ? await User.findById(shop.ownerId) : null;

    for (const notice of notices) {
      const to =
        notice.recipient === "client"
          ? client?.email
          : notice.recipient === "shop"
            ? owner?.email ?? shop?.email
            : process.env.ADMIN_EMAIL;
      if (!to) {
        logger.info(`Avis « ${notice.subject} » sans destinataire (${notice.recipient})`);
        continue;
      }
      sendNoticeMail({
        to,
        subject: notice.subject,
        title: notice.title,
        username: notice.recipient === "client" ? client?.prenom : notice.recipient === "shop" ? owner?.prenom : undefined,
        paragraphs: notice.paragraphs,
        cta: notice.cta,
      });
    }
  } catch (error) {
    logger.error(`Avis de commande non envoyés : ${(error as Error).message}`);
  }
};
