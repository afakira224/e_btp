// ─────────────────────────────────────────────
//  REVIEW - RESPONSE DTO
// ─────────────────────────────────────────────

import type { IReview } from "../../models/review.model.js";
import type { IUser } from "../../models/user.model.js";

export interface ReviewResponseDto {
  id: string;
  userId: string;
  userName?: string | undefined;
  productBoutiqueId: string;
  rating: number;
  comment?: string | undefined;
  verifiedPurchase: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const toReviewResponseDto = (review: IReview, user?: IUser): ReviewResponseDto => ({
  id: review._id.toString(),
  userId: review.userId.toString(),
  userName: user ? `${user.prenom ?? ""} ${user.nom ?? ""}`.trim() || undefined : undefined,
  productBoutiqueId: review.productBoutiqueId.toString(),
  rating: review.rating,
  comment: review.comment,
  verifiedPurchase: review.verifiedPurchase,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
});

// Résumé des notes d'un product_boutique : moyenne, total, répartition par étoile.
export interface ReviewSummaryDto {
  productBoutiqueId: string;
  average: number;
  total: number;
  distribution: Record<number, number>; // { 1: n, 2: n, ..., 5: n }
}
