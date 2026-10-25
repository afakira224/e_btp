import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import { Review } from "../models/review.model.js";
import { productBoutique } from "../models/product.model.js";
import { User } from "../models/user.model.js";
import { Order, ORDER_STATUSES_WITHOUT_SALE } from "../models/order.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { toReviewResponseDto, type ReviewSummaryDto } from "../shared/interfaces/Review.interfaces.js";

// Recalcule la note moyenne et le nombre d'avis du product_boutique à partir des avis actifs.
const recomputeRating = async (
  productBoutiqueId: mongoose.Types.ObjectId | string,
  session: mongoose.ClientSession
): Promise<void> => {
  const reviews = await Review.find({ productBoutiqueId }).session(session);
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;

  const pb = await productBoutique.findById(productBoutiqueId).session(session);
  if (pb) {
    pb.rating = Math.round(average * 10) / 10; // 1 décimale
    pb.reviewsCount = count;
    await pb.save({ session });
  }
};

// ─────────────────────────────────────────────
//  POST /reviews  { userId, productBoutiqueId, rating, comment? }
// ─────────────────────────────────────────────
export const createReview = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const { userId, productBoutiqueId, rating, comment } = req.body;

    logger.info(`Création avis : produit ${productBoutiqueId} par ${userId} (note ${rating})`);

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      logger.warn(`Utilisateur introuvable : ${userId}`);
      const response = BaseResponse.NotFound("Utilisateur introuvable");
      return res.status(response.statusCode).json(response);
    }

    const pb = await productBoutique.findById(productBoutiqueId).session(session);
    if (!pb) {
      await session.abortTransaction();
      logger.warn(`Produit en boutique introuvable : ${productBoutiqueId}`);
      const response = BaseResponse.NotFound("Produit en boutique introuvable");
      return res.status(response.statusCode).json(response);
    }

    const existing = await Review.findOne({ userId, productBoutiqueId }).session(session);
    if (existing) {
      await session.abortTransaction();
      logger.warn(`Avis déjà existant : ${userId} / ${productBoutiqueId}`);
      const response = BaseResponse.Conflict("Vous avez déjà laissé un avis pour ce produit. Modifiez-le plutôt.");
      return res.status(response.statusCode).json(response);
    }

    // Achat vérifié : l'utilisateur a une commande (non annulée) contenant ce produit.
    const purchase = await Order.findOne({
      userId,
      "items.productBoutiqueId": productBoutiqueId,
      status: { $nin: ORDER_STATUSES_WITHOUT_SALE },
    }).session(session);

    const [review] = await Review.create(
      [{ userId, productBoutiqueId, rating, comment, verifiedPurchase: !!purchase }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!review) throw new Error("La création de l'avis a échoué.");

    await recomputeRating(productBoutiqueId, session);

    await session.commitTransaction();

    logger.info(`Avis créé : ${review._id}`);

    const response = BaseResponse.Created(toReviewResponseDto(review, user), "Avis publié avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur création avis : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  GET /reviews?productBoutiqueId=&userId=&page=&limit=
// ─────────────────────────────────────────────
export const getReviews = async (req: Request, res: Response) => {
  try {
    const { productBoutiqueId, userId, page = "1", limit = "10" } = req.query;

    const filter: Record<string, unknown> = {};
    if (productBoutiqueId) filter.productBoutiqueId = productBoutiqueId;
    if (userId) filter.userId = userId;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const [reviews, total] = await Promise.all([
      Review.find(filter).skip(skip).limit(limitNum).sort({ createdAt: -1 }),
      Review.countDocuments(filter),
    ]);

    const userIds = [...new Set(reviews.map(r => r.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } });

    const reviewsDto = reviews.map(r =>
      toReviewResponseDto(r, users.find(u => u._id.toString() === r.userId.toString()))
    );

    logger.info(`Liste avis — total : ${total}`);

    const response = BaseResponse.WithSuccess(
      {
        reviews: reviewsDto,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Avis récupérés avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste avis : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /reviews/:id
// ─────────────────────────────────────────────
export const getReviewById = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);

    const review = await Review.findById(id);
    if (!review) {
      logger.warn(`Avis introuvable : ${id}`);
      const response = BaseResponse.NotFound("Avis non trouvé");
      return res.status(response.statusCode).json(response);
    }

    const user = await User.findById(review.userId);

    const response = BaseResponse.WithSuccess(toReviewResponseDto(review, user ?? undefined), "Avis récupéré avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération avis : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  PUT /reviews/:id  { rating?, comment? }
// ─────────────────────────────────────────────
export const updateReview = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);
    const { rating, comment } = req.body;

    logger.info(`Mise à jour avis : ${id}`);

    const review = await Review.findById(id).session(session);
    if (!review) {
      await session.abortTransaction();
      logger.warn(`Avis introuvable pour mise à jour : ${id}`);
      const response = BaseResponse.NotFound("Avis non trouvé");
      return res.status(response.statusCode).json(response);
    }

    if (rating !== undefined) review.rating = rating;
    if (comment !== undefined) review.comment = comment;

    await review.save({ session });

    // La note a pu changer : on recalcule l'agrégat du produit.
    await recomputeRating(review.productBoutiqueId, session);

    await session.commitTransaction();

    logger.info(`Avis mis à jour : ${id}`);

    const user = await User.findById(review.userId);

    const response = BaseResponse.WithSuccess(toReviewResponseDto(review, user ?? undefined), "Avis mis à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur mise à jour avis : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /reviews/:id (soft delete)
// ─────────────────────────────────────────────
export const deleteReview = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);

    logger.info(`Suppression avis : ${id}`);

    const review = await Review.findById(id).session(session);
    if (!review) {
      await session.abortTransaction();
      logger.warn(`Avis introuvable pour suppression : ${id}`);
      const response = BaseResponse.NotFound("Avis non trouvé");
      return res.status(response.statusCode).json(response);
    }

    review.deletedAt = new Date();
    await review.save({ session });

    await recomputeRating(review.productBoutiqueId, session);

    await session.commitTransaction();

    logger.info(`Avis supprimé (soft) : ${id}`);

    const response = BaseResponse.WithSuccess(null, "Avis supprimé avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur suppression avis : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  GET /reviews/summary/:productBoutiqueId
//  Moyenne, total et répartition par étoile.
// ─────────────────────────────────────────────
export const getReviewSummary = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const productBoutiqueId = String(req.params.productBoutiqueId);

    const reviews = await Review.find({ productBoutiqueId });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of reviews) {
      distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
      sum += r.rating;
    }

    const total = reviews.length;
    const average = total ? Math.round((sum / total) * 10) / 10 : 0;

    const summary: ReviewSummaryDto = {
      productBoutiqueId,
      average,
      total,
      distribution,
    };

    logger.info(`Résumé avis pour ${productBoutiqueId} : ${total} avis, moyenne ${average}`);

    const response = BaseResponse.WithSuccess(summary, "Résumé des avis récupéré avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur résumé avis : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};
