import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";

// ─────────────────────────────────────────────
//  PROMOTION
//  De la plateforme (boutiqueId vide, créée par l'administration) ou d'une
//  boutique, qui la planifie et la lance seule. Les types qui changent le
//  prix d'une offre (remise produit, promotion boutique, vente flash) sont
//  appliqués par le moteur de prix ; le code se saisit au checkout ; les
//  paliers et la livraison offerte s'appliquent au panier.
// ─────────────────────────────────────────────
export enum PromotionType {
  COUPON = "coupon",
  FLASH_SALE = "flash_sale",
  PRODUCT_DISCOUNT = "product_discount",
  SHOP_DISCOUNT = "shop_discount",
  QUANTITY_TIERS = "quantity_tiers",
  FREE_SHIPPING = "free_shipping",
}

/**
 * État d'une promotion de boutique. programmée → active → terminée suit
 * les dates (planificateur) ; brouillon, en pause et arrêtée sont des
 * choix de la boutique (ou l'effet d'une sanction pour arrêtée).
 */
export enum PromotionStatus {
  DRAFT = "draft",
  SCHEDULED = "scheduled",
  ACTIVE = "active",
  PAUSED = "paused",
  ENDED = "ended",
  STOPPED = "stopped",
}

export interface IPromotionTier {
  minQuantity: number;
  discountValue: number;
}

export enum PromotionScope {
  PRODUCT_BOUTIQUE = "product_boutique",
  CART = "cart",
}

export enum DiscountType {
  PERCENTAGE = "percentage",
  FIXED = "fixed",
}

export interface IPromotion extends Document, BaseModel {
  /** Boutique qui lance et paie la promotion ; null = plateforme. */
  boutiqueId?: Types.ObjectId | null;
  status: PromotionStatus;
  nom: string;
  description?: string;
  type: PromotionType;
  scope: PromotionScope;
  discountType: DiscountType;
  discountValue: number;
  code?: string | null;
  startDate: Date;
  endDate: Date;
  productBoutiqueIds: Types.ObjectId[];
  minAmount?: number;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  usedCount: number;
  actif: boolean;
  /** Promotion boutique : familles et catégories visées (vide = toutes ses offres), offres exclues. */
  target?: { familleIds: Types.ObjectId[]; categoryIds: Types.ObjectId[]; excludedOfferIds: Types.ObjectId[] };
  /** Prix par quantité : jusqu'à 3 paliers, en pourcentage du prix de base. */
  tiers: IPromotionTier[];
  /** Vente flash : unités vendues au prix flash, puis la vente s'arrête. */
  flashQuantity?: number | null;
  flashSold: number;
  /** Code : utilisations par client (1 par défaut pour un code boutique). */
  perCustomerLimit?: number | null;
  /** Code : s'ajoute-t-il à un prix déjà promotionnel ? */
  stackable: boolean;
  campaignId?: Types.ObjectId | null;
  /** La boutique a confirmé une remise de plus de 50 %. */
  highDiscountConfirmed: boolean;
  stoppedAt?: Date | null;
  stopReason?: string | null;
  createdBy?: Types.ObjectId | null;
}

const promotionSchema = new Schema<IPromotion>(
  {
    boutiqueId: { type: Types.ObjectId, ref: "shop", default: null },
    // Les promotions de la plateforme suivent `actif` et leurs dates.
    status: { type: String, enum: Object.values(PromotionStatus), default: PromotionStatus.ACTIVE },
    nom: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: { type: String, enum: Object.values(PromotionType), required: true },
    scope: { type: String, enum: Object.values(PromotionScope), required: true },
    discountType: {
      type: String,
      enum: Object.values(DiscountType),
      default: DiscountType.PERCENTAGE,
    },
    discountValue: { type: Number, required: true, min: 0 },
    // Code du coupon (unique). sparse : plusieurs promotions sans code sont autorisées.
    code: { type: String, trim: true, uppercase: true, unique: true, sparse: true, default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    // Produits ciblés (scope = product_boutique).
    productBoutiqueIds: { type: [Types.ObjectId], ref: "product_boutique", default: [] },
    // Montant minimum du panier requis (scope = cart).
    minAmount: { type: Number, min: 0, default: 0 },
    // Plafond de réduction (utile pour un pourcentage sur le panier).
    maxDiscount: { type: Number, min: 0, default: null },
    // Limite d'utilisation globale (coupons) ; null = illimité.
    usageLimit: { type: Number, min: 1, default: null },
    usedCount: { type: Number, min: 0, default: 0 },
    actif: { type: Boolean, default: true },
    target: {
      type: new Schema(
        {
          familleIds: { type: [Types.ObjectId], ref: "famille", default: [] },
          categoryIds: { type: [Types.ObjectId], ref: "categorie", default: [] },
          excludedOfferIds: { type: [Types.ObjectId], ref: "product_boutique", default: [] },
        },
        { _id: false }
      ),
      default: undefined,
    },
    tiers: {
      type: [new Schema<IPromotionTier>({ minQuantity: { type: Number, required: true, min: 2 }, discountValue: { type: Number, required: true, min: 1, max: 70 } }, { _id: false })],
      default: [],
    },
    flashQuantity: { type: Number, min: 1, default: null },
    flashSold: { type: Number, min: 0, default: 0 },
    perCustomerLimit: { type: Number, min: 1, default: null },
    stackable: { type: Boolean, default: true },
    campaignId: { type: Types.ObjectId, ref: "campaign", default: null },
    highDiscountConfirmed: { type: Boolean, default: false },
    stoppedAt: { type: Date, default: null },
    stopReason: { type: String, default: null },
    createdBy: { type: Types.ObjectId, ref: "user", default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Recherche des promotions actives sur une période (ventes flash).
promotionSchema.index({ type: 1, actif: 1, startDate: 1, endDate: 1 });
// Promotions d'une boutique par onglet, offres visées, passages de dates.
promotionSchema.index({ boutiqueId: 1, status: 1, startDate: -1 });
promotionSchema.index({ productBoutiqueIds: 1 });
promotionSchema.index({ status: 1, startDate: 1 });
promotionSchema.index({ status: 1, endDate: 1 });
promotionSchema.index({ campaignId: 1 });

promotionSchema.pre(/^find/, function (this: mongoose.Query<unknown, IPromotion>) {
  this.where({ deletedAt: null });
});

export const Promotion: Model<IPromotion> = mongoose.model<IPromotion>("promotion", promotionSchema);
