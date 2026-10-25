import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import {
  SellerType,
  SHOP_REQUEST_STATUS_LIBELLE,
  ShopRequest,
  ShopRequestStatus,
} from "../models/shopRequest.model.js";
import { Shop } from "../models/boutique.model.js";
import { Famille } from "../models/famille.model.js";
import { EntitiesLogin, EntityType, User } from "../models/user.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { updateUserSessionsRole } from "../shared/config/session.config.js";
import {
  sendShopRequestApprovedMail,
  sendShopRequestReceivedMail,
  sendShopRequestRejectedMail,
} from "../shared/helpers/mail.helper.js";
import {
  toShopRequestResponseDto,
  type CreateShopRequestDto,
} from "../shared/interfaces/ShopRequest.interfaces.js";

// ─────────────────────────────────────────────
//  Demandes d'ouverture de boutique.
//
//  Le client dépose sa demande depuis son profil ; l'administration
//  l'approuve (la boutique est créée, le compte devient gérant) ou la
//  refuse avec un motif. Une seule demande en attente par compte.
// ─────────────────────────────────────────────

const APPLICANT_FIELDS = "nom prenom email telephone";

const PENDING_CONFLICT_MESSAGE = "Vous avez déjà une demande en cours d'examen.";
const NAME_CONFLICT_MESSAGE = "Une boutique porte déjà ce nom : choisissez-en un autre.";

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Même nom, casse ignorée : deux « Dépôt Matam » prêteraient à confusion. */
const sameName = (nom: string) => ({ nom: { $regex: `^${escapeRegex(nom.trim())}$`, $options: "i" } });

const alreadyReviewed = (status: ShopRequestStatus) =>
  `Cette demande a déjà été traitée (${SHOP_REQUEST_STATUS_LIBELLE[status].toLowerCase()}).`;

// ─────────────────────────────────────────────
//  POST /shop-requests
// ─────────────────────────────────────────────
export const createShopRequest = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    // Le demandeur est le titulaire de la session, jamais un champ du corps.
    const userId = req.user?.id;
    if (!userId) {
      const response = BaseResponse.UnAuthorized("Authentification requise.");
      return res.status(response.statusCode).json(response);
    }

    const body = req.body as CreateShopRequestDto;
    const familleIds = [...new Set(body.familleIds.map(String))];

    logger.info(`Demande d'ouverture de boutique « ${body.nom} » par ${userId}`);

    const [user, pending, homonym, famillesFound] = await Promise.all([
      User.findById(userId),
      ShopRequest.findOne({ userId, status: ShopRequestStatus.PENDING }),
      Shop.findOne(sameName(body.nom)),
      Famille.countDocuments({ _id: { $in: familleIds }, actif: true, deletedAt: null }),
    ]);

    if (!user) {
      const response = BaseResponse.NotFound("Utilisateur introuvable.");
      return res.status(response.statusCode).json(response);
    }

    if (pending) {
      const response = BaseResponse.Conflict(PENDING_CONFLICT_MESSAGE);
      return res.status(response.statusCode).json(response);
    }

    if (homonym) {
      const response = BaseResponse.Conflict(NAME_CONFLICT_MESSAGE);
      return res.status(response.statusCode).json(response);
    }

    if (famillesFound !== familleIds.length) {
      const response = BaseResponse.BadRequest("Domaine d'activité introuvable.");
      return res.status(response.statusCode).json(response);
    }

    const entreprise = body.sellerType === SellerType.ENTREPRISE;

    const request = await ShopRequest.create({
      userId,
      nom: body.nom,
      description: body.description,
      familleIds,
      sellerType: body.sellerType,
      // Un particulier n'a pas de registre : un numéro envoyé quand même est écarté.
      rccm: entreprise ? (body.rccm ?? null) : null,
      experience: body.experience,
      catalogSize: body.catalogSize,
      hasPhysicalStore: body.hasPhysicalStore,
      adresse: body.adresse,
      email: body.email || null,
      message: body.message || null,
      acceptedTermsAt: new Date(),
      status: ShopRequestStatus.PENDING,
    });

    logger.info(`Demande de boutique enregistrée : ${request._id}`);

    try {
      sendShopRequestReceivedMail(user, request.nom);
    } catch (mailError) {
      logger.error(`Email de demande de boutique non envoyé : ${(mailError as Error).message}`);
    }

    const response = BaseResponse.Created(
      toShopRequestResponseDto(request),
      "Demande envoyée. L'administration va l'examiner."
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    // L'index unique partiel tranche entre deux envois simultanés.
    if ((error as { code?: number }).code === 11000) {
      const response = BaseResponse.Conflict(PENDING_CONFLICT_MESSAGE);
      return res.status(response.statusCode).json(response);
    }
    logger.error(`Erreur création demande de boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /shop-requests/mine
//  Les demandes du compte connecté, la plus récente d'abord.
// ─────────────────────────────────────────────
export const getMyShopRequests = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response = BaseResponse.UnAuthorized("Authentification requise.");
      return res.status(response.statusCode).json(response);
    }

    const requests = await ShopRequest.find({ userId })
      .sort({ createdAt: -1 })
      .populate("familleIds", "nom");

    const response = BaseResponse.WithSuccess(
      requests.map(toShopRequestResponseDto),
      "Demandes récupérées avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur lecture des demandes de boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  PATCH /shop-requests/:id/cancel
//  Le demandeur retire sa demande tant qu'elle n'a pas été examinée.
// ─────────────────────────────────────────────
export const cancelShopRequest = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);
    const request = await ShopRequest.findById(id);
    if (!request) {
      const response = BaseResponse.NotFound("Demande introuvable.");
      return res.status(response.statusCode).json(response);
    }

    if (request.userId.toString() !== req.user?.id) {
      logger.warn(`Annulation de la demande ${id} refusée à ${req.user?.id}`);
      const response = BaseResponse.Forbidden("Vous ne pouvez annuler que vos propres demandes.");
      return res.status(response.statusCode).json(response);
    }

    if (request.status !== ShopRequestStatus.PENDING) {
      const response = BaseResponse.BadRequest(alreadyReviewed(request.status));
      return res.status(response.statusCode).json(response);
    }

    request.status = ShopRequestStatus.CANCELLED;
    await request.save();

    logger.info(`Demande de boutique annulée : ${id}`);

    const response = BaseResponse.WithSuccess(toShopRequestResponseDto(request), "Demande annulée.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur annulation demande de boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /shop-requests?status=&search=&page=&limit=   (admin)
//  Les demandes en attente forment une file : les plus anciennes d'abord.
//  Les autres sont un historique : les plus récemment traitées d'abord.
//  `counts` alimente les onglets par statut, sans requête supplémentaire.
// ─────────────────────────────────────────────
export const getShopRequests = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const { status, search, page = "1", limit = "10" } = req.query;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (search) filter.nom = { $regex: escapeRegex(String(search)), $options: "i" };

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const sort: Record<string, 1 | -1> =
      status === ShopRequestStatus.PENDING ? { createdAt: 1 } : { updatedAt: -1 };

    const [requests, total, grouped] = await Promise.all([
      ShopRequest.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate("userId", APPLICANT_FIELDS)
        .populate("familleIds", "nom"),
      ShopRequest.countDocuments(filter),
      ShopRequest.aggregate<{ _id: ShopRequestStatus; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const counts = Object.fromEntries(
      Object.values(ShopRequestStatus).map((value) => [
        value,
        grouped.find((entry) => entry._id === value)?.count ?? 0,
      ])
    ) as Record<ShopRequestStatus, number>;

    logger.info(`Liste des demandes de boutique — total : ${total}`);

    const response = BaseResponse.WithSuccess(
      {
        requests: requests.map(toShopRequestResponseDto),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        counts,
      },
      "Demandes récupérées avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste des demandes de boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /shop-requests/:id   (admin ou demandeur)
// ─────────────────────────────────────────────
export const getShopRequestById = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);
    const request = await ShopRequest.findById(id)
      .populate("userId", APPLICANT_FIELDS)
      .populate("familleIds", "nom");

    if (!request) {
      const response = BaseResponse.NotFound("Demande introuvable.");
      return res.status(response.statusCode).json(response);
    }

    const dto = toShopRequestResponseDto(request);
    if (req.user?.entityType !== EntityType.ADMIN && dto.userId !== req.user?.id) {
      logger.warn(`Lecture de la demande ${id} refusée à ${req.user?.id}`);
      const response = BaseResponse.Forbidden("Vous ne pouvez consulter que vos propres demandes.");
      return res.status(response.statusCode).json(response);
    }

    const response = BaseResponse.WithSuccess(dto, "Demande récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur lecture demande de boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  PATCH /shop-requests/:id/approve   (admin)
//  Dans une même transaction : la boutique est créée avec les réponses de
//  la demande, le compte devient gérant (User et EntitiesLogin), la demande
//  est close. Les sessions ouvertes du demandeur suivent ensuite, pour qu'il
//  accède à son espace vendeur sans se reconnecter.
// ─────────────────────────────────────────────
export const approveShopRequest = async (req: Request, res: Response) => {
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
    logger.info(`Approbation de la demande de boutique ${id} par ${req.user?.id}`);

    const request = await ShopRequest.findById(id).session(session);
    if (!request) {
      await session.abortTransaction();
      const response = BaseResponse.NotFound("Demande introuvable.");
      return res.status(response.statusCode).json(response);
    }

    if (request.status !== ShopRequestStatus.PENDING) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(alreadyReviewed(request.status));
      return res.status(response.statusCode).json(response);
    }

    const user = await User.findById(request.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      const response = BaseResponse.NotFound("Le compte du demandeur n'existe plus.");
      return res.status(response.statusCode).json(response);
    }

    // Le nom était libre au dépôt ; une autre boutique a pu le prendre depuis.
    const homonym = await Shop.findOne(sameName(request.nom)).session(session);
    if (homonym) {
      await session.abortTransaction();
      const response = BaseResponse.Conflict(
        "Une boutique porte déjà ce nom : refusez la demande en invitant le demandeur à en choisir un autre."
      );
      return res.status(response.statusCode).json(response);
    }

    const [shop] = await Shop.create(
      [{
        ownerId: user._id,
        nom: request.nom,
        description: request.description,
        email: request.email ?? user.email,
        adresse: request.adresse,
      }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!shop) throw new Error("La création de la boutique a échoué.");

    // Un administrateur garde ses droits ; tout autre compte devient gérant.
    const promoted = user.role !== EntityType.SHOP && user.role !== EntityType.ADMIN;
    if (promoted) {
      user.role = EntityType.SHOP;
      await user.save({ session });
      await EntitiesLogin.updateOne(
        { entityId: user._id },
        { entityType: EntityType.SHOP },
        { session }
      );
    }

    request.status = ShopRequestStatus.APPROVED;
    request.rejectionReason = null;
    request.reviewedBy = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null;
    request.reviewedAt = new Date();
    request.shopId = shop._id as mongoose.Types.ObjectId;
    await request.save({ session });

    await session.commitTransaction();

    logger.info(`Boutique ${shop._id} ouverte pour ${user._id} (demande ${id})`);

    // Hors transaction : un échec ici n'annule pas l'ouverture. Au pire, le
    // gérant devra se reconnecter pour accéder à son espace.
    if (promoted) {
      try {
        await updateUserSessionsRole(String(user._id), EntityType.SHOP);
      } catch (sessionError) {
        logger.error(`Sessions de ${user._id} non mises à jour : ${(sessionError as Error).message}`);
      }
    }

    try {
      sendShopRequestApprovedMail(user, request.nom);
    } catch (mailError) {
      logger.error(`Email d'approbation non envoyé : ${(mailError as Error).message}`);
    }

    const response = BaseResponse.WithSuccess(
      toShopRequestResponseDto(request),
      "Demande approuvée : la boutique est ouverte."
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur approbation demande de boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  PATCH /shop-requests/:id/reject   (admin)   { reason }
// ─────────────────────────────────────────────
export const rejectShopRequest = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);
    const { reason } = req.body as { reason: string };

    const request = await ShopRequest.findById(id);
    if (!request) {
      const response = BaseResponse.NotFound("Demande introuvable.");
      return res.status(response.statusCode).json(response);
    }

    if (request.status !== ShopRequestStatus.PENDING) {
      const response = BaseResponse.BadRequest(alreadyReviewed(request.status));
      return res.status(response.statusCode).json(response);
    }

    request.status = ShopRequestStatus.REJECTED;
    request.rejectionReason = reason;
    request.reviewedBy = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null;
    request.reviewedAt = new Date();
    await request.save();

    logger.info(`Demande de boutique refusée : ${id} par ${req.user?.id}`);

    try {
      const user = await User.findById(request.userId);
      if (user) sendShopRequestRejectedMail(user, request.nom, reason);
    } catch (mailError) {
      logger.error(`Email de refus non envoyé : ${(mailError as Error).message}`);
    }

    const response = BaseResponse.WithSuccess(toShopRequestResponseDto(request), "Demande refusée.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur refus demande de boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};
