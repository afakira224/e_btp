import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import { Wishlist, type IWishlist } from "../models/wishlist.model.js";
import { Product, productBoutique } from "../models/product.model.js";
import { Shop } from "../models/boutique.model.js";
import { Famille } from "../models/famille.model.js";
import { Categorie } from "../models/categorie.model.js";
import { SousCategorie } from "../models/sousCategorie.model.js";
import { User } from "../models/user.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { toWishlistResponseDto } from "../shared/interfaces/Wishlist.interfaces.js";

// Résout les documents référencés par la wishlist et construit le DTO enrichi.
const buildWishlistDto = async (wishlist: IWishlist) => {
  const pbIds = wishlist.items.map((i) => i.productBoutiqueId);
  const productBoutiques = pbIds.length
    ? await productBoutique.find({ _id: { $in: pbIds } })
    : [];

  const shopIds = [...new Set(productBoutiques.map((pb) => pb.boutiqueId?.toString()).filter(Boolean))];
  const productIds = [...new Set(productBoutiques.map((pb) => pb.productId?.toString()).filter(Boolean))];

  const [shops, products] = await Promise.all([
    Shop.find({ _id: { $in: shopIds } }),
    Product.find({ _id: { $in: productIds } }),
  ]);

  const familleIds = [...new Set(products.map((p) => p.familleId?.toString()).filter(Boolean))];
  const categoryIds = [...new Set(products.map((p) => p.categoryId?.toString()).filter(Boolean))];
  const sousCategoryIds = [...new Set(products.map((p) => p.sousCategoryId?.toString()).filter(Boolean))];

  const [familles, categories, sousCategories] = await Promise.all([
    Famille.find({ _id: { $in: familleIds } }),
    Categorie.find({ _id: { $in: categoryIds } }),
    SousCategorie.find({ _id: { $in: sousCategoryIds } }),
  ]);

  return toWishlistResponseDto(wishlist, productBoutiques, shops, products, familles, categories, sousCategories);
};

// ─────────────────────────────────────────────
//  GET /wishlist/:userId
// ─────────────────────────────────────────────
export const getWishlist = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const userId = String(req.params.userId);

    const wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      logger.info(`Wishlist vide pour utilisateur : ${userId}`);
      const response = BaseResponse.WithSuccess(
        { id: null, userId, items: [], totalItems: 0 },
        "Liste de favoris récupérée avec succès"
      );
      return res.status(response.statusCode).json(response);
    }

    const dto = await buildWishlistDto(wishlist);

    logger.info(`Wishlist récupérée pour utilisateur : ${userId} (${dto.totalItems} article(s))`);

    const response = BaseResponse.WithSuccess(dto, "Liste de favoris récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération wishlist : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  POST /wishlist/:userId/items  { productBoutiqueId }
//  Idempotent : ajouter un produit déjà présent ne crée pas de doublon.
// ─────────────────────────────────────────────
export const addToWishlist = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const userId = String(req.params.userId);
    const { productBoutiqueId } = req.body;

    logger.info(`Ajout aux favoris : produit ${productBoutiqueId} (utilisateur ${userId})`);

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

    let wishlist = await Wishlist.findOne({ userId }).session(session);
    if (!wishlist) {
      wishlist = new Wishlist({ userId, items: [] });
    }

    const alreadyPresent = wishlist.items.some(
      (i) => i.productBoutiqueId.toString() === productBoutiqueId
    );
    if (!alreadyPresent) {
      wishlist.items.push({ productBoutiqueId: pb._id });
    }

    await wishlist.save({ session });
    await session.commitTransaction();

    const dto = await buildWishlistDto(wishlist);

    logger.info(`Favori ${alreadyPresent ? "déjà présent" : "ajouté"} pour ${userId}`);

    const response = BaseResponse.WithSuccess(
      dto,
      alreadyPresent ? "Ce produit est déjà dans les favoris" : "Produit ajouté aux favoris avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur ajout aux favoris : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /wishlist/:userId/items/:productBoutiqueId
// ─────────────────────────────────────────────
export const removeFromWishlist = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const userId = String(req.params.userId);

    const productBoutiqueId = String(req.params.productBoutiqueId);

    logger.info(`Retrait des favoris : produit ${productBoutiqueId} (utilisateur ${userId})`);

    const wishlist = await Wishlist.findOne({ userId }).session(session);
    if (!wishlist) {
      await session.abortTransaction();
      logger.warn(`Wishlist introuvable pour utilisateur : ${userId}`);
      const response = BaseResponse.NotFound("Liste de favoris introuvable");
      return res.status(response.statusCode).json(response);
    }

    const index = wishlist.items.findIndex(
      (i) => i.productBoutiqueId.toString() === productBoutiqueId
    );
    if (index === -1) {
      await session.abortTransaction();
      logger.warn(`Article introuvable dans les favoris : ${productBoutiqueId}`);
      const response = BaseResponse.NotFound("Article introuvable dans les favoris");
      return res.status(response.statusCode).json(response);
    }

    wishlist.items.splice(index, 1);

    await wishlist.save({ session });
    await session.commitTransaction();

    const dto = await buildWishlistDto(wishlist);

    logger.info(`Favori retiré pour ${userId}`);

    const response = BaseResponse.WithSuccess(dto, "Produit retiré des favoris avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur retrait des favoris : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /wishlist/:userId  (vider les favoris)
// ─────────────────────────────────────────────
export const clearWishlist = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const userId = String(req.params.userId);

    logger.info(`Vidage des favoris (utilisateur ${userId})`);

    const wishlist = await Wishlist.findOne({ userId }).session(session);
    if (!wishlist) {
      await session.abortTransaction();
      logger.warn(`Wishlist introuvable pour utilisateur : ${userId}`);
      const response = BaseResponse.NotFound("Liste de favoris introuvable");
      return res.status(response.statusCode).json(response);
    }

    wishlist.items.splice(0, wishlist.items.length);

    await wishlist.save({ session });
    await session.commitTransaction();

    logger.info(`Favoris vidés pour ${userId}`);

    const dto = await buildWishlistDto(wishlist);

    const response = BaseResponse.WithSuccess(dto, "Liste de favoris vidée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur vidage favoris : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};
