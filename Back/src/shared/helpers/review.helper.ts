import type mongoose from "mongoose";
import { Review } from "../../models/review.model.js";
import { productBoutique } from "../../models/product.model.js";

/** Avis visibles du public : ni supprimés (filtre du modèle), ni masqués par la modération. */
export const VISIBLE_REVIEW = { hiddenAt: null } as const;

// Recalcule la note moyenne et le nombre d'avis du product_boutique à partir
// des avis actifs : un avis masqué par la modération ne compte plus.
export const recomputeRating = async (
  productBoutiqueId: mongoose.Types.ObjectId | string,
  session?: mongoose.ClientSession
): Promise<void> => {
  const query = Review.find({ productBoutiqueId, ...VISIBLE_REVIEW });
  const reviews = session ? await query.session(session) : await query;
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;

  const offerQuery = productBoutique.findById(productBoutiqueId);
  const pb = session ? await offerQuery.session(session) : await offerQuery;
  if (pb) {
    pb.rating = Math.round(average * 10) / 10; // 1 décimale
    pb.reviewsCount = count;
    await pb.save(session ? { session } : {});
  }
};
