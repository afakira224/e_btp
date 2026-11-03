import { Types } from "mongoose";
import { Product, productBoutique } from "../../models/product.model.js";
import type { PromotionOfferDto } from "../interfaces/ShopPromotion.interfaces.js";

/** Nom, prix et photo d'offres, pour les listes des promotions et des boosts. */
export const offerSummaries = async (ids: readonly unknown[]): Promise<Map<string, PromotionOfferDto>> => {
  const unique = [...new Set(ids.map(String))].filter((id) => Types.ObjectId.isValid(id));
  if (unique.length === 0) return new Map();
  const offers = await productBoutique.find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) } });
  const products = await Product.find({ _id: { $in: offers.map((offer) => offer.productId) } });
  return new Map(
    offers.map((offer) => {
      const product = products.find((candidate) => String(candidate._id) === String(offer.productId));
      return [
        String(offer._id),
        { id: String(offer._id), name: product?.name ?? "Produit", price: offer.price, ...(offer.urlImages[0] ? { image: offer.urlImages[0] } : {}) },
      ];
    })
  );
};

export const pick = (map: Map<string, PromotionOfferDto>, ids: readonly unknown[]): PromotionOfferDto[] =>
  ids.map(String).flatMap((id) => (map.has(id) ? [map.get(id)!] : []));
