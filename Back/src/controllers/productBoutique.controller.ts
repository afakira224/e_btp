import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import { Product, productBoutique } from "../models/product.model.js";
import { Shop } from "../models/boutique.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js"; 
import { Famille } from "../models/famille.model.js";
import { Categorie } from "../models/categorie.model.js";
import { SousCategorie } from "../models/sousCategorie.model.js";
import { toProductBoutiqueResponseDto, type ProductBoutiqueResponseDto } from "../shared/interfaces/product.interfaces.js";
import { getFileUrl, deleteFileByUrl, cleanupUploadedFiles } from "../shared/helpers/fileUpload.js";
import { RecentlyViewed } from "../models/recentlyViewed.model.js";
import { type IProductBoutique } from "../models/product.model.js";

// Nombre maximum de produits conservés dans l'historique "récemment vus" par utilisateur.
const MAX_RECENTLY_VIEWED = 20;

// Enrichit une liste de product_boutique en DTOs (boutique, produit, taxonomie).
const enrichProductBoutiques = async (
  items: IProductBoutique[]
): Promise<ProductBoutiqueResponseDto[]> => {
  const shopIds = [...new Set(items.map(i => i.boutiqueId?.toString()).filter(Boolean))];
  const productIds = [...new Set(items.map(i => i.productId?.toString()).filter(Boolean))];

  const [shops, products] = await Promise.all([
    Shop.find({ _id: { $in: shopIds } }),
    Product.find({ _id: { $in: productIds } }),
  ]);

  const familleIds = [...new Set(products.map(p => p.familleId?.toString()).filter(Boolean))];
  const categoryIds = [...new Set(products.map(p => p.categoryId?.toString()).filter(Boolean))];
  const sousCategoryIds = [...new Set(products.map(p => p.sousCategoryId?.toString()).filter(Boolean))];

  const [familles, categories, sousCategories] = await Promise.all([
    Famille.find({ _id: { $in: familleIds } }),
    Categorie.find({ _id: { $in: categoryIds } }),
    SousCategorie.find({ _id: { $in: sousCategoryIds } }),
  ]);

  return items.map(item => {
    const shop = item.boutiqueId
      ? shops.find(s => s._id.toString() === item.boutiqueId.toString())
      : undefined;
    const product = item.productId
      ? products.find(p => p._id.toString() === item.productId.toString())
      : undefined;
    return toProductBoutiqueResponseDto(item, shop ?? undefined, product ?? undefined, familles, categories, sousCategories);
  });
};

// Enregistre (best-effort) la consultation d'un produit par un utilisateur.
// Non bloquant : une erreur ici ne doit jamais casser la réponse principale.
const recordProductView = async (userId: string, productBoutiqueId: string): Promise<void> => {
  try {
    let rv = await RecentlyViewed.findOne({ userId });
    if (!rv) {
      rv = new RecentlyViewed({ userId, items: [] });
    }

    const idx = rv.items.findIndex(i => i.productBoutiqueId.toString() === productBoutiqueId);
    if (idx !== -1) rv.items.splice(idx, 1);

    rv.items.unshift({ productBoutiqueId: new mongoose.Types.ObjectId(productBoutiqueId), viewedAt: new Date() });

    if (rv.items.length > MAX_RECENTLY_VIEWED) {
      rv.items.splice(MAX_RECENTLY_VIEWED);
    }

    await rv.save();
  } catch (error) {
    logger.warn(`Enregistrement vue produit ignoré : ${(error as Error).message}`);
  }
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
//  GET /product-boutiques?boutiqueId=&productId=&isFeatured=&page=&limit=
// ─────────────────────────────────────────────
export const getProductBoutiques = async (req: Request, res: Response) => {
  try {
    const { boutiqueId, productId, isFeatured, page = "1", limit = "10" } = req.query;

    const filter: Record<string, unknown> = {};
    if (boutiqueId) filter.boutiqueId = boutiqueId;
    if (productId) filter.productId = productId;
    if (isFeatured !== undefined) filter.isFeatured = isFeatured === "true";

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      productBoutique.find(filter).skip(skip).limit(limitNum).sort({ createdAt: -1 }),
      productBoutique.countDocuments(filter),
    ]);

    // Le filtre par boutique n'a de sens que si la boutique existe.
    if (boutiqueId) {
      const shop = await Shop.findById(boutiqueId);
      if (!shop) {
        logger.warn(`Boutique introuvable : ${String(boutiqueId)}`);
        const response = BaseResponse.NotFound("Boutique introuvable");
        return res.status(response.statusCode).json(response);
      }
    }

    // Sans filtre, les résultats peuvent provenir de plusieurs boutiques : on les résout toutes.
    const shopIds = [...new Set(items.map(i => i.boutiqueId?.toString()).filter(Boolean))];
    const shops = shopIds.length > 0 ? await Shop.find({ _id: { $in: shopIds } }) : [];

    const productIds = items.map(i => i.productId);
    const products = productIds.length > 0 ? await Product.find({ _id: { $in: productIds } }) : [];

    logger.info(`Liste product-boutiques — total : ${total}`);

    const familleIds = [...new Set(products.map(p => p.familleId.toString()).filter(Boolean))];
    const categoryIds = [...new Set(products.map(p => p.categoryId.toString()).filter(Boolean))];
    const sousCategoryIds = [...new Set(products.map(p => p.sousCategoryId.toString()).filter(Boolean))];

    const [familles, categories, sousCategories] = await Promise.all([
          Famille.find({ _id: { $in: familleIds } }),
          Categorie.find({ _id: { $in: categoryIds } }),
          SousCategorie.find({ _id: { $in: sousCategoryIds } }),
        ]);

    const itemsDto = items.map(item => {
      const product = products.find(p => p._id.toString() === item.productId.toString());
      const shop = shops.find(s => s._id.toString() === item.boutiqueId?.toString());
      return toProductBoutiqueResponseDto(item, shop, product, familles, categories, sousCategories);
    });

    const response = BaseResponse.WithSuccess(
      {
        items: itemsDto,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Produits en boutique récupérés avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste product-boutiques : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /product-boutiques/:id
// ─────────────────────────────────────────────
export const getProductBoutiqueById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const item = await productBoutique.findById(id);
    if (!item) {
      logger.warn(`Produit en boutique introuvable : ${id}`);
      const response = BaseResponse.NotFound("Produit en boutique non trouvé");
      return res.status(response.statusCode).json(response);
    }

    // Historique "récemment vu" : enregistré si un userId est fourni (best-effort).
    const viewerId = req.query.userId as string | undefined;
    if (viewerId) {
      await recordProductView(viewerId, String(id));
    }

    const product = await Product.findById(item.productId);

        if (!product) {
          logger.warn(`Produit introuvable : ${id}`);
          const response = BaseResponse.NotFound("Produit non trouvé");
          return res.status(response.statusCode).json(response);
        }
    const [famille, categorie, sousCategorie,boutique] = await Promise.all([
      Famille.findById(product.familleId),
      Categorie.findById(product.categoryId),
      SousCategorie.findById(product.sousCategoryId),
      Shop.findById(item.boutiqueId)
    ]);
    const json = toProductBoutiqueResponseDto(item,boutique ?? undefined, product ?? undefined,famille ? [famille] : [],
      categorie ? [categorie] : [],
      sousCategorie ? [sousCategorie] : []);

    const response = BaseResponse.WithSuccess(json, "Produit en boutique récupéré avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération produit en boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  POST /product-boutiques
// ─────────────────────────────────────────────
export const createProductBoutique = async (req: Request, res: Response) => {
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

    const {
      boutiqueId, productId, price, discountPrice,
      stock, isFeatured, tags, rating, reviewsCount,
    } = req.body;

    logger.info(`Création product-boutique : produit ${productId} pour boutique ${boutiqueId}`);

    // Requêtes séquentielles : elles partagent la session de transaction, donc jamais
    // de Promise.all ici (sous peine d'erreur MongoDB sur le numéro de transaction).
    const shop = await Shop.findById(boutiqueId).session(session);
    const product = await Product.findById(productId).session(session);

    if (!shop) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Boutique introuvable : ${boutiqueId}`);
      const response = BaseResponse.NotFound("Boutique introuvable");
      return res.status(response.statusCode).json(response);
    }

    if (!product) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Produit introuvable : ${productId}`);
      const response = BaseResponse.NotFound("Produit introuvable");
      return res.status(response.statusCode).json(response);
    }

    const existing = await productBoutique.findOne({ boutiqueId, productId }).session(session);
    if (existing) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Produit déjà présent dans cette boutique : ${productId} / ${boutiqueId}`);
      const response = BaseResponse.Conflict("Ce produit est déjà référencé dans cette boutique");
      return res.status(response.statusCode).json(response);
    }

    const urlImages = files.map(file => getFileUrl(file.path));

    const [item] = await productBoutique.create(
      [{
        boutiqueId,
        productId,
        urlImages,
        price,
        discountPrice,
        stock,
        isFeatured: isFeatured ?? false,
        tags: tags ?? [],
        rating,
        reviewsCount,
      }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!item) throw new Error("La création du produit en boutique a échoué.");

    await session.commitTransaction();

    logger.info(`Product-boutique créé : ${item._id}`);

    const response = BaseResponse.Created(
      toProductBoutiqueResponseDto(item, shop, product),
      "Produit ajouté à la boutique avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    cleanupUploadedFiles(files);
    logger.error(`Erreur création product-boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  PUT /product-boutiques/:id
// ─────────────────────────────────────────────
export const updateProductBoutique = async (req: Request, res: Response) => {
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
    const {
      boutiqueId, productId, price, discountPrice,
      stock, isFeatured, tags, rating, reviewsCount,
    } = req.body;
    const imagesToRemove = parseStringArray(req.body.imagesToRemove);

    logger.info(`Mise à jour product-boutique : ${id}`);

    const item = await productBoutique.findById(id).session(session);
    if (!item) {
      await session.abortTransaction();
      cleanupUploadedFiles(files);
      logger.warn(`Produit en boutique introuvable pour mise à jour : ${id}`);
      const response = BaseResponse.NotFound("Produit en boutique non trouvé");
      return res.status(response.statusCode).json(response);
    }

    if (boutiqueId && boutiqueId !== String(item.boutiqueId)) {
      const shop = await Shop.findById(boutiqueId).session(session);
      if (!shop) {
        await session.abortTransaction();
        cleanupUploadedFiles(files);
        logger.warn(`Boutique introuvable : ${boutiqueId}`);
        const response = BaseResponse.NotFound("Boutique introuvable");
        return res.status(response.statusCode).json(response);
      }
      item.boutiqueId = boutiqueId;
    }

    if (productId && productId !== String(item.productId)) {
      const product = await Product.findById(productId).session(session);
      if (!product) {
        await session.abortTransaction();
        cleanupUploadedFiles(files);
        logger.warn(`Produit introuvable : ${productId}`);
        const response = BaseResponse.NotFound("Produit introuvable");
        return res.status(response.statusCode).json(response);
      }
      item.productId = productId;
    }

    if (price !== undefined) item.price = price;
    if (discountPrice !== undefined) item.discountPrice = discountPrice;
    if (stock !== undefined) item.stock = stock;
    if (isFeatured !== undefined) item.isFeatured = isFeatured;
    if (tags !== undefined) item.tags = tags;
    if (rating !== undefined) item.rating = rating;
    if (reviewsCount !== undefined) item.reviewsCount = reviewsCount;

    // Suppression des images demandées (fichier physique + tableau de l'item)
    if (imagesToRemove.length > 0) {
      imagesToRemove.forEach((url) => deleteFileByUrl(url));
      item.urlImages = item.urlImages.filter(img => !imagesToRemove.includes(img));
    }

    // Ajout des nouvelles images uploadées
    if (files.length > 0) {
      const newUrlImages = files.map(file => getFileUrl(file.path));
      item.urlImages = [...item.urlImages, ...newUrlImages];
    }

    await item.save({ session });
    await session.commitTransaction();

    logger.info(`Product-boutique mis à jour : ${id}`);

    const [product, shop] = await Promise.all([
      Product.findById(item.productId),
      Shop.findById(item.boutiqueId),
    ]);
    const response = BaseResponse.WithSuccess(
      toProductBoutiqueResponseDto(item, shop ?? undefined, product ?? undefined),
      "Produit en boutique mis à jour avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    cleanupUploadedFiles(files);
    logger.error(`Erreur mise à jour product-boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /product-boutiques/:id (soft delete)
// ─────────────────────────────────────────────
export const deleteProductBoutique = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const id = String(req.params.id);

    logger.info(`Suppression product-boutique : ${id}`);

    const item = await productBoutique.findById(id).session(session);
    if (!item) {
      await session.abortTransaction();
      logger.warn(`Produit en boutique introuvable pour suppression : ${id}`);
      const response = BaseResponse.NotFound("Produit en boutique non trouvé");
      return res.status(response.statusCode).json(response);
    }

    item.deletedAt = new Date();
    await item.save({ session });
    await session.commitTransaction();

    logger.info(`Product-boutique supprimé (soft) : ${id}`);

    const response = BaseResponse.WithSuccess(null, "Produit en boutique supprimé avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur suppression product-boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  GET /product-boutiques/recently-viewed/:userId
//  Produits récemment consultés par l'utilisateur (plus récent en tête).
// ─────────────────────────────────────────────
export const getRecentlyViewed = async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);

    const rv = await RecentlyViewed.findOne({ userId });
    if (!rv || rv.items.length === 0) {
      const response = BaseResponse.WithSuccess([], "Aucun produit récemment vu");
      return res.status(response.statusCode).json(response);
    }

    const pbIds = rv.items.map(i => i.productBoutiqueId);
    const items = await productBoutique.find({ _id: { $in: pbIds } });
    const dtos = await enrichProductBoutiques(items);

    // On respecte l'ordre de l'historique (plus récent en tête) et on joint viewedAt.
    const ordered = rv.items
      .map(i => {
        const dto = dtos.find(d => d.id === i.productBoutiqueId.toString());
        return dto ? { ...dto, viewedAt: i.viewedAt } : null;
      })
      .filter(Boolean);

    logger.info(`Récemment vus pour ${userId} : ${ordered.length}`);

    const response = BaseResponse.WithSuccess(ordered, "Produits récemment vus récupérés avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération produits récemment vus : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /product-boutiques/:id/suggestions?limit=
//  Produits similaires : même sous-catégorie > catégorie > famille (hors produit courant).
// ─────────────────────────────────────────────
export const getSuggestions = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const limit = Math.max(1, Math.min(50, parseInt((req.query.limit as string) ?? "10")));

    const item = await productBoutique.findById(id);
    if (!item) {
      logger.warn(`Produit en boutique introuvable : ${id}`);
      const response = BaseResponse.NotFound("Produit en boutique non trouvé");
      return res.status(response.statusCode).json(response);
    }

    const product = await Product.findById(item.productId);
    if (!product) {
      const response = BaseResponse.WithSuccess([], "Aucune suggestion disponible");
      return res.status(response.statusCode).json(response);
    }

    // Cascade de pertinence : même sous-catégorie, puis même catégorie, puis
    // même famille. Chaque niveau ne lit que ce qui manque encore : le coût
    // reste borné par `limit`, même quand une famille compte des dizaines de
    // milliers de produits.
    const tiers: Record<string, mongoose.Types.ObjectId>[] = [];
    if (product.sousCategoryId) tiers.push({ sousCategoryId: product.sousCategoryId });
    if (product.categoryId) tiers.push({ categoryId: product.categoryId });
    if (product.familleId) tiers.push({ familleId: product.familleId });

    const ranked: IProductBoutique[] = [];
    const seenProducts: mongoose.Types.ObjectId[] = [product._id as mongoose.Types.ObjectId];
    for (const tier of tiers) {
      const missing = limit - ranked.length;
      if (missing <= 0) break;
      const related = await Product.find({ ...tier, _id: { $nin: [...seenProducts] } })
        .select("_id")
        .limit(missing * 3);
      if (related.length === 0) continue;
      const relatedIds = related.map((p) => p._id as mongoose.Types.ObjectId);
      seenProducts.push(...relatedIds);
      const offers = await productBoutique
        .find({ productId: { $in: relatedIds }, _id: { $ne: item._id } })
        .limit(missing);
      ranked.push(...offers);
    }

    if (ranked.length === 0) {
      const response = BaseResponse.WithSuccess([], "Aucune suggestion disponible");
      return res.status(response.statusCode).json(response);
    }

    const dtos = await enrichProductBoutiques(ranked);

    logger.info(`Suggestions pour ${id} : ${dtos.length}`);

    const response = BaseResponse.WithSuccess(dtos, "Suggestions récupérées avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération suggestions : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /product-boutiques/search
//  Recherche & filtres avancés (texte, taxonomie, prix, note, stock, tags, tri, pagination).
//  Query :
//    q, boutiqueId, familleId, categoryId, sousCategoryId,
//    minPrice, maxPrice, minRating, inStock, isFeatured, discounted,
//    tags (séparés par des virgules), sort, page, limit
//  sort ∈ { newest, price_asc, price_desc, rating, popular }
// ─────────────────────────────────────────────
export const searchProductBoutiques = async (req: Request, res: Response) => {
  try {
    const {
      q, boutiqueId, familleId, categoryId, sousCategoryId,
      minPrice, maxPrice, minRating, inStock, isFeatured, discounted,
      tags, sort = "newest", page = "1", limit = "10",
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page ?? "1"));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit ?? "10")));
    const skip = (pageNum - 1) * limitNum;

    // ── Étape 1 : filtre au niveau Produit (texte + taxonomie) → IDs de produits.
    const productFilter: Record<string, unknown> = {};
    if (q) {
      productFilter.$or = [
        { name: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }
    if (familleId) productFilter.familleId = familleId;
    if (categoryId) productFilter.categoryId = categoryId;
    if (sousCategoryId) productFilter.sousCategoryId = sousCategoryId;

    const needsProductJoin = Boolean(q || familleId || categoryId || sousCategoryId);
    let productIds: mongoose.Types.ObjectId[] | null = null;
    if (needsProductJoin) {
      const products = await Product.find(productFilter).select("_id");
      productIds = products.map(p => p._id);
      // Aucun produit ne correspond → résultat vide immédiat.
      if (productIds.length === 0) {
        const response = BaseResponse.WithSuccess(
          { items: [], total: 0, page: pageNum, totalPages: 0, priceRange: { min: 0, max: 0 } },
          "Aucun résultat"
        );
        return res.status(response.statusCode).json(response);
      }
    }

    // ── Étape 2 : filtre au niveau ProductBoutique (prix, note, stock, tags…).
    const pbFilter: Record<string, unknown> = {};
    if (productIds) pbFilter.productId = { $in: productIds };
    if (boutiqueId) pbFilter.boutiqueId = boutiqueId;

    if (minPrice !== undefined || maxPrice !== undefined) {
      const price: Record<string, number> = {};
      if (minPrice !== undefined) price.$gte = parseFloat(minPrice);
      if (maxPrice !== undefined) price.$lte = parseFloat(maxPrice);
      pbFilter.price = price;
    }
    if (minRating !== undefined) pbFilter.rating = { $gte: parseFloat(minRating) };
    if (inStock === "true") pbFilter.stock = { $gt: 0 };
    if (isFeatured !== undefined) pbFilter.isFeatured = isFeatured === "true";
    if (tags) pbFilter.tags = { $in: tags.split(",").map(t => t.trim()).filter(Boolean) };
    // Produits en promo : prix remisé strictement inférieur au prix.
    if (discounted === "true") pbFilter.$expr = { $lt: ["$discountPrice", "$price"] };

    // Tri
    const sortMap: Record<string, Record<string, 1 | -1>> = {
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      rating: { rating: -1 },
      popular: { reviewsCount: -1 },
      newest: { createdAt: -1 },
    };
    const sortSpec = sortMap[sort ?? "newest"] ?? { createdAt: -1 };

    // Sans aucun filtre, le total vient des métadonnées de la collection :
    // compter des millions d'offres une à une prendrait plusieurs secondes.
    const [items, total] = await Promise.all([
      productBoutique.find(pbFilter).sort(sortSpec).skip(skip).limit(limitNum),
      Object.keys(pbFilter).length === 0
        ? productBoutique.estimatedDocumentCount()
        : productBoutique.countDocuments(pbFilter),
    ]);

    // Facette prix : min/max sur le même filtre mais sans la contrainte de prix
    // (utile pour un curseur de prix côté front).
    const { price: _omitPrice, ...facetFilter } = pbFilter;
    const [cheapest, priciest] = await Promise.all([
      productBoutique.findOne(facetFilter).sort({ price: 1 }).select("price"),
      productBoutique.findOne(facetFilter).sort({ price: -1 }).select("price"),
    ]);

    const dtos = await enrichProductBoutiques(items);

    logger.info(`Recherche product-boutiques — ${total} résultat(s) (q="${q ?? ""}")`);

    const response = BaseResponse.WithSuccess(
      {
        items: dtos,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        priceRange: { min: cheapest?.price ?? 0, max: priciest?.price ?? 0 },
      },
      "Résultats de recherche récupérés avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur recherche product-boutiques : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};