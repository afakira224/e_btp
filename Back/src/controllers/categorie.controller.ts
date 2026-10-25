import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import { Categorie } from "../models/categorie.model.js";
import { Famille } from "../models/famille.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { SousCategorie } from "../models/sousCategorie.model.js";
import { toCategorieResponseDto } from "../shared/interfaces/Categorie.interfaces.js";
import { groupBy } from "../shared/interfaces/Famille.interfaces.js";
import { getFileUrl, deleteFileByUrl, cleanupUploadedFiles } from "../shared/helpers/fileUpload.js";

// GET /categories?familleId=...&actif=...
export const getCategories = async (req: Request, res: Response) => {
  try {
    const { familleId, actif } = req.query;

    const filter: Record<string, unknown> = {};
    if (familleId !== undefined) filter.familleId = familleId;
    if (actif !== undefined) filter.actif = actif === "true";

    const [categories,sous_categories] = await Promise.all([
        Categorie.find(filter).sort({ ordre: 1 }),
        SousCategorie.find({actif:true})
    ]);


    const sousByCategorie = groupBy(sous_categories, (s) => s.categorieId.toString());
    const categoriesDto = categories.map((cat) => toCategorieResponseDto(cat, sousByCategorie.get(cat._id.toString()) ?? []));

    logger.info(`Liste catégories — total : ${categories.length}`);

    const response = BaseResponse.WithSuccess(categoriesDto, "Catégories récupérées avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste catégories : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// GET /categories/:id
export const getCategorieById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const [categorie,sous_categorie] = await Promise.all([
        Categorie.findById(id),
        SousCategorie.find({categorieId:id})
    ])

    if (!categorie) {
      logger.warn(`Catégorie introuvable : ${id}`);
      const response = BaseResponse.NotFound("Catégorie non trouvée");
      return res.status(response.statusCode).json(response);
    }

    const json = toCategorieResponseDto(categorie,sous_categorie)

    const response = BaseResponse.WithSuccess(json, "Catégorie récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération catégorie : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// POST /categories
export const createCategorie = async (req: Request, res: Response) => {
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

    const { familleId, nom, description, ordre, actif, etape } = req.body;

    logger.info(`Création catégorie : ${nom} (famille ${familleId})`);

    const famille = await Famille.findById(familleId).session(session);
    if (!famille) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      logger.warn(`Famille introuvable : ${familleId}`);
      const response = BaseResponse.NotFound("Famille introuvable");
      return res.status(response.statusCode).json(response);
    }

    const existing = await Categorie.findOne({ familleId, nom: nom.trim() }).session(session);
    if (existing) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      logger.warn(`Catégorie déjà existante : ${nom} (famille ${familleId})`);
      const response = BaseResponse.Conflict("Une catégorie avec ce nom existe déjà dans cette famille");
      return res.status(response.statusCode).json(response);
    }

    let finalOrdre = ordre;
    if (finalOrdre === undefined) {
      const last = await Categorie.findOne({ familleId }).sort({ ordre: -1 }).session(session);
      finalOrdre = last ? last.ordre! + 10 : 10;
    }

    // Image uploadée (multipart, champ "image") prioritaire ; sinon URL éventuelle du body.
    const image = file ? getFileUrl(file.path) : (req.body.image ?? null);

    const [categorie] = await Categorie.create(
      [{ familleId, nom, description, image, ordre: finalOrdre, actif: actif ?? true, ...(etape ? { etape } : {}) }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!categorie) throw new Error("La création de la catégorie a échoué.");

    await session.commitTransaction();

    logger.info(`Catégorie créée : ${categorie._id}`);

    const response = BaseResponse.Created(categorie, "Catégorie créée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    if (file) cleanupUploadedFiles([file]);
    logger.error(`Erreur création catégorie : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// PUT /categories/:id
export const updateCategorie = async (req: Request, res: Response) => {
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
    const { familleId, nom, description, image, ordre, actif, etape } = req.body;
    const removeImage = req.body.removeImage === "true" || req.body.removeImage === true;

    logger.info(`Mise à jour catégorie : ${id}`);

    const categorie = await Categorie.findById(id).session(session);
    if (!categorie) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      logger.warn(`Catégorie introuvable pour mise à jour : ${id}`);
      const response = BaseResponse.NotFound("Catégorie non trouvée");
      return res.status(response.statusCode).json(response);
    }

    if (familleId && familleId !== String(categorie.familleId)) {
      const famille = await Famille.findById(familleId).session(session);
      if (!famille) {
        await session.abortTransaction();
        if (file) cleanupUploadedFiles([file]);
        logger.warn(`Famille introuvable : ${familleId}`);
        const response = BaseResponse.NotFound("Famille introuvable");
        return res.status(response.statusCode).json(response);
      }
      categorie.familleId = familleId;
    }

    if (nom && nom.trim() !== categorie.nom) {
      const existing = await Categorie.findOne({
        familleId: familleId ?? categorie.familleId,
        nom: nom.trim(),
        _id: { $ne: id },
      }).session(session);
      if (existing) {
        await session.abortTransaction();
        if (file) cleanupUploadedFiles([file]);
        logger.warn(`Nom de catégorie déjà utilisé : ${nom}`);
        const response = BaseResponse.Conflict("Une catégorie avec ce nom existe déjà dans cette famille");
        return res.status(response.statusCode).json(response);
      }
      categorie.nom = nom;
    }

    if (description !== undefined) categorie.description = description;
    if (ordre !== undefined) categorie.ordre = ordre;
    if (actif !== undefined) categorie.actif = actif;
    if (etape !== undefined) categorie.etape = etape;

    // Gestion de l'image : un nouveau fichier remplace l'ancien ; removeImage la supprime.
    if (file) {
      if (categorie.image) deleteFileByUrl(categorie.image);
      categorie.image = getFileUrl(file.path);
    } else if (removeImage) {
      if (categorie.image) deleteFileByUrl(categorie.image);
      categorie.image = null;
    } else if (image !== undefined) {
      categorie.image = image;
    }

    await categorie.save({ session });
    await session.commitTransaction();

    logger.info(`Catégorie mise à jour : ${id}`);

    const response = BaseResponse.WithSuccess(categorie, "Catégorie mise à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    if (file) cleanupUploadedFiles([file]);
    logger.error(`Erreur mise à jour catégorie : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// PATCH /categories/reorder
export const reorderCategories = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { orderedIds } = req.body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("orderedIds doit être un tableau non vide");
      return res.status(response.statusCode).json(response);
    }

    logger.info(`Réorganisation catégories — ${orderedIds.length} éléments`);

    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { ordre: (index + 1) * 10 },
      },
    }));

    await Categorie.bulkWrite(bulkOps, { session });
    await session.commitTransaction();

    logger.info(`Ordre des catégories mis à jour`);

    const response = BaseResponse.WithSuccess(null, "Ordre des catégories mis à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur réorganisation catégories : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// DELETE /categories/:id (soft delete)
export const deleteCategorie = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const id = String(req.params.id);

    logger.info(`Suppression catégorie : ${id}`);

    const categorie = await Categorie.findById(id).session(session);
    if (!categorie) {
      await session.abortTransaction();
      logger.warn(`Catégorie introuvable pour suppression : ${id}`);
      const response = BaseResponse.NotFound("Catégorie non trouvée");
      return res.status(response.statusCode).json(response);
    }

    categorie.deletedAt = new Date();
    await categorie.save({ session });
    await session.commitTransaction();

    logger.info(`Catégorie supprimée (soft) : ${id}`);

    const response = BaseResponse.WithSuccess(null, "Catégorie supprimée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur suppression catégorie : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};