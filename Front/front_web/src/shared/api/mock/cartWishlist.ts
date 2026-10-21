import type { ProductBoutique } from "../../../entities/product";
import {
  CURRENCY,
  DELIVERY_MODES,
  isDeliveryMode,
  type DeliveryMode,
  type DeliveryQuote,
} from "../../../entities/delivery";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import { quoteDelivery } from "./deliveryRules";
import { findLiveOffer } from "./liveCatalog";
import { readDb, writeDb } from "./mockDb";

// ─────────────────────────────────────────────
//  Panier et favoris — routes simulées.
//
//  Dix routes, toutes protégées par requireAuth + requireSelf côté back :
//   GET    /cart/:userId
//   POST   /cart/:userId/items                      { productBoutiqueId, quantity? }
//   PUT    /cart/:userId/items/:productBoutiqueId   { quantity }  — 0 retire
//   DELETE /cart/:userId/items/:productBoutiqueId
//   DELETE /cart/:userId
//   POST   /cart/:userId/delivery-quote             { deliveries?, deliveryMethod? }
//   GET    /wishlist/:userId
//   POST   /wishlist/:userId/items                  { productBoutiqueId }
//   DELETE /wishlist/:userId/items/:productBoutiqueId
//   DELETE /wishlist/:userId
// ─────────────────────────────────────────────

const ok = <T>(data: T, message: string): ApiResponse<T> => ({
  success: true,
  message,
  statusCode: 200,
  data,
});

/** Contrôle d'accès commun : session requise, et sur ses propres données. */
const requireSelf = (userId: string): void => {
  const db = readDb();
  if (!db.sessionUserId) {
    throw new ApiError("Session absente ou expirée, veuillez vous connecter.", 401);
  }
  if (db.sessionUserId !== userId) {
    throw new ApiError("Vous ne pouvez accéder qu'à vos propres données.", 403);
  }
};

const findOffer = (id: string): ProductBoutique => {
  const offre = findLiveOffer(id);
  if (!offre) throw new ApiError("Produit en boutique introuvable", 404);
  return offre;
};

const findUser = (userId: string): void => {
  const db = readDb();
  if (!db.users.some((user) => user._id === userId)) {
    throw new ApiError("Utilisateur introuvable", 404);
  }
};

// ─────────────────────────────────────────────
//  Panier — miroir de CartResponseDto
// ─────────────────────────────────────────────
export interface CartItemDto {
  productBoutiqueId: string;
  productId?: string | undefined;
  productName?: string | undefined;
  urlImages: string[];
  /** Prix courant de l'offre, indicatif. */
  price: number;
  discountPrice?: number | null | undefined;
  /** Prix figé au moment de l'ajout. */
  unitPrice: number;
  quantity: number;
  stock: number;
  lineTotal: number;
}

export interface CartDto {
  id: string;
  userId: string;
  items: CartItemDto[];
  totalItems: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

const ensureCart = (userId: string) => {
  const db = readDb();
  let cart = db.carts.find((entry) => entry.userId === userId);
  if (!cart) {
    const now = new Date().toISOString();
    cart = {
      id: `cart-${userId}`,
      userId,
      items: [],
      amount: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.carts.push(cart);
  }
  return { db, cart };
};

/** `amount` = somme des (prix figé x quantité), comme `recomputeAmount`. */
const recomputeAmount = (cart: {
  items: { quantity: number; price: number }[];
  amount: number;
}) => {
  cart.amount = cart.items.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );
};

const toCartDto = (cart: {
  id: string;
  userId: string;
  items: { productBoutiqueId: string; quantity: number; price: number }[];
  amount: number;
  createdAt: string;
  updatedAt: string;
}): CartDto => {
  const items: CartItemDto[] = cart.items.map((item) => {
    const pb = findLiveOffer(item.productBoutiqueId);

    // `unitPrice` est le prix figé ; `price` et `discountPrice` sont les prix
    // courants. Le DTO expose les deux, donc l'écart est affichable.
    const unitPrice = item.price;

    return {
      productBoutiqueId: item.productBoutiqueId,
      productId: pb?.productId,
      productName: pb?.product?.name,
      urlImages: pb?.urlImages ?? [],
      price: pb?.price ?? unitPrice,
      ...(pb?.discountPrice != null ? { discountPrice: pb.discountPrice } : {}),
      unitPrice,
      quantity: item.quantity,
      stock: pb?.stock ?? 0,
      lineTotal: unitPrice * item.quantity,
    };
  });

  return {
    id: cart.id,
    userId: cart.userId,
    items,
    totalItems: items.reduce((total, item) => total + item.quantity, 0),
    totalAmount: cart.amount,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
};

export const getCart = (userId: string): ApiResponse<CartDto> => {
  requireSelf(userId);
  const { db, cart } = ensureCart(userId);
  writeDb(db);
  return ok(toCartDto(cart), "Panier récupéré avec succès");
};

export const addToCart = (
  userId: string,
  body: { productBoutiqueId: string; quantity?: number }
): ApiResponse<CartDto> => {
  requireSelf(userId);
  findUser(userId);

  const pb = findOffer(body.productBoutiqueId);
  const quantity = body.quantity ?? 1;

  const { db, cart } = ensureCart(userId);
  const existing = cart.items.find(
    (item) => item.productBoutiqueId === body.productBoutiqueId
  );
  const newQuantity = (existing?.quantity ?? 0) + quantity;

  // Le back répond 400 — et non 409 — sur un stock insuffisant.
  if (newQuantity > pb.stock) {
    throw new ApiError(`Stock insuffisant (disponible : ${pb.stock})`, 400);
  }

  const unitPrice = pb.discountPrice ?? pb.price;

  if (existing) {
    existing.quantity = newQuantity;
    // Un réajout rafraîchit le prix figé au prix courant.
    existing.price = unitPrice;
  } else {
    cart.items.push({ productBoutiqueId: pb.id, quantity, price: unitPrice });
  }

  recomputeAmount(cart);
  cart.updatedAt = new Date().toISOString();
  writeDb(db);

  return ok(toCartDto(cart), "Article ajouté au panier avec succès");
};

export const updateCartItem = (
  userId: string,
  productBoutiqueId: string,
  body: { quantity: number }
): ApiResponse<CartDto> => {
  requireSelf(userId);

  const db = readDb();
  const cart = db.carts.find((entry) => entry.userId === userId);
  if (!cart) throw new ApiError("Panier introuvable", 404);

  const index = cart.items.findIndex(
    (item) => item.productBoutiqueId === productBoutiqueId
  );
  if (index === -1) throw new ApiError("Article introuvable dans le panier", 404);

  // Quantité nulle : l'article sort du panier.
  if (body.quantity === 0) {
    cart.items.splice(index, 1);
  } else {
    const pb = findOffer(productBoutiqueId);
    if (body.quantity > pb.stock) {
      throw new ApiError(`Stock insuffisant (disponible : ${pb.stock})`, 400);
    }
    cart.items[index]!.quantity = body.quantity;
  }

  recomputeAmount(cart);
  cart.updatedAt = new Date().toISOString();
  writeDb(db);

  return ok(toCartDto(cart), "Panier mis à jour avec succès");
};

export const removeFromCart = (
  userId: string,
  productBoutiqueId: string
): ApiResponse<CartDto> => {
  requireSelf(userId);

  const db = readDb();
  const cart = db.carts.find((entry) => entry.userId === userId);
  if (!cart) throw new ApiError("Panier introuvable", 404);

  const index = cart.items.findIndex(
    (item) => item.productBoutiqueId === productBoutiqueId
  );
  if (index === -1) throw new ApiError("Article introuvable dans le panier", 404);

  cart.items.splice(index, 1);
  recomputeAmount(cart);
  cart.updatedAt = new Date().toISOString();
  writeDb(db);

  return ok(toCartDto(cart), "Article retiré du panier avec succès");
};

export const clearCart = (userId: string): ApiResponse<CartDto> => {
  requireSelf(userId);

  const { db, cart } = ensureCart(userId);
  cart.items = [];
  cart.amount = 0;
  cart.updatedAt = new Date().toISOString();
  writeDb(db);

  return ok(toCartDto(cart), "Panier vidé avec succès");
};

// ─────────────────────────────────────────────
//  POST /cart/:userId/delivery-quote   { deliveries?, deliveryMethod? }
//  Même calcul que le checkout du back : une livraison par boutique, les
//  frais décidés ici. Le corps ne porte que des modes ; tout montant envoyé
//  est ignoré.
// ─────────────────────────────────────────────
const MODES_MESSAGE = `Mode de livraison invalide. Valeurs autorisées : ${DELIVERY_MODES.join(", ")}.`;

export const deliveryQuote = (
  userId: string,
  body: { deliveries?: unknown; deliveryMethod?: unknown } = {}
): ApiResponse<DeliveryQuote> => {
  requireSelf(userId);

  // Contrôles de forme de deliverySelectionFields : 422, messages joints.
  const errors: string[] = [];
  if (body.deliveryMethod !== undefined && !isDeliveryMode(body.deliveryMethod)) errors.push(MODES_MESSAGE);
  if (body.deliveries !== undefined && !Array.isArray(body.deliveries)) {
    errors.push("deliveries doit être une liste { boutiqueId, method }.");
  }
  const entries = Array.isArray(body.deliveries)
    ? (body.deliveries as { boutiqueId?: unknown; method?: unknown }[])
    : [];
  for (const entry of entries) {
    if (typeof entry?.boutiqueId !== "string" || !entry.boutiqueId) {
      errors.push("Identifiant de boutique invalide dans deliveries.");
    }
    if (!isDeliveryMode(entry?.method)) errors.push(MODES_MESSAGE);
  }
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);

  const cart = readDb().carts.find((entry) => entry.userId === userId);
  if (!cart || cart.items.length === 0) {
    return ok(
      { groups: [], shippingFee: 0, ready: false, currency: CURRENCY, subtotal: 0, total: 0 },
      "Panier vide : aucune livraison à calculer"
    );
  }

  // Une offre retirée de la vente n'a plus de livraison : elle est ignorée.
  const lines = cart.items.flatMap((item) => {
    const offer = findLiveOffer(item.productBoutiqueId);
    return offer ? [{ offer, quantity: item.quantity }] : [];
  });

  const byShop: Record<string, DeliveryMode> = {};
  for (const entry of entries) byShop[String(entry.boutiqueId)] = entry.method as DeliveryMode;

  const quote = quoteDelivery(lines, {
    byShop,
    all: isDeliveryMode(body.deliveryMethod) ? body.deliveryMethod : undefined,
  });

  return ok(
    // Coupon exclu : il ne s'applique qu'au checkout, sur les articles.
    { ...quote, subtotal: cart.amount, total: cart.amount + quote.shippingFee },
    "Devis de livraison calculé"
  );
};

// ─────────────────────────────────────────────
//  Favoris — miroir de WishlistResponseDto.
//  Contrairement au panier, les items imbriquent l'offre complète.
// ─────────────────────────────────────────────
export interface WishlistItemDto {
  productBoutiqueId: string;
  productBoutique?: ProductBoutique | undefined;
}

export interface WishlistDto {
  id: string;
  userId: string;
  items: WishlistItemDto[];
  totalItems: number;
  createdAt: string;
  updatedAt: string;
}

const ensureWishlist = (userId: string) => {
  const db = readDb();
  let wishlist = db.wishlists.find((entry) => entry.userId === userId);
  if (!wishlist) {
    const now = new Date().toISOString();
    wishlist = { id: `wish-${userId}`, userId, items: [], createdAt: now, updatedAt: now };
    db.wishlists.push(wishlist);
  }
  return { db, wishlist };
};

const toWishlistDto = (wishlist: {
  id: string;
  userId: string;
  items: { productBoutiqueId: string }[];
  createdAt: string;
  updatedAt: string;
}): WishlistDto => {
  const items: WishlistItemDto[] = wishlist.items.map((item) => {
    const pb = findLiveOffer(item.productBoutiqueId);
    return {
      productBoutiqueId: item.productBoutiqueId,
      ...(pb ? { productBoutique: pb } : {}),
    };
  });

  return {
    id: wishlist.id,
    userId: wishlist.userId,
    items,
    totalItems: items.length,
    createdAt: wishlist.createdAt,
    updatedAt: wishlist.updatedAt,
  };
};

export const getWishlist = (userId: string): ApiResponse<WishlistDto> => {
  requireSelf(userId);
  const { db, wishlist } = ensureWishlist(userId);
  writeDb(db);
  return ok(toWishlistDto(wishlist), "Favoris récupérés avec succès");
};

export const addToWishlist = (
  userId: string,
  body: { productBoutiqueId: string }
): ApiResponse<WishlistDto> => {
  requireSelf(userId);
  findUser(userId);

  const pb = findOffer(body.productBoutiqueId);
  const { db, wishlist } = ensureWishlist(userId);

  // L'ajout est idempotent : un doublon n'est pas une erreur, seul le
  // message change.
  const dejaPresent = wishlist.items.some((item) => item.productBoutiqueId === pb.id);
  if (!dejaPresent) {
    wishlist.items.push({ productBoutiqueId: pb.id });
    wishlist.updatedAt = new Date().toISOString();
  }

  writeDb(db);

  return ok(
    toWishlistDto(wishlist),
    dejaPresent
      ? "Ce produit est déjà dans les favoris"
      : "Produit ajouté aux favoris avec succès"
  );
};

export const removeFromWishlist = (
  userId: string,
  productBoutiqueId: string
): ApiResponse<WishlistDto> => {
  requireSelf(userId);

  const db = readDb();
  const wishlist = db.wishlists.find((entry) => entry.userId === userId);
  if (!wishlist) throw new ApiError("Favoris introuvables", 404);

  const index = wishlist.items.findIndex(
    (item) => item.productBoutiqueId === productBoutiqueId
  );
  if (index === -1) throw new ApiError("Article introuvable dans les favoris", 404);

  wishlist.items.splice(index, 1);
  wishlist.updatedAt = new Date().toISOString();
  writeDb(db);

  return ok(toWishlistDto(wishlist), "Produit retiré des favoris avec succès");
};

export const clearWishlist = (userId: string): ApiResponse<WishlistDto> => {
  requireSelf(userId);

  const { db, wishlist } = ensureWishlist(userId);
  wishlist.items = [];
  wishlist.updatedAt = new Date().toISOString();
  writeDb(db);

  return ok(toWishlistDto(wishlist), "Favoris vidés avec succès");
};
