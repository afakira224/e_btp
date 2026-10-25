import type { ProductBoutique } from "../../../entities/product";
import type { Shop } from "../../../entities/shop";
import { OFFERS, PRODUCTS, SHOPS } from "./catalogSeed";
import {
  resolveEffective,
  seedOfferDelivery,
  seedShopDelivery,
  toSettingsDto,
} from "./deliveryRules";
import { readDb, type MockOffer, type MockProductDelivery, type MockShopDelivery } from "./mockDb";

// ─────────────────────────────────────────────
//  Catalogue vivant.
//
//  catalogSeed.ts décrit le catalogue de départ, figé. Ce qu'en font les
//  vendeurs — réglages de livraison, prix, stock, offres ajoutées — vit dans
//  la base simulée et s'applique ici, à chaque lecture. Toutes les routes
//  simulées lisent ce catalogue-là : la fiche produit, le panier et le devis
//  de livraison voient donc la même chose que l'espace vendeur.
// ─────────────────────────────────────────────

/** Réglages courants d'une boutique : ceux qu'elle a enregistrés, sinon ceux de départ. */
export const shopDeliveryOf = (shopId: string): MockShopDelivery =>
  readDb().shopDeliveries[shopId] ?? seedShopDelivery(shopId);

/** Boutique telle que toShopResponseDto l'imbrique : avec ses réglages de livraison. */
export const liveShop = (shop: Shop): Shop => ({
  ...shop,
  delivery: toSettingsDto(shopDeliveryOf(shop.id)),
});

/**
 * Toutes les boutiques : celles du catalogue de départ, modifications de
 * leurs gérants appliquées, puis celles que l'administration a ouvertes.
 */
export const allShops = (): Shop[] => {
  const db = readDb();
  return [...SHOPS.map((shop) => ({ ...shop, ...db.shopPatches[shop.id] })), ...db.shops];
};

export const findShop = (id: string): Shop | undefined => {
  const shop = allShops().find((candidate) => candidate.id === id);
  return shop ? liveShop(shop) : undefined;
};

/**
 * Document Mongoose tel que `getShops`, `getShopById` et `updateShop` le
 * renvoient, sans passer par toShopResponseDto : `_id` au lieu de `id`, plus
 * `deletedAt` et `__v`, et la livraison en sous-document brut (modes et
 * tarif, sans les `options` du DTO).
 */
export const rawShop = (shop: Shop) => {
  const { id, ...rest } = shop;
  return { _id: id, ...rest, delivery: shopDeliveryOf(id), deletedAt: null, __v: 0 };
};

/** Configuration propre ou héritage d'une offre, telle qu'elle est stockée. */
export const offerDeliveryOf = (offerId: string): MockProductDelivery => {
  const db = readDb();
  return (
    db.offers.find((offer) => offer.id === offerId)?.delivery ??
    db.offerPatches[offerId]?.delivery ??
    seedOfferDelivery(offerId)
  );
};

/** `discountPrice` absent — et non `null` — quand il n'y a pas de remise. */
const withDiscount = (discountPrice: number | null | undefined) =>
  discountPrice != null ? { discountPrice } : {};

const fromSeed = (offer: ProductBoutique, shops: Map<string, Shop>): ProductBoutique => {
  const patch = readDb().offerPatches[offer.id];
  const boutique = offer.boutique ? shops.get(offer.boutique.id) : undefined;
  const { discountPrice: seedDiscount, ...rest } = offer;
  const discountPrice = patch && "discountPrice" in patch ? patch.discountPrice : seedDiscount;

  return {
    ...rest,
    ...(boutique ? { boutique } : {}),
    urlImages: patch?.urlImages ?? offer.urlImages,
    price: patch?.price ?? offer.price,
    ...withDiscount(discountPrice),
    stock: patch?.stock ?? offer.stock,
    updatedAt: patch?.updatedAt ?? offer.updatedAt,
    ...(boutique
      ? { delivery: resolveEffective(offerDeliveryOf(offer.id), shopDeliveryOf(boutique.id)) }
      : {}),
  };
};

const fromSeller = (offer: MockOffer, shops: Map<string, Shop>): ProductBoutique => {
  const boutique = shops.get(offer.boutiqueId);
  return {
    id: offer.id,
    productId: offer.productId,
    ...(boutique ? { boutique } : {}),
    product: PRODUCTS.find((product) => product.id === offer.productId),
    urlImages: offer.urlImages,
    price: offer.price,
    ...withDiscount(offer.discountPrice),
    stock: offer.stock,
    isFeatured: false,
    tags: [],
    rating: 0,
    reviewsCount: 0,
    ...(boutique ? { delivery: resolveEffective(offer.delivery, shopDeliveryOf(boutique.id)) } : {}),
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
};

/** Toutes les offres, réglages des vendeurs appliqués. Les plus récentes d'abord. */
export const liveCatalog = (): ProductBoutique[] => {
  const shops = new Map(allShops().map((shop) => [shop.id, liveShop(shop)]));
  const added = [...readDb().offers]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((offer) => fromSeller(offer, shops));
  return [...added, ...OFFERS.map((offer) => fromSeed(offer, shops))];
};

export const findLiveOffer = (id: string): ProductBoutique | undefined =>
  liveCatalog().find((offer) => offer.id === id);
