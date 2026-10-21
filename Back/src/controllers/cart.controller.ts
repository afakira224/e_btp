import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import { Cart, type ICart } from "../models/cart.model.js";
import { Product, productBoutique } from "../models/product.model.js";
import { User } from "../models/user.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { toCartResponseDto } from "../shared/interfaces/Cart.interfaces.js";

// Recalcule le montant total du panier à partir des prix figés de chaque item.
const recomputeAmount = (cart: ICart): void => {
  cart.amount = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
};

// Enrichit un panier avec les product_boutiques et produits associés pour construire le DTO.
const buildCartDto = async (cart: ICart) => {
  const pbIds = cart.items.map((i) => i.productBoutiqueId);
  const productBoutiques = pbIds.length
    ? await productBoutique.find({ _id: { $in: pbIds } })
    : [];
  const productIds = productBoutiques.map((pb) => pb.productId);
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
    : [];
  return toCartResponseDto(cart, productBoutiques, products);
};

// ─────────────────────────────────────────────
//  GET /cart/:userId
// ─────────────────────────────────────────────
export const getCart = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const userId = String(req.params.userId);

    const cart = await Cart.findOne({ userId });

    // Aucun panier encore créé : on renvoie un panier vide sans persister de document.
    if (!cart) {
      logger.info(`Panier vide pour utilisateur : ${userId}`);
      const response = BaseResponse.WithSuccess(
        { id: null, userId, items: [], totalItems: 0, totalAmount: 0 },
        "Panier récupéré avec succès"
      );
      return res.status(response.statusCode).json(response);
    }

    const dto = await buildCartDto(cart);

    logger.info(`Panier récupéré pour utilisateur : ${userId} (${dto.totalItems} article(s))`);

    const response = BaseResponse.WithSuccess(dto, "Panier récupéré avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération panier : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  POST /cart/:userId/items  { productBoutiqueId, quantity? }
// ─────────────────────────────────────────────
export const addToCart = async (req: Request, res: Response) => {
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
    const quantity: number = req.body.quantity ?? 1;

    logger.info(`Ajout au panier : produit ${productBoutiqueId} x${quantity} (utilisateur ${userId})`);

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

    let cart = await Cart.findOne({ userId }).session(session);
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existing = cart.items.find(
      (i) => i.productBoutiqueId.toString() === productBoutiqueId
    );
    const newQuantity = (existing?.quantity ?? 0) + quantity;

    if (newQuantity > pb.stock) {
      await session.abortTransaction();
      logger.warn(`Stock insuffisant pour ${productBoutiqueId} : demandé ${newQuantity}, dispo ${pb.stock}`);
      const response = BaseResponse.BadRequest(`Stock insuffisant (disponible : ${pb.stock})`);
      return res.status(response.statusCode).json(response);
    }

    const unitPrice = pb.discountPrice ?? pb.price;

    if (existing) {
      existing.quantity = newQuantity;
      existing.price = unitPrice; // rafraîchit le prix figé au prix courant
    } else {
      cart.items.push({ productBoutiqueId: pb._id, quantity, price: unitPrice });
    }

    recomputeAmount(cart);

    await cart.save({ session });
    await session.commitTransaction();

    const dto = await buildCartDto(cart);

    logger.info(`Article ajouté au panier de ${userId}`);

    const response = BaseResponse.WithSuccess(dto, "Article ajouté au panier avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur ajout au panier : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  PUT /cart/:userId/items/:productBoutiqueId  { quantity }
//  quantity = 0 retire l'article du panier.
// ─────────────────────────────────────────────
export const updateCartItem = async (req: Request, res: Response) => {
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
    const quantity: number = req.body.quantity;

    logger.info(`Mise à jour panier : produit ${productBoutiqueId} → quantité ${quantity} (utilisateur ${userId})`);

    const cart = await Cart.findOne({ userId }).session(session);
    if (!cart) {
      await session.abortTransaction();
      logger.warn(`Panier introuvable pour utilisateur : ${userId}`);
      const response = BaseResponse.NotFound("Panier introuvable");
      return res.status(response.statusCode).json(response);
    }

    const index = cart.items.findIndex(
      (i) => i.productBoutiqueId.toString() === productBoutiqueId
    );
    if (index === -1) {
      await session.abortTransaction();
      logger.warn(`Article introuvable dans le panier : ${productBoutiqueId}`);
      const response = BaseResponse.NotFound("Article introuvable dans le panier");
      return res.status(response.statusCode).json(response);
    }

    if (quantity === 0) {
      cart.items.splice(index, 1);
    } else {
      const pb = await productBoutique.findById(productBoutiqueId).session(session);
      if (!pb) {
        await session.abortTransaction();
        logger.warn(`Produit en boutique introuvable : ${productBoutiqueId}`);
        const response = BaseResponse.NotFound("Produit en boutique introuvable");
        return res.status(response.statusCode).json(response);
      }
      if (quantity > pb.stock) {
        await session.abortTransaction();
        logger.warn(`Stock insuffisant pour ${productBoutiqueId} : demandé ${quantity}, dispo ${pb.stock}`);
        const response = BaseResponse.BadRequest(`Stock insuffisant (disponible : ${pb.stock})`);
        return res.status(response.statusCode).json(response);
      }
      cart.items[index]!.quantity = quantity;
    }

    recomputeAmount(cart);

    await cart.save({ session });
    await session.commitTransaction();

    const dto = await buildCartDto(cart);

    logger.info(`Panier mis à jour pour ${userId}`);

    const response = BaseResponse.WithSuccess(dto, "Panier mis à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur mise à jour panier : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /cart/:userId/items/:productBoutiqueId
// ─────────────────────────────────────────────
export const removeFromCart = async (req: Request, res: Response) => {
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

    logger.info(`Retrait du panier : produit ${productBoutiqueId} (utilisateur ${userId})`);

    const cart = await Cart.findOne({ userId }).session(session);
    if (!cart) {
      await session.abortTransaction();
      logger.warn(`Panier introuvable pour utilisateur : ${userId}`);
      const response = BaseResponse.NotFound("Panier introuvable");
      return res.status(response.statusCode).json(response);
    }

    const index = cart.items.findIndex(
      (i) => i.productBoutiqueId.toString() === productBoutiqueId
    );
    if (index === -1) {
      await session.abortTransaction();
      logger.warn(`Article introuvable dans le panier : ${productBoutiqueId}`);
      const response = BaseResponse.NotFound("Article introuvable dans le panier");
      return res.status(response.statusCode).json(response);
    }

    cart.items.splice(index, 1);

    recomputeAmount(cart);

    await cart.save({ session });
    await session.commitTransaction();

    const dto = await buildCartDto(cart);

    logger.info(`Article retiré du panier de ${userId}`);

    const response = BaseResponse.WithSuccess(dto, "Article retiré du panier avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur retrait du panier : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /cart/:userId  (vider le panier)
// ─────────────────────────────────────────────
export const clearCart = async (req: Request, res: Response) => {
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

    logger.info(`Vidage du panier (utilisateur ${userId})`);

    const cart = await Cart.findOne({ userId }).session(session);
    if (!cart) {
      await session.abortTransaction();
      logger.warn(`Panier introuvable pour utilisateur : ${userId}`);
      const response = BaseResponse.NotFound("Panier introuvable");
      return res.status(response.statusCode).json(response);
    }

    cart.items.splice(0, cart.items.length);
    cart.amount = 0;

    await cart.save({ session });
    await session.commitTransaction();

    logger.info(`Panier vidé pour ${userId}`);

    const dto = await buildCartDto(cart);

    const response = BaseResponse.WithSuccess(dto, "Panier vidé avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur vidage panier : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};
