import type { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { validationResult } from "express-validator";
import { Famille } from "../models/famille.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { Categorie } from "../models/categorie.model.js";
import { SousCategorie, type ISousCategorie } from "../models/sousCategorie.model.js";
import { groupBy, toFamilleResponseDto } from "../shared/interfaces/Famille.interfaces.js";
import { getFileUrl, deleteFileByUrl, cleanupUploadedFiles } from "../shared/helpers/fileUpload.js";

// GET /familles
export const getFamilles = async (req: Request, res: Response) => {
  try {
    const { actif } = req.query;

    const filter: Record<string, unknown> = {};
    if (actif !== undefined) {
      filter.actif = actif === "true";
    }

    const [familles,categories,sous_categories] = await Promise.all(
      [
        Famille.find(filter).sort({ ordre: 1 }),
        Categorie.find(filter).sort({ ordre: 1 }),
        SousCategorie.find(filter).sort({ ordre: 1 })
      ]
    );

    logger.info(`Liste familles — total : ${familles.length}`);
    if (!familles) {
      logger.warn(`Famille vide :`);
      const response = BaseResponse.NotFound("Familles non trouvée");
      return res.status(response.statusCode).json(response);
    }

    // Regroupement unique : chaque famille ne reçoit que ses catégories et
    // leurs sous-catégories (linéaire, même avec 15 000 sous-catégories).
    const categoriesByFamille = groupBy(categories, (c) => c.familleId.toString());
    const sousByCategorie = groupBy(sous_categories, (s) => s.categorieId.toString());
    const famillesDto = familles.map((famille) => {
      const own = categoriesByFamille.get(famille._id.toString()) ?? [];
      const ownSous = own.flatMap((c) => sousByCategorie.get(c._id.toString()) ?? []);
      return toFamilleResponseDto(famille, own, ownSous);
    });

    const response = BaseResponse.WithSuccess(famillesDto, "Familles récupérées avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste familles : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// GET /familles/:id
export const getFamilleById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const [famille,categories] = await Promise.all([
      Famille.findById(id),
      Categorie.find({familleId: id})
    ]);

    if (!famille) {
      logger.warn(`Famille introuvable : ${id}`);
      const response = BaseResponse.NotFound("Famille non trouvée");
      return res.status(response.statusCode).json(response);
    }
    
    var categorieIds : Types.ObjectId[]  = [];
    if(categories) {
      categorieIds = categories.map(c=> c._id)
    }

    let sousCategories: ISousCategorie[] = [];
    if (categorieIds.length > 0) {
      sousCategories = await SousCategorie.find({
        categorieId: { $in: categorieIds },
        actif: true,
      });
    }

    var json = toFamilleResponseDto(famille,categories,sousCategories)

    

    const response = BaseResponse.WithSuccess(json, "Famille récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération famille : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// POST /familles
export const createFamille = async (req: Request, res: Response) => {
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

    const { nom, description, ordre, actif } = req.body;

    logger.info(`Création famille : ${nom}`);

    const existing = await Famille.findOne({ nom: nom.trim() }).session(session);
    if (existing) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      logger.warn(`Famille déjà existante : ${nom}`);
      const response = BaseResponse.Conflict("Une famille avec ce nom existe déjà");
      return res.status(response.statusCode).json(response);
    }

    let finalOrdre = ordre;
    if (finalOrdre === undefined) {
      const last = await Famille.findOne().sort({ ordre: -1 }).session(session);
      finalOrdre = last ? last.ordre! + 10 : 10;
    }

    // Image uploadée (multipart, champ "image") prioritaire ; sinon URL éventuelle du body.
    const image = file ? getFileUrl(file.path) : (req.body.image ?? null);

    const [famille] = await Famille.create(
      [{ nom, description, image, ordre: finalOrdre, actif: actif ?? true }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!famille) throw new Error("La création de la famille a échoué.");

    await session.commitTransaction();

    logger.info(`Famille créée : ${famille._id}`);

    const response = BaseResponse.Created(famille, "Famille créée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    if (file) cleanupUploadedFiles([file]);
    logger.error(`Erreur création famille : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// PUT /familles/:id
export const updateFamille = async (req: Request, res: Response) => {
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
    const { nom, description, image, ordre, actif } = req.body;
    const removeImage = req.body.removeImage === "true" || req.body.removeImage === true;

    logger.info(`Mise à jour famille : ${id}`);

    const famille = await Famille.findById(id).session(session);
    if (!famille) {
      await session.abortTransaction();
      if (file) cleanupUploadedFiles([file]);
      logger.warn(`Famille introuvable pour mise à jour : ${id}`);
      const response = BaseResponse.NotFound("Famille non trouvée");
      return res.status(response.statusCode).json(response);
    }

    if (nom && nom.trim() !== famille.nom) {
      const existing = await Famille.findOne({ nom: nom.trim(), _id: { $ne: id } }).session(session);
      if (existing) {
        await session.abortTransaction();
        if (file) cleanupUploadedFiles([file]);
        logger.warn(`Nom de famille déjà utilisé : ${nom}`);
        const response = BaseResponse.Conflict("Une famille avec ce nom existe déjà");
        return res.status(response.statusCode).json(response);
      }
      famille.nom = nom;
    }

    if (description !== undefined) famille.description = description;
    if (ordre !== undefined) famille.ordre = ordre;
    if (actif !== undefined) famille.actif = actif;

    // Gestion de l'image : un nouveau fichier remplace l'ancien ; removeImage la supprime.
    if (file) {
      if (famille.image) deleteFileByUrl(famille.image);
      famille.image = getFileUrl(file.path);
    } else if (removeImage) {
      if (famille.image) deleteFileByUrl(famille.image);
      famille.image = null;
    } else if (image !== undefined) {
      famille.image = image;
    }

    await famille.save({ session });
    await session.commitTransaction();

    logger.info(`Famille mise à jour : ${id}`);

    const response = BaseResponse.WithSuccess(famille, "Famille mise à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    if (file) cleanupUploadedFiles([file]);
    logger.error(`Erreur mise à jour famille : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// PATCH /familles/reorder
export const reorderFamilles = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { orderedIds } = req.body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("orderedIds doit être un tableau non vide");
      return res.status(response.statusCode).json(response);
    }

    logger.info(`Réorganisation familles — ${orderedIds.length} éléments`);

    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { ordre: (index + 1) * 10 },
      },
    }));

    await Famille.bulkWrite(bulkOps, { session });
    await session.commitTransaction();

    logger.info(`Ordre des familles mis à jour`);

    const response = BaseResponse.WithSuccess(null, "Ordre des familles mis à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur réorganisation familles : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// DELETE /familles/:id (soft delete)
export const deleteFamille = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const id = String(req.params.id);

    logger.info(`Suppression famille : ${id}`);

    const famille = await Famille.findById(id).session(session);
    if (!famille) {
      await session.abortTransaction();
      logger.warn(`Famille introuvable pour suppression : ${id}`);
      const response = BaseResponse.NotFound("Famille non trouvée");
      return res.status(response.statusCode).json(response);
    }

    famille.deletedAt = new Date();
    await famille.save({ session });
    await session.commitTransaction();

    logger.info(`Famille supprimée (soft) : ${id}`);

    const response = BaseResponse.WithSuccess(null, "Famille supprimée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur suppression famille : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};