import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import { SousCategorie } from "../models/sousCategorie.model.js";
import { Categorie } from "../models/categorie.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { getFileUrl, deleteFileByUrl, cleanupUploadedFiles } from "../shared/helpers/fileUpload.js";

// GET /sous-categories?categorieId=...&actif=...
export const getSousCategories = async (req: Request, res: Response) => {
  try {
    const { categorieId, actif } = req.query;

    const filter: Record<string, unknown> = {};
    if (categorieId !== undefined) filter.categorieId = categorieId;
    if (actif !== undefined) filter.actif = actif === "true";

    const sousCategories = await SousCategorie.find(filter).sort({ ordre: 1 });

    logger.info(`Liste sous-catégories — total : ${sousCategories.length}`);

    const response = BaseResponse.WithSuccess(sousCategories, "Sous-catégories récupérées avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste sous-catégories : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// GET /sous-categories/:id
export const getSousCategorieById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const sousCategorie = await SousCategorie.findById(id);

    if (!sousCategorie) {
      logger.warn(`Sous-catégorie introuvable : ${id}`);
      const response = BaseResponse.NotFound("Sous-catégorie non trouvée");
      return res.status(response.statusCode).json(response);
    }

    const response = BaseResponse.WithSuccess(sousCategorie, "Sous-catégorie récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération sous-catégorie : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// POST /sous-categories
export const createSousCategorie = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  const file = req.file as Express.Multer.File | undefined;

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const { categorieId, nom, description, ordre, actif } = req.body;

    logger.info(`Création sous-catégorie : ${nom} (catégorie ${categorieId})`);

    const categorie = await Categorie.findById(categorieId).session(session);
    if (!categorie) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      logger.warn(`Catégorie introuvable : ${categorieId}`);
      const response = BaseResponse.NotFound("Catégorie introuvable");
      return res.status(response.statusCode).json(response);
    }

    const existing = await SousCategorie.findOne({ categorieId, nom: nom.trim() }).session(session);
    if (existing) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      logger.warn(`Sous-catégorie déjà existante : ${nom} (catégorie ${categorieId})`);
      const response = BaseResponse.Conflict("Une sous-catégorie avec ce nom existe déjà dans cette catégorie");
      return res.status(response.statusCode).json(response);
    }

    let finalOrdre = ordre;
    if (finalOrdre === undefined) {
      const last = await SousCategorie.findOne({ categorieId }).sort({ ordre: -1 }).session(session);
      finalOrdre = last ? last.ordre! + 10 : 10;
    }

    // Image uploadée (multipart, champ "image") prioritaire ; sinon URL éventuelle du body.
    const image = file ? getFileUrl(file.path) : (req.body.image ?? null);

    const [sousCategorie] = await SousCategorie.create(
      [{ categorieId, nom, description, image, ordre: finalOrdre, actif: actif ?? true }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!sousCategorie) throw new Error("La création de la sous-catégorie a échoué.");

    await session.commitTransaction();

    logger.info(`Sous-catégorie créée : ${sousCategorie._id}`);

    const response = BaseResponse.Created(sousCategorie, "Sous-catégorie créée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    if (file) cleanupUploadedFiles([file]);
    logger.error(`Erreur création sous-catégorie : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// PUT /sous-categories/:id
export const updateSousCategorie = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  const file = req.file as Express.Multer.File | undefined;

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);
    const { categorieId, nom, description, image, ordre, actif } = req.body;
    const removeImage = req.body.removeImage === "true" || req.body.removeImage === true;

    logger.info(`Mise à jour sous-catégorie : ${id}`);

    const sousCategorie = await SousCategorie.findById(id).session(session);
    if (!sousCategorie) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      logger.warn(`Sous-catégorie introuvable pour mise à jour : ${id}`);
      const response = BaseResponse.NotFound("Sous-catégorie non trouvée");
      return res.status(response.statusCode).json(response);
    }

    if (categorieId && categorieId !== String(sousCategorie.categorieId)) {
      const categorie = await Categorie.findById(categorieId).session(session);
      if (!categorie) {
        await session.abortTransaction();
        if (file) cleanupUploadedFiles([file]);
        logger.warn(`Catégorie introuvable : ${categorieId}`);
        const response = BaseResponse.NotFound("Catégorie introuvable");
        return res.status(response.statusCode).json(response);
      }
      sousCategorie.categorieId = categorieId;
    }

    if (nom && nom.trim() !== sousCategorie.nom) {
      const existing = await SousCategorie.findOne({
        categorieId: categorieId ?? sousCategorie.categorieId,
        nom: nom.trim(),
        _id: { $ne: id },
      }).session(session);
      if (existing) {
        await session.abortTransaction();
        if (file) cleanupUploadedFiles([file]);
        logger.warn(`Nom de sous-catégorie déjà utilisé : ${nom}`);
        const response = BaseResponse.Conflict("Une sous-catégorie avec ce nom existe déjà dans cette catégorie");
        return res.status(response.statusCode).json(response);
      }
      sousCategorie.nom = nom;
    }

    if (description !== undefined) sousCategorie.description = description;
    if (ordre !== undefined) sousCategorie.ordre = ordre;
    if (actif !== undefined) sousCategorie.actif = actif;

    // Gestion de l'image : un nouveau fichier remplace l'ancien ; removeImage la supprime.
    if (file) {
      if (sousCategorie.image) deleteFileByUrl(sousCategorie.image);
      sousCategorie.image = getFileUrl(file.path);
    } else if (removeImage) {
      if (sousCategorie.image) deleteFileByUrl(sousCategorie.image);
      sousCategorie.image = null;
    } else if (image !== undefined) {
      sousCategorie.image = image;
    }

    await sousCategorie.save({ session });
    await session.commitTransaction();

    logger.info(`Sous-catégorie mise à jour : ${id}`);

    const response = BaseResponse.WithSuccess(sousCategorie, "Sous-catégorie mise à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    if (file) cleanupUploadedFiles([file]);
    logger.error(`Erreur mise à jour sous-catégorie : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// PATCH /sous-categories/reorder
export const reorderSousCategories = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { orderedIds } = req.body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("orderedIds doit être un tableau non vide");
      return res.status(response.statusCode).json(response);
    }

    logger.info(`Réorganisation sous-catégories — ${orderedIds.length} éléments`);

    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { ordre: (index + 1) * 10 },
      },
    }));

    await SousCategorie.bulkWrite(bulkOps, { session });
    await session.commitTransaction();

    logger.info(`Ordre des sous-catégories mis à jour`);

    const response = BaseResponse.WithSuccess(null, "Ordre des sous-catégories mis à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur réorganisation sous-catégories : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// DELETE /sous-categories/:id (soft delete)
export const deleteSousCategorie = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const id = String(req.params.id);

    logger.info(`Suppression sous-catégorie : ${id}`);

    const sousCategorie = await SousCategorie.findById(id).session(session);
    if (!sousCategorie) {
      await session.abortTransaction();
      logger.warn(`Sous-catégorie introuvable pour suppression : ${id}`);
      const response = BaseResponse.NotFound("Sous-catégorie non trouvée");
      return res.status(response.statusCode).json(response);
    }

    sousCategorie.deletedAt = new Date();
    await sousCategorie.save({ session });
    await session.commitTransaction();

    logger.info(`Sous-catégorie supprimée (soft) : ${id}`);

    const response = BaseResponse.WithSuccess(null, "Sous-catégorie supprimée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur suppression sous-catégorie : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};