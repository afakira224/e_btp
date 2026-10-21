import type { Request, Response } from "express";
import fs from "fs";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import { Product } from "../models/product.model.js";
import { Famille } from "../models/famille.model.js";
import { Categorie } from "../models/categorie.model.js";
import { SousCategorie } from "../models/sousCategorie.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { toProductResponseDto } from "../shared/interfaces/product.interfaces.js";
import { deleteUploadedFile, getFileUrl } from "../shared/helpers/fileUpload.js";

// Supprime du disque les fichiers fraîchement uploadés (rollback en cas d'erreur/validation)
const cleanupUploadedFiles = (files: Express.Multer.File[]) => {
  files.forEach((file) => {
    fs.unlink(file.path, () => {});
  });
};

// Convertit un tableau/JSON stringifié en tableau de chaînes (imagesToRemove peut arriver
// en JSON stringifié depuis un multipart/form-data)
const parseStringArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as string[];
  try {
    const parsed = JSON.parse(value as string);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [String(value)];
  }
};

// ─────────────────────────────────────────────
//  GET /products?familleId=&categoryId=&sousCategoryId=&search=&page=&limit=
// ─────────────────────────────────────────────
export const getProducts = async (req: Request, res: Response) => {
  try {
    const { familleId, categoryId, sousCategoryId, search, page = "1", limit = "10" } = req.query;

    const filter: Record<string, unknown> = {};
    if (familleId) filter.familleId = familleId;
    if (categoryId) filter.categoryId = categoryId;
    if (sousCategoryId) filter.sousCategoryId = sousCategoryId;
    if (search) filter.name = { $regex: search, $options: "i" };

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(filter).skip(skip).limit(limitNum).sort({ createdAt: -1 }),
      Product.countDocuments(filter),
    ]);

    const familleIds = [...new Set(products.map(p => p.familleId.toString()).filter(Boolean))];
    const categoryIds = [...new Set(products.map(p => p.categoryId.toString()).filter(Boolean))];
    const sousCategoryIds = [...new Set(products.map(p => p.sousCategoryId.toString()).filter(Boolean))];

    const [familles, categories, sousCategories] = await Promise.all([
      Famille.find({ _id: { $in: familleIds } }),
      Categorie.find({ _id: { $in: categoryIds } }),
      SousCategorie.find({ _id: { $in: sousCategoryIds } }),
    ]);

    logger.info(`Liste produits — total : ${total}`);

    const productsDto = products.map(p => toProductResponseDto(p, familles, categories, sousCategories));

    const response = BaseResponse.WithSuccess(
      {
        products: productsDto,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Produits récupérés avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste produits : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /products/:id
// ─────────────────────────────────────────────
export const getProductById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const product = await Product.findById(id);
    if (!product) {
      logger.warn(`Produit introuvable : ${id}`);
      const response = BaseResponse.NotFound("Produit non trouvé");
      return res.status(response.statusCode).json(response);
    }

    const [famille, categorie, sousCategorie] = await Promise.all([
      Famille.findById(product.familleId),
      Categorie.findById(product.categoryId),
      SousCategorie.findById(product.sousCategoryId),
    ]);

    const json = toProductResponseDto(
      product,
      famille ? [famille] : [],
      categorie ? [categorie] : [],
      sousCategorie ? [sousCategorie] : []
    );

    const response = BaseResponse.WithSuccess(json, "Produit récupéré avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération produit : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  POST /products  (multipart/form-data, champ fichiers "images")
// ─────────────────────────────────────────────
export const createProduct = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  const files = (req.files as Express.Multer.File[]) || [];

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    if (files.length === 0) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("Au moins une image est requise.");
      return res.status(response.statusCode).json(response);
    }

    const { name, description, urlVideo, familleId, categoryId, sousCategoryId } = req.body;

    logger.info(`Création produit : ${name}`);

    // Important : les requêtes liées à une même session de transaction doivent être
    // exécutées séquentiellement (jamais en Promise.all), sous peine d'erreur MongoDB
    // du type "Only servers in a sharded cluster can start a new transaction...".
    const famille = await Famille.findById(familleId).session(session);
    if (!famille) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Famille introuvable : ${familleId}`);
      const response = BaseResponse.NotFound("Famille introuvable");
      return res.status(response.statusCode).json(response);
    }

    const categorie = await Categorie.findById(categoryId).session(session);
    if (!categorie) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Catégorie introuvable : ${categoryId}`);
      const response = BaseResponse.NotFound("Catégorie introuvable");
      return res.status(response.statusCode).json(response);
    }

    const sousCategorie = await SousCategorie.findById(sousCategoryId).session(session);
    if (!sousCategorie) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Sous-catégorie introuvable : ${sousCategoryId}`);
      const response = BaseResponse.NotFound("Sous-catégorie introuvable");
      return res.status(response.statusCode).json(response);
    }

    const urlImages = files.map(file => getFileUrl(file.path));

    const [product] = await Product.create(
      [{ name, description, urlVideo, urlImages, familleId, categoryId, sousCategoryId }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!product) throw new Error("La création du produit a échoué.");

    await session.commitTransaction();

    logger.info(`Produit créé : ${product._id}`);

    const response = BaseResponse.Created(
      toProductResponseDto(product, [famille], [categorie], [sousCategorie]),
      "Produit créé avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    cleanupUploadedFiles(files);
    logger.error(`Erreur création produit : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  PUT /products/:id  (multipart/form-data, nouveaux fichiers "images" ajoutés,
//  "imagesToRemove" pour retirer des images existantes)
// ─────────────────────────────────────────────
export const updateProduct = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  const files = (req.files as Express.Multer.File[]) || [];

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);
    const { name, description, urlVideo, familleId, categoryId, sousCategoryId } = req.body;
    const imagesToRemove = parseStringArray(req.body.imagesToRemove);

    logger.info(`Mise à jour produit : ${id}`);

    const product = await Product.findById(id).session(session);
    if (!product) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Produit introuvable pour mise à jour : ${id}`);
      const response = BaseResponse.NotFound("Produit non trouvé");
      return res.status(response.statusCode).json(response);
    }

    // Vérifier uniquement les relations qui changent — requêtes séquentielles car elles
    // partagent la session de transaction (jamais de Promise.all sur une même session).
    const famille =
      familleId && familleId !== String(product.familleId)
        ? await Famille.findById(familleId).session(session)
        : null;

    const categorie =
      categoryId && categoryId !== String(product.categoryId)
        ? await Categorie.findById(categoryId).session(session)
        : null;

    const sousCategorie =
      sousCategoryId && sousCategoryId !== String(product.sousCategoryId)
        ? await SousCategorie.findById(sousCategoryId).session(session)
        : null;

    // Validation
    if (familleId && familleId !== String(product.familleId) && !famille) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Famille introuvable : ${familleId}`);
      const response = BaseResponse.NotFound("Famille introuvable");
      return res.status(response.statusCode).json(response);
    }

    if (categoryId && categoryId !== String(product.categoryId) && !categorie) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Catégorie introuvable : ${categoryId}`);
      const response = BaseResponse.NotFound("Catégorie introuvable");
      return res.status(response.statusCode).json(response);
    }

    if (sousCategoryId && sousCategoryId !== String(product.sousCategoryId) && !sousCategorie) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Sous-catégorie introuvable : ${sousCategoryId}`);
      const response = BaseResponse.NotFound("Sous-catégorie introuvable");
      return res.status(response.statusCode).json(response);
    }

    // Affectation
    if (famille) {
      product.familleId = famille._id;
    }

    if (categorie) {
      product.categoryId = categorie._id;
    }

    if (sousCategorie) {
      product.sousCategoryId = sousCategorie._id;
    }

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;
    if (urlVideo !== undefined) product.urlVideo = urlVideo;

    // Suppression des images demandées (fichier physique + tableau du produit)
    if (imagesToRemove.length > 0) {
      imagesToRemove.forEach((url) => {
        const relativePath = url.replace(/^\/?uploads\//, "");
        deleteUploadedFile(relativePath);
      });
      product.urlImages = product.urlImages.filter(img => !imagesToRemove.includes(img));
    }

    // Ajout des nouvelles images uploadées
    if (files.length > 0) {
      const newUrlImages = files.map(file => getFileUrl(file.path));
      product.urlImages = [...product.urlImages, ...newUrlImages];
    }

    await product.save({ session });
    await session.commitTransaction();

    logger.info(`Produit mis à jour : ${id}`);

    const [familleDoc, categorieDoc, sousCategorieDoc] = await Promise.all([
      Famille.findById(product.familleId),
      Categorie.findById(product.categoryId),
      SousCategorie.findById(product.sousCategoryId),
    ]);

    const response = BaseResponse.WithSuccess(
      toProductResponseDto(
        product,
        familleDoc ? [familleDoc] : [],
        categorieDoc ? [categorieDoc] : [],
        sousCategorieDoc ? [sousCategorieDoc] : []
      ),
      "Produit mis à jour avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    cleanupUploadedFiles(files);
    logger.error(`Erreur mise à jour produit : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /products/:id (soft delete — les fichiers physiques sont conservés)
// ─────────────────────────────────────────────
export const deleteProduct = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const id = String(req.params.id);

    logger.info(`Suppression produit : ${id}`);

    const product = await Product.findById(id).session(session);
    if (!product) {
      await session.abortTransaction();
      logger.warn(`Produit introuvable pour suppression : ${id}`);
      const response = BaseResponse.NotFound("Produit non trouvé");
      return res.status(response.statusCode).json(response);
    }

    product.deletedAt = new Date();
    await product.save({ session });
    await session.commitTransaction();

    logger.info(`Produit supprimé (soft) : ${id}`);

    const response = BaseResponse.WithSuccess(null, "Produit supprimé avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur suppression produit : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};