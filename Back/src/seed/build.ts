import { Types } from "mongoose";
import { OrderStatus } from "../models/order.model.js";
import {
  DeliveryMethod,
  LEGACY_DELIVERY_FEES,
  isDeliveryMode,
  type IProductDelivery,
  type IShopDelivery,
} from "../models/delivery.model.js";
import type { IProductBoutique } from "../models/product.model.js";
import type { IShop } from "../models/boutique.model.js";
import { quoteDelivery, toOrderDeliveries } from "../shared/helpers/delivery.helper.js";
import { EntityType } from "../models/user.model.js";
import { Etape, type AvancementChantier, type TypeProjet } from "../models/projet.model.js";
import { complementaritesParRegles } from "./complementarites.js";
import {
  categories,
  demoAddresses,
  demoCustomer,
  demoOrders,
  demoProjet,
  familles,
  offers,
  products,
  promotions,
  shops,
  sousCategories,
} from "./catalog.data.js";

// ─────────────────────────────────────────────
//  Construction du jeu de développement, sans accès à la base.
//
//  Renvoie des documents « à plat » prêts à insérer, reliés entre eux par
//  des ObjectId générés ici. Toutes les dates sont calculées depuis `now` :
//  la vente flash est en cours et les nouveautés sont récentes au moment
//  du seed. Les mots de passe sont en clair : index.ts les hache.
// ─────────────────────────────────────────────

/** Nombre de photos par produit (uploads/seed/products/<image>-1..5.png). */
export const IMAGES_PER_PRODUCT = 5;

export const imagesFor = (image: string): string[] =>
  Array.from({ length: IMAGES_PER_PRODUCT }, (_, i) => `/uploads/seed/products/${image}-${i + 1}.png`);

type Doc = Record<string, unknown> & { _id: Types.ObjectId };

const DAY = 86_400_000;
const HOUR = 3_600_000;

const reviewers = [
  { prenom: "Aïssatou", nom: "Bah", email: "aissatou.bah@btp.com" },
  { prenom: "Ibrahima", nom: "Sow", email: "ibrahima.sow@btp.com" },
  { prenom: "Fatoumata", nom: "Camara", email: "fatoumata.camara@btp.com" },
  { prenom: "Ousmane", nom: "Barry", email: "ousmane.barry@btp.com" },
];

const comments = [
  "Livraison rapide sur le chantier, produit conforme.",
  "Bon rapport qualité-prix, je recommande ce dépôt.",
  "Conforme à la description. Le gérant a été de bon conseil.",
  "Commandé pour un chantier à Ratoma, rien à redire.",
  "Qualité correcte, emballage un peu abîmé à la livraison.",
];

export interface SeedData {
  users: Doc[];
  logins: (Doc & { password: string })[];
  familles: Doc[];
  categories: Doc[];
  sousCategories: Doc[];
  complementarites: Doc[];
  shops: Doc[];
  products: Doc[];
  productBoutiques: Doc[];
  promotions: Doc[];
  reviews: Doc[];
  addresses: Doc[];
  orders: Doc[];
  carts: Doc[];
  wishlists: Doc[];
  recentlyViewed: Doc[];
}

export function buildSeed(now: Date = new Date(), password = "Secret@123"): SeedData {
  const at = (msAgo: number) => new Date(now.getTime() - msAgo);
  const stamp = (date: Date) => ({ createdAt: date, updatedAt: date, deletedAt: null });
  const id = () => new Types.ObjectId();

  // Index clé → document, pour relier les entités.
  const by = <T extends { key: string }>(list: readonly T[]) => new Map(list.map((e) => [e.key, { ...e, _id: id() }]));
  const famById = by(familles);
  const catById = by(categories);
  const scById = by(sousCategories);
  const shopById = by(shops);
  const prdById = by(products);
  const offById = by(offers);
  const need = <T>(map: Map<string, T>, key: string, what: string): T => {
    const value = map.get(key);
    if (!value) throw new Error(`Seed : ${what} « ${key} » introuvable.`);
    return value;
  };

  // ── Comptes ─────────────────────────────────
  const users: Doc[] = [];
  const logins: (Doc & { password: string })[] = [];
  const account = (p: { prenom: string; nom: string; email: string; telephone?: string }, role: EntityType, since: Date) => {
    const user: Doc = { _id: id(), ...p, avatar: null, role, isEmailVerified: true, createdAt: since, updatedAt: since };
    users.push(user);
    logins.push({
      _id: id(),
      entityId: user._id,
      email: p.email,
      password,
      entityType: role,
      emailVerifyToken: null,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      createdAt: since,
      updatedAt: since,
    });
    return user;
  };

  account({ prenom: "Admin", nom: "BTP", email: "admin@btp.com" }, EntityType.ADMIN, at(180 * DAY));
  const customer = account({ ...demoCustomer }, EntityType.USER, at(90 * DAY));
  customer.projet = {
    types: [...demoProjet.types] as TypeProjet[],
    avancement: demoProjet.avancement as AvancementChantier,
    renseigneLe: at(90 * DAY),
  };
  const reviewerUsers = reviewers.map((r, i) => account(r, EntityType.USER, at((60 - i * 7) * DAY)));
  const owners = new Map([...shopById.values()].map((s) => [s.key, account(s.owner, EntityType.SHOP, at(120 * DAY))]));

  // ── Taxonomie ───────────────────────────────
  // Image d'un rayon : la première photo du premier produit qu'il contient.
  const firstImage = (match: (p: (typeof products)[number]) => boolean) => {
    const p = products.find(match);
    return p ? imagesFor(p.image)[0] : null;
  };
  const since = at(120 * DAY);
  const familleDocs = [...famById.values()].map((f) => ({
    _id: f._id, nom: f.nom, description: f.description, image: firstImage((p) => p.famille === f.key),
    ordre: f.ordre, actif: true, ...stamp(since),
  }));
  const categorieDocs = [...catById.values()].map((c) => ({
    _id: c._id, familleId: need(famById, c.famille, "famille")._id, nom: c.nom, description: c.description,
    image: firstImage((p) => p.categorie === c.key), ordre: c.ordre, actif: true, etape: c.etape as Etape, ...stamp(since),
  }));
  const sousCategorieDocs = [...scById.values()].map((s) => ({
    _id: s._id, categorieId: need(catById, s.categorie, "catégorie")._id, nom: s.nom, description: s.description,
    image: firstImage((p) => p.sousCategorie === s.key), ordre: s.ordre, actif: true, ...stamp(since),
  }));

  // Rayons liés par les règles « acheté avec » (articles = noms des photos).
  const complementariteDocs = complementaritesParRegles(
    [...scById.values()].map((s) => {
      const categorie = need(catById, s.categorie, "catégorie");
      return {
        sousId: s._id, categorieId: categorie._id, familleId: need(famById, categorie.famille, "famille")._id,
        articles: [...new Set(products.filter((p) => p.sousCategorie === s.key).map((p) => p.image))],
      };
    }),
    since
  );

  // ── Boutiques ───────────────────────────────
  const shopDocs = [...shopById.values()].map((s) => ({
    _id: s._id, ownerId: need(owners, s.key, "gérant")._id, nom: s.nom, description: s.description,
    logo: null, telephone: s.telephone, email: s.email, adresse: s.adresse,
    delivery: { modes: [...s.delivery.modes], flatRateFee: s.delivery.flatRateFee } as IShopDelivery,
    ...stamp(at(110 * DAY)),
  }));

  // ── Produits et offres : 5 photos chacun ────
  const productDocs = [...prdById.values()].map((p) => ({
    _id: p._id, name: p.name, description: p.description, urlImages: imagesFor(p.image),
    familleId: need(famById, p.famille, "famille")._id,
    categoryId: need(catById, p.categorie, "catégorie")._id,
    sousCategoryId: need(scById, p.sousCategorie, "sous-catégorie")._id,
    ...stamp(at(100 * DAY)),
  }));
  const offerDocs = [...offById.values()].map((o) => {
    const product = need(prdById, o.product, "produit");
    return {
      _id: o._id, boutiqueId: need(shopById, o.shop, "boutique")._id, productId: product._id,
      urlImages: imagesFor(product.image), price: o.price, discountPrice: o.discountPrice,
      stock: o.stock, isFeatured: o.isFeatured, tags: [...o.tags], rating: o.rating, reviewsCount: o.reviewsCount,
      // Sans configuration propre, l'offre suit la livraison de sa boutique.
      delivery: ("delivery" in o
        ? { useShopSettings: false, modes: [...o.delivery.modes], flatRateFee: o.delivery.flatRateFee }
        : { useShopSettings: true, modes: [], flatRateFee: null }) as IProductDelivery,
      ...stamp(at(o.daysAgo * DAY)),
    };
  });

  // ── Promotions ──────────────────────────────
  const promotionDocs = promotions.map((p) => {
    const start = new Date(now.getTime() + p.startsInHours * HOUR);
    return {
      _id: id(), nom: p.nom, description: p.description, type: p.type, scope: p.scope,
      discountType: p.discountType, discountValue: p.discountValue, code: p.code,
      startDate: start, endDate: new Date(start.getTime() + p.durationHours * HOUR),
      productBoutiqueIds: p.offers.map((k) => need(offById, k, "offre")._id),
      minAmount: p.minAmount, maxDiscount: p.maxDiscount, usageLimit: null, usedCount: 0, actif: true,
      ...stamp(start < now ? start : now),
    };
  });

  // ── Avis : trois clients sur les offres mises en avant ──
  const reviewDocs: Doc[] = [];
  offerDocs.filter((o) => o.isFeatured).forEach((o, i) => {
    for (let r = 0; r < 3; r++) {
      const reviewer = reviewerUsers[(i + r) % reviewerUsers.length]!;
      const date = at((2 + i + r * 3) * DAY);
      reviewDocs.push({
        _id: id(), userId: reviewer._id, productBoutiqueId: o._id,
        rating: [5, 4, 5, 3, 4][(i + r) % 5]!, comment: comments[(i + r) % comments.length]!,
        verifiedPurchase: r !== 2, ...stamp(date),
      });
    }
  });

  // ── Compte de démonstration : adresses, commandes, favoris ──
  const addressByKey = new Map(demoAddresses.map((a) => [a.key, { ...a, _id: id() }]));
  const addressDocs = [...addressByKey.values()].map((a) => ({
    _id: a._id, userId: customer._id, label: a.label, destinataire: a.destinataire, telephone: a.telephone,
    adresse: a.adresse, ville: a.ville, commune: a.commune, pays: "Guinée", isDefault: a.isDefault,
    ...stamp(at(80 * DAY)),
  }));

  const offerByKey = (key: string) => {
    const offer = offerDocs.find((d) => d._id === need(offById, key, "offre")._id);
    if (!offer) throw new Error(`Seed : offre « ${key} » introuvable.`);
    return offer as unknown as IProductBoutique;
  };

  const orderDocs = demoOrders.map((o, n) => {
    const created = at(o.daysAgo * DAY);
    const items = o.items.map((it) => {
      const offer = need(offById, it.offer, "offre");
      const product = need(prdById, offer.product, "produit");
      return {
        productBoutiqueId: offer._id, boutiqueId: need(shopById, offer.shop, "boutique")._id, productId: product._id,
        productName: product.name, urlImages: imagesFor(product.image), price: it.price, quantity: it.quantity,
      };
    });
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const method = o.deliveryMethod as DeliveryMethod;
    // Modes actuels : même calcul que le checkout. Anciens modes : frais d'époque, sans détail par boutique.
    const deliveries = isDeliveryMode(method)
      ? toOrderDeliveries(quoteDelivery(
          o.items.map((it) => ({ offer: offerByKey(it.offer), quantity: it.quantity })),
          shopDocs as unknown as IShop[],
          { all: method }
        ))
      : [];
    const shippingFee = isDeliveryMode(method)
      ? deliveries.reduce((sum, d) => sum + d.fee, 0)
      : LEGACY_DELIVERY_FEES[method as keyof typeof LEGACY_DELIVERY_FEES];
    const address = o.address ? need(addressByKey, o.address, "adresse") : null;
    const history = o.history.map((h, i) => ({
      status: h.status as OrderStatus,
      // La création ouvre l'historique ; les étapes suivantes s'enchaînent.
      changedAt: new Date(created.getTime() + (i === 0 ? 0 : h.afterHours) * HOUR),
      ...("note" in h ? { note: h.note } : {}),
    }));
    return {
      _id: id(), userId: customer._id,
      reference: `CMD-${created.getTime()}-${String(100_000 + n * 7_919).slice(-6)}`,
      items, subtotal, discountAmount: 0, promotionCode: null, shippingFee, amount: subtotal + shippingFee,
      status: o.status as OrderStatus, statusHistory: history, deliveryMethod: method, deliveries,
      addressId: method === DeliveryMethod.PICKUP || !address ? null : address._id,
      ...(method === DeliveryMethod.PICKUP || !address
        ? {}
        : {
            shippingAddress: {
              destinataire: address.destinataire, telephone: address.telephone, adresse: address.adresse,
              ville: address.ville, commune: address.commune, pays: "Guinée",
            },
          }),
      createdAt: created, updatedAt: history.at(-1)?.changedAt ?? created, deletedAt: null,
    };
  });

  const pick = (...keys: string[]) => keys.map((k) => need(offById, k, "offre")._id);
  const wishlistDocs = [{
    _id: id(), userId: customer._id,
    items: pick("carrelage-60", "chauffe-eau-100", "niveau-laser").map((productBoutiqueId) => ({ productBoutiqueId })),
    ...stamp(at(3 * DAY)),
  }];
  const recentDocs = [{
    _id: id(), userId: customer._id,
    items: pick("perforateur-sds", "ciment-cem2", "carrelage-60", "peinture-facade").map((productBoutiqueId, i) => ({
      productBoutiqueId, viewedAt: at((i + 1) * HOUR),
    })),
    ...stamp(at(HOUR)),
  }];
  const cartDocs = [{ _id: id(), userId: customer._id, items: [], amount: 0, ...stamp(at(DAY)) }];

  return {
    users, logins,
    familles: familleDocs, categories: categorieDocs, sousCategories: sousCategorieDocs,
    complementarites: complementariteDocs,
    shops: shopDocs, products: productDocs, productBoutiques: offerDocs,
    promotions: promotionDocs, reviews: reviewDocs,
    addresses: addressDocs, orders: orderDocs,
    carts: cartDocs, wishlists: wishlistDocs, recentlyViewed: recentDocs,
  };
}
