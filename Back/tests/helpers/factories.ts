import { vi } from "vitest";
import { Types } from "mongoose";

import type { IUser } from "../../src/models/user.model.js";
import type { IShop } from "../../src/models/boutique.model.js";
import type { IFamille } from "../../src/models/famille.model.js";
import type { ICategorie } from "../../src/models/categorie.model.js";
import type { ISousCategorie } from "../../src/models/sousCategorie.model.js";
import type { IProduct, IProductBoutique } from "../../src/models/product.model.js";
import type { ICart } from "../../src/models/cart.model.js";
import type { IWishlist } from "../../src/models/wishlist.model.js";
import type { IOrder } from "../../src/models/order.model.js";
import type { IShopOrder } from "../../src/models/shopOrder.model.js";
import type { IReview } from "../../src/models/review.model.js";
import type { IAddress } from "../../src/models/address.model.js";
import type { IPromotion } from "../../src/models/promotion.model.js";
import type { IShopRequest } from "../../src/models/shopRequest.model.js";
import type { ISupportTicket } from "../../src/models/supportTicket.model.js";
import type { ISupportMessage } from "../../src/models/supportMessage.model.js";
import type { ISanction } from "../../src/models/sanction.model.js";
import type { IBoost } from "../../src/models/boost.model.js";
import type { ICampaign } from "../../src/models/campaign.model.js";
import { BoostGoal, BoostKind, BoostRelation, BoostStatus } from "../../src/models/boost.model.js";
import { DeliveryMethod, OrderStatus, PaymentMethod } from "../../src/models/order.model.js";
import { ShopOrderPaymentStatus, ShopOrderStatus } from "../../src/models/shopOrder.model.js";
import {
  DiscountType,
  PromotionScope,
  PromotionStatus,
  PromotionType,
} from "../../src/models/promotion.model.js";
import {
  CatalogSize,
  SellerExperience,
  SellerType,
  ShopRequestStatus,
} from "../../src/models/shopRequest.model.js";
import {
  SupportParty,
  SupportPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "../../src/models/supportTicket.model.js";
import { SupportMessageKind, SupportVisibility } from "../../src/models/supportMessage.model.js";
import { SanctionTargetKind, SanctionType } from "../../src/models/sanction.model.js";

// ─────────────────────────────────────────────
//  Utilitaires
// ─────────────────────────────────────────────

export const oid = (): Types.ObjectId => new Types.ObjectId();

/** Dates figées : rend les assertions sur createdAt/updatedAt déterministes. */
export const CREATED_AT = new Date("2026-01-01T10:00:00.000Z");
export const UPDATED_AT = new Date("2026-01-02T10:00:00.000Z");
/** Date d'acceptation des conditions de vente d'une demande de boutique. */
export const ACCEPTED_TERMS_AT = new Date("2026-01-01T09:55:00.000Z");

/**
 * Transforme un objet plat en pseudo-document Mongoose :
 * ajoute `save()` (espionnable) et les horodatages par défaut.
 */
const doc = <T extends Record<string, any>>(base: T): T & { save: ReturnType<typeof vi.fn> } => {
  const d: any = {
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    deletedAt: null,
    ...base,
  };
  d.save = vi.fn().mockResolvedValue(d);
  return d;
};

type Over<T> = Partial<Record<keyof T, any>> & Record<string, any>;

// ─────────────────────────────────────────────
//  Fabriques de documents
// ─────────────────────────────────────────────

export const makeUser = (over: Over<IUser> = {}): IUser =>
  doc({
    _id: oid(),
    nom: "Diallo",
    prenom: "Mamadou",
    email: "mamadou.diallo@example.com",
    telephone: "620000000",
    avatar: null,
    role: "user",
    isEmailVerified: true,
    ...over,
  }) as unknown as IUser;

export const makeShop = (over: Over<IShop> = {}): IShop =>
  doc({
    _id: oid(),
    ownerId: oid(),
    nom: "Boutique Kaloum",
    description: "Électronique et accessoires",
    logo: null,
    telephone: "622000000",
    email: "contact@kaloum.gn",
    adresse: "Conakry",
    ...over,
  }) as unknown as IShop;

export const makeFamille = (over: Over<IFamille> = {}): IFamille =>
  doc({
    _id: oid(),
    nom: "Électronique",
    description: "Produits électroniques",
    image: null,
    ordre: 1,
    actif: true,
    ...over,
  }) as unknown as IFamille;

export const makeCategorie = (over: Over<ICategorie> = {}): ICategorie =>
  doc({
    _id: oid(),
    familleId: oid(),
    nom: "Téléphonie",
    description: "Smartphones et accessoires",
    image: null,
    ordre: 1,
    actif: true,
    ...over,
  }) as unknown as ICategorie;

export const makeSousCategorie = (over: Over<ISousCategorie> = {}): ISousCategorie =>
  doc({
    _id: oid(),
    categorieId: oid(),
    nom: "Smartphones",
    description: "Téléphones intelligents",
    image: null,
    ordre: 1,
    actif: true,
    ...over,
  }) as unknown as ISousCategorie;

export const makeProduct = (over: Over<IProduct> = {}): IProduct =>
  doc({
    _id: oid(),
    name: "Galaxy A15",
    description: "Smartphone 128 Go",
    urlVideo: "/uploads/videos/2026-01-01/demo.mp4",
    urlImages: ["/uploads/images/2026-01-01/a15.jpg"],
    familleId: oid(),
    categoryId: oid(),
    sousCategoryId: oid(),
    ...over,
  }) as unknown as IProduct;

export const makeProductBoutique = (over: Over<IProductBoutique> = {}): IProductBoutique =>
  doc({
    _id: oid(),
    boutiqueId: oid(),
    productId: oid(),
    urlImages: ["/uploads/images/2026-01-01/a15-boutique.jpg"],
    price: 1_500_000,
    discountPrice: 1_350_000,
    stock: 10,
    isFeatured: false,
    tags: ["samsung", "smartphone"],
    rating: 4.5,
    reviewsCount: 12,
    promo: null,
    quantityTiers: [],
    salesCount30d: 0,
    featuredRank: null,
    ...over,
  }) as unknown as IProductBoutique;

export const makeCart = (over: Over<ICart> = {}): ICart =>
  doc({
    _id: oid(),
    userId: oid(),
    items: [],
    amount: 0,
    ...over,
  }) as unknown as ICart;

export const makeCartItem = (over: Over<ICart["items"][number]> = {}) => ({
  productBoutiqueId: oid(),
  quantity: 1,
  price: 1_000,
  ...over,
});

export const makeWishlist = (over: Over<IWishlist> = {}): IWishlist =>
  doc({
    _id: oid(),
    userId: oid(),
    items: [],
    ...over,
  }) as unknown as IWishlist;

export const makeOrder = (over: Over<IOrder> = {}): IOrder =>
  doc({
    _id: oid(),
    userId: oid(),
    reference: "CMD-1767261600000-123456",
    items: [],
    subtotal: 0,
    discountAmount: 0,
    promotionCode: null,
    shippingFee: 0,
    amount: 0,
    status: OrderStatus.PENDING,
    statusHistory: [],
    deliveryMethod: DeliveryMethod.STANDARD,
    addressId: null,
    telephone: "620000000",
    adresse: "Conakry, Ratoma",
    ...over,
  }) as unknown as IOrder;

export const makeOrderItem = (over: Over<IOrder["items"][number]> = {}) => ({
  productBoutiqueId: oid(),
  boutiqueId: oid(),
  productId: oid(),
  productName: "Galaxy A15",
  urlImages: [],
  price: 1_000,
  quantity: 1,
  ...over,
});

/**
 * Sous-commande : par défaut à confirmer, livrée à prix fixe, payée à la
 * remise. `delivery` et `payment` sont fusionnés avec leurs valeurs par
 * défaut : `{ payment: { status: PAID } }` garde la méthode et le montant
 * remboursé. La livraison suit la boutique de la sous-commande.
 */
export const makeShopOrder = (over: Over<IShopOrder> = {}): IShopOrder => {
  const { delivery, payment, ...rest } = over;
  const boutiqueId = rest.boutiqueId ?? oid();
  return doc({
    _id: oid(),
    orderId: oid(),
    userId: oid(),
    boutiqueNom: "Boutique Kaloum",
    reference: "CMD-1767261600000-123456-1",
    items: [],
    subtotal: 50_000,
    discountAmount: 0,
    deliveryFee: 25_000,
    amount: 75_000,
    shippingAddress: {
      destinataire: "Mamadou Diallo",
      telephone: "620000000",
      adresse: "Rue KA-020",
      ville: "Conakry",
      commune: "Ratoma",
      pays: "Guinée",
    },
    customer: { nom: "Diallo", prenom: "Mamadou", telephone: "620000000" },
    status: ShopOrderStatus.PENDING,
    statusHistory: [],
    pickupCode: "123456",
    deliveryAttempts: 0,
    return: null,
    deadlineAt: null,
    reminderAt: null,
    ...rest,
    boutiqueId,
    delivery: {
      boutiqueId,
      boutiqueNom: "Boutique Kaloum",
      method: DeliveryMethod.FLAT_RATE,
      fee: 25_000,
      ...delivery,
    },
    payment: {
      method: PaymentMethod.ON_DELIVERY,
      status: ShopOrderPaymentStatus.UNPAID,
      paidAt: null,
      refundedAmount: 0,
      refundedAt: null,
      ...payment,
    },
  }) as unknown as IShopOrder;
};

export const makeReview = (over: Over<IReview> = {}): IReview =>
  doc({
    _id: oid(),
    userId: oid(),
    productBoutiqueId: oid(),
    rating: 4,
    comment: "Très bon produit",
    verifiedPurchase: false,
    ...over,
  }) as unknown as IReview;

export const makeAddress = (over: Over<IAddress> = {}): IAddress =>
  doc({
    _id: oid(),
    userId: oid(),
    label: "Maison",
    destinataire: "Mamadou Diallo",
    telephone: "620000000",
    adresse: "Rue KA-020",
    ville: "Conakry",
    commune: "Ratoma",
    pays: "Guinée",
    isDefault: false,
    ...over,
  }) as unknown as IAddress;

export const makePromotion = (over: Over<IPromotion> = {}): IPromotion =>
  doc({
    _id: oid(),
    nom: "Promo rentrée",
    description: "10% sur tout le panier",
    type: PromotionType.COUPON,
    scope: PromotionScope.CART,
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10,
    code: "RENTREE10",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T23:59:59.000Z"),
    productBoutiqueIds: [],
    minAmount: 0,
    maxDiscount: null,
    usageLimit: null,
    usedCount: 0,
    actif: true,
    // Défauts du schéma : promotion de la plateforme, en cours, cumulable.
    boutiqueId: null,
    status: PromotionStatus.ACTIVE,
    tiers: [],
    flashQuantity: null,
    flashSold: 0,
    perCustomerLimit: null,
    stackable: true,
    campaignId: null,
    highDiscountConfirmed: false,
    stoppedAt: null,
    stopReason: null,
    ...over,
  }) as unknown as IPromotion;

/**
 * Promotion de boutique : remise produit de 20 % en cours sur une offre,
 * lancée par la boutique fournie (ou une boutique neuve).
 */
export const makeShopPromotion = (over: Over<IPromotion> = {}): IPromotion =>
  makePromotion({
    nom: "Remise d'octobre",
    description: "",
    type: PromotionType.PRODUCT_DISCOUNT,
    scope: PromotionScope.PRODUCT_BOUTIQUE,
    discountValue: 20,
    code: null,
    boutiqueId: oid(),
    productBoutiqueIds: [oid()],
    ...over,
  });

/** Boost de produit en cours : 10 000 GNF par jour pendant 5 jours, rien de dépensé. */
export const makeBoost = (over: Over<IBoost> = {}): IBoost =>
  doc({
    _id: oid(),
    boutiqueId: oid(),
    kind: BoostKind.PRODUCT,
    promotionId: null,
    productBoutiqueIds: [oid()],
    goal: BoostGoal.VISITS,
    audience: { mode: "auto", communes: [], villes: [], customerTypes: [], interestFamilleIds: [], relation: BoostRelation.ALL },
    dailyBudget: 10_000,
    reserved: 50_000,
    spent: 0,
    costPerVisit: 500,
    costPerThousandViews: 5_000,
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    endDate: new Date("2026-10-30T00:00:00.000Z"),
    status: BoostStatus.ACTIVE,
    stopReason: null,
    endedAt: null,
    refunded: 0,
    createdBy: null,
    ...over,
  }) as unknown as IBoost;

/** Campagne de la plateforme : « Soldes d'octobre », 10 % au moins, tout le catalogue. */
export const makeCampaign = (over: Over<ICampaign> = {}): ICampaign =>
  doc({
    _id: oid(),
    slug: "soldes-octobre",
    nom: "Soldes d'octobre",
    description: "Les soldes de la plateforme",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    endDate: new Date("2026-11-10T00:00:00.000Z"),
    minDiscount: 10,
    familleIds: [],
    image: null,
    actif: true,
    createdBy: null,
    ...over,
  }) as unknown as ICampaign;

export const makeShopRequest = (over: Over<IShopRequest> = {}): IShopRequest =>
  doc({
    _id: oid(),
    userId: oid(),
    nom: "Quincaillerie Kipé",
    description: "Quincaillerie générale : visserie, outillage à main, serrurerie.",
    familleIds: [oid()],
    sellerType: SellerType.PARTICULIER,
    rccm: null,
    experience: SellerExperience.UN_A_TROIS,
    catalogSize: CatalogSize.MOINS_DE_50,
    hasPhysicalStore: true,
    adresse: "Kipé, Ratoma, Conakry",
    email: null,
    message: null,
    acceptedTermsAt: ACCEPTED_TERMS_AT,
    status: ShopRequestStatus.PENDING,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    shopId: null,
    ...over,
  }) as unknown as IShopRequest;

/**
 * Demande de support : par défaut un problème de commande (retard) ouvert par
 * un client, qui attend la boutique, sans cible ni échéance. Les champs
 * absents d'un document neuf valent null, comme les défauts du schéma.
 */
export const makeSupportTicket = (over: Over<ISupportTicket> = {}): ISupportTicket =>
  doc({
    _id: oid(),
    number: "SUP-000001",
    type: SupportTicketType.ORDER_PROBLEM,
    reason: "delay",
    subject: "Retard — CMD-1767261600000-123456-1",
    status: SupportTicketStatus.AWAITING_SHOP,
    priority: SupportPriority.NORMAL,
    requester: {
      userId: oid(),
      accountType: "user",
      name: "Mamadou Diallo",
      email: "mamadou.diallo@example.com",
    },
    target: null,
    boutiqueId: null,
    requesterShopId: null,
    orderId: null,
    assignee: null,
    escalatedAt: null,
    shopRespondedAt: null,
    adminRespondedAt: null,
    deadlineAt: null,
    reminderAt: null,
    proposal: null,
    resolution: null,
    appeal: null,
    resolvedAt: null,
    closedAt: null,
    reopenedAt: null,
    satisfaction: null,
    lastMessageAt: null,
    ...over,
  }) as unknown as ISupportTicket;

/** Message public du demandeur, sans pièce jointe. */
export const makeSupportMessage = (over: Over<ISupportMessage> = {}): ISupportMessage =>
  doc({
    _id: oid(),
    ticketId: oid(),
    author: { userId: oid(), party: SupportParty.REQUESTER, name: "Mamadou Diallo" },
    visibility: SupportVisibility.PUBLIC,
    kind: SupportMessageKind.MESSAGE,
    body: "Ma commande n'est toujours pas arrivée.",
    attachments: [],
    containsContact: false,
    ...over,
  }) as unknown as ISupportMessage;

/** Mesure en cours : par défaut un avertissement adressé à une boutique. */
export const makeSanction = (over: Over<ISanction> = {}): ISanction =>
  doc({
    _id: oid(),
    type: SanctionType.WARNING,
    target: { kind: SanctionTargetKind.SHOP, id: oid(), label: "Boutique Kaloum" },
    notifiedUserId: oid(),
    reason: "Paiement demandé hors plateforme.",
    ticketId: null,
    startsAt: CREATED_AT,
    endsAt: null,
    provisional: false,
    createdBy: null,
    liftRequestedAt: null,
    liftedAt: null,
    liftedBy: null,
    liftReason: null,
    suspendedShopIds: [],
    ...over,
  }) as unknown as ISanction;
