import type { Request, Response } from "express";
import mongoose from "mongoose"; 
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { validationResult } from "express-validator";
import { Shop } from "../models/boutique.model.js";
import { User } from "../models/user.model.js";
import { productBoutique } from "../models/product.model.js";
import { DeliveryMethod } from "../models/delivery.model.js";
import { getFileUrl, deleteFileByUrl, cleanupUploadedFiles } from "../shared/helpers/fileUpload.js";
import { shopDeliveryOf } from "../shared/helpers/delivery.helper.js";
import { canManageShop, SHOP_FORBIDDEN_MESSAGE } from "../shared/helpers/shopAccess.js";

// ─────────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────────
export const createShop = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const file = req.file as Express.Multer.File | undefined;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      session.endSession();
      if (file) cleanupUploadedFiles([file]);
      res.status(422).json(BaseResponse.BadRequest(
        errors.array().map(e => e.msg).join(" | ")
      ));
      return;
    }

    const { ownerId, nom, description, telephone, email, adresse } = req.body;

    logger.info(`Création boutique pour owner : ${ownerId}`);

    const [existingShop, existingUser] = await Promise.all([
      Shop.findOne({ nom, ownerId }),
      User.findById(ownerId),
    ]);

    if (existingShop) {
      await session.abortTransaction();
      session.endSession();
      if (file) cleanupUploadedFiles([file]);
      res.status(409).json(BaseResponse.Conflict("Une boutique avec ce nom existe déjà."));
      return;
    }

    if (!existingUser) {
      await session.abortTransaction();
      session.endSession();
      if (file) cleanupUploadedFiles([file]);
      res.status(404).json(BaseResponse.NotFound("L'utilisateur pour lequel vous essayez de créer une boutique n'existe pas."));
      return;
    }

    // Logo uploadé (multipart, champ "logo") prioritaire ; sinon URL éventuelle du body.
    const logo = file ? getFileUrl(file.path) : (req.body.logo ?? null);

    const [shop] = await Shop.create(
      [{ ownerId, nom, description, logo, telephone, email, adresse }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!shop) throw new Error("La création de la boutique a échoué.");

    await session.commitTransaction();
    session.endSession();

    logger.info(`Boutique créée : ${shop._id}`);

    res.status(201).json(BaseResponse.Created(shop, "Boutique créée avec succès."));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    if (file) cleanupUploadedFiles([file]);
    logger.error(`Erreur création boutique : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  GET ALL
// ─────────────────────────────────────────────
export const getShops = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ownerId, search, page = "1", limit = "10" } = req.query;

    const filter: Record<string, unknown> = {};

    if (ownerId)  filter.ownerId = ownerId;
    if (search)   filter.nom = { $regex: search, $options: "i" };

    const pageNum  = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const skip     = (pageNum - 1) * limitNum;

    const [shops, total] = await Promise.all([
      Shop.find(filter).skip(skip).limit(limitNum).sort({ createdAt: -1 }),
      Shop.countDocuments(filter),
    ]);

    logger.info(`Liste boutiques — total : ${total}`);

    res.json(BaseResponse.WithSuccess({
      shops,
      total,
      page:       pageNum,
      totalPages: Math.ceil(total / limitNum),
    }));
  } catch (err) {
    logger.error(`Erreur liste boutiques : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  GET BY ID
// ─────────────────────────────────────────────
export const getShopById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const shop = await Shop.findById(id);
    if (!shop) {
      res.status(404).json(BaseResponse.NotFound("Boutique introuvable."));
      return;
    }

    res.json(BaseResponse.WithSuccess(shop));
  } catch (err) {
    logger.error(`Erreur récupération boutique : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────────
export const updateShop = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const file = req.file as Express.Multer.File | undefined;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      session.endSession();
      if (file) cleanupUploadedFiles([file]);
      res.status(422).json(BaseResponse.BadRequest(
        errors.array().map(e => e.msg).join(" | ")
      ));
      return;
    }

    const id = String(req.params.id);
    const { nom, description, logo, telephone, email, adresse } = req.body;
    const removeLogo = req.body.removeLogo === "true" || req.body.removeLogo === true;

    logger.info(`Mise à jour boutique : ${id}`);

    const shop = await Shop.findById(id).session(session);
    if (!shop) {
      await session.abortTransaction();
      session.endSession();
      if (file) cleanupUploadedFiles([file]);
      res.status(404).json(BaseResponse.NotFound("Boutique introuvable."));
      return;
    }

    if (!canManageShop(req.user, shop)) {
      await session.abortTransaction();
      session.endSession();
      if (file) cleanupUploadedFiles([file]);
      logger.warn(`Mise à jour de la boutique ${id} refusée à ${req.user?.id}`);
      res.status(403).json(BaseResponse.Forbidden(SHOP_FORBIDDEN_MESSAGE));
      return;
    }

    // Le retrait se fait à l'adresse de la boutique : tant qu'elle le propose,
    // par défaut ou sur un produit personnalisé, l'adresse ne peut pas disparaître.
    if (adresse !== undefined && !String(adresse).trim()) {
      const pickupByDefault = shopDeliveryOf(shop).modes.includes(DeliveryMethod.PICKUP);
      const pickupOnProducts = pickupByDefault ? 0 : await productBoutique.countDocuments({
        boutiqueId: shop._id,
        "delivery.useShopSettings": false,
        "delivery.modes": DeliveryMethod.PICKUP,
      }).session(session);

      if (pickupByDefault || pickupOnProducts > 0) {
        await session.abortTransaction();
        session.endSession();
        if (file) cleanupUploadedFiles([file]);
        res.status(400).json(BaseResponse.BadRequest(
          "L'adresse de la boutique sert au retrait en boutique : désactivez ce mode avant de la retirer."
        ));
        return;
      }
    }

    if (nom !== undefined) shop.nom = nom;
    if (description !== undefined) shop.description = description;
    if (telephone !== undefined) shop.telephone = telephone;
    if (email !== undefined) shop.email = email;
    if (adresse !== undefined) shop.adresse = adresse;

    // Gestion du logo : un nouveau fichier remplace l'ancien ; removeLogo le supprime.
    if (file) {
      if (shop.logo) deleteFileByUrl(shop.logo);
      shop.logo = getFileUrl(file.path);
    } else if (removeLogo) {
      if (shop.logo) deleteFileByUrl(shop.logo);
      shop.logo = null;
    } else if (logo !== undefined) {
      shop.logo = logo;
    }

    await shop.save({ session });
    await session.commitTransaction();
    session.endSession();

    logger.info(`Boutique mise à jour : ${id}`);

    res.json(BaseResponse.WithSuccess(shop, "Boutique mise à jour."));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    if (file) cleanupUploadedFiles([file]);
    logger.error(`Erreur mise à jour boutique : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  DELETE (SOFT)
// ─────────────────────────────────────────────
export const deleteShop = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const id = String(req.params.id);

    logger.info(`Suppression boutique : ${id}`);

    const shop = await Shop.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true, session }
    );

    if (!shop) {
      await session.abortTransaction();
      session.endSession();
      res.status(404).json(BaseResponse.NotFound("Boutique introuvable."));
      return;
    }

    await session.commitTransaction();
    session.endSession();

    logger.info(`Boutique supprimée (soft) : ${id}`);

    res.json(BaseResponse.WithSuccess(null, "Boutique supprimée."));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Erreur suppression boutique : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};