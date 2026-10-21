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
import type { IReview } from "../../src/models/review.model.js";
import type { IAddress } from "../../src/models/address.model.js";
import type { IPromotion } from "../../src/models/promotion.model.js";
import { DeliveryMethod, OrderStatus } from "../../src/models/order.model.js";
import {
  DiscountType,
  PromotionScope,
  PromotionType,
} from "../../src/models/promotion.model.js";

// ─────────────────────────────────────────────
//  Utilitaires
// ─────────────────────────────────────────────

export const oid = (): Types.ObjectId => new Types.ObjectId();

/** Dates figées : rend les assertions sur createdAt/updatedAt déterministes. */
export const CREATED_AT = new Date("2026-01-01T10:00:00.000Z");
export const UPDATED_AT = new Date("2026-01-02T10:00:00.000Z");

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
    ...over,
  }) as unknown as IPromotion;
