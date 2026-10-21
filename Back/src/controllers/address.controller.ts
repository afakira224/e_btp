import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import { Address } from "../models/address.model.js";
import { User } from "../models/user.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { toAddressResponseDto } from "../shared/interfaces/Address.interfaces.js";

// Retire le drapeau "par défaut" des autres adresses de l'utilisateur.
const unsetOtherDefaults = async (
  userId: mongoose.Types.ObjectId | string,
  keepId: mongoose.Types.ObjectId | string | null,
  session: mongoose.ClientSession
): Promise<void> => {
  const filter: Record<string, unknown> = { userId, isDefault: true };
  if (keepId) filter._id = { $ne: keepId };
  await Address.updateMany(filter, { isDefault: false }, { session });
};

// ─────────────────────────────────────────────
//  POST /addresses
// ─────────────────────────────────────────────
export const createAddress = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const { userId, label, destinataire, telephone, adresse, ville, commune, pays, isDefault } = req.body;

    logger.info(`Création adresse pour utilisateur : ${userId}`);

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      logger.warn(`Utilisateur introuvable : ${userId}`);
      const response = BaseResponse.NotFound("Utilisateur introuvable");
      return res.status(response.statusCode).json(response);
    }

    // La première adresse devient par défaut d'office ; sinon on respecte isDefault.
    const count = await Address.countDocuments({ userId }).session(session);
    const makeDefault = count === 0 ? true : !!isDefault;

    if (makeDefault) {
      await unsetOtherDefaults(userId, null, session);
    }

    const [address] = await Address.create(
      [{ userId, label, destinataire, telephone, adresse, ville, commune, pays, isDefault: makeDefault }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!address) throw new Error("La création de l'adresse a échoué.");

    await session.commitTransaction();

    logger.info(`Adresse créée : ${address._id}`);

    const response = BaseResponse.Created(toAddressResponseDto(address), "Adresse créée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur création adresse : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  GET /addresses?userId=
// ─────────────────────────────────────────────
export const getAddresses = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const userId = String(req.query.userId);

    // Adresse par défaut en tête, puis les plus récentes.
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });

    logger.info(`Liste adresses pour ${userId} : ${addresses.length}`);

    const response = BaseResponse.WithSuccess(
      addresses.map(toAddressResponseDto),
      "Adresses récupérées avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste adresses : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /addresses/:id
// ─────────────────────────────────────────────
export const getAddressById = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);

    const address = await Address.findById(id);
    if (!address) {
      logger.warn(`Adresse introuvable : ${id}`);
      const response = BaseResponse.NotFound("Adresse non trouvée");
      return res.status(response.statusCode).json(response);
    }

    const response = BaseResponse.WithSuccess(toAddressResponseDto(address), "Adresse récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération adresse : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  PUT /addresses/:id
// ─────────────────────────────────────────────
export const updateAddress = async (req: Request, res: Response) => {
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
    const { label, destinataire, telephone, adresse, ville, commune, pays, isDefault } = req.body;

    logger.info(`Mise à jour adresse : ${id}`);

    const address = await Address.findById(id).session(session);
    if (!address) {
      await session.abortTransaction();
      logger.warn(`Adresse introuvable pour mise à jour : ${id}`);
      const response = BaseResponse.NotFound("Adresse non trouvée");
      return res.status(response.statusCode).json(response);
    }

    if (label !== undefined) address.label = label;
    if (destinataire !== undefined) address.destinataire = destinataire;
    if (telephone !== undefined) address.telephone = telephone;
    if (adresse !== undefined) address.adresse = adresse;
    if (ville !== undefined) address.ville = ville;
    if (commune !== undefined) address.commune = commune;
    if (pays !== undefined) address.pays = pays;

    // Passage en "par défaut" : on retire le drapeau des autres adresses.
    if (isDefault === true && !address.isDefault) {
      await unsetOtherDefaults(address.userId, id, session);
      address.isDefault = true;
    }

    // Retrait du drapeau : une autre adresse doit prendre le relais, sinon
    // l'utilisateur se retrouverait sans adresse par défaut.
    if (isDefault === false && address.isDefault) {
      const next = await Address.findOne({ userId: address.userId, _id: { $ne: id } })
        .sort({ createdAt: -1 })
        .session(session);

      if (!next) {
        await session.abortTransaction();
        logger.warn(`Retrait du défaut refusé : ${id} est la seule adresse de l'utilisateur`);
        const response = BaseResponse.BadRequest(
          "Impossible de retirer l'adresse par défaut : c'est votre seule adresse."
        );
        return res.status(response.statusCode).json(response);
      }

      address.isDefault = false;
      next.isDefault = true;
      await next.save({ session });
    }

    await address.save({ session });
    await session.commitTransaction();

    logger.info(`Adresse mise à jour : ${id}`);

    const response = BaseResponse.WithSuccess(toAddressResponseDto(address), "Adresse mise à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur mise à jour adresse : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  PATCH /addresses/:id/default
// ─────────────────────────────────────────────
export const setDefaultAddress = async (req: Request, res: Response) => {
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

    logger.info(`Définition adresse par défaut : ${id}`);

    const address = await Address.findById(id).session(session);
    if (!address) {
      await session.abortTransaction();
      logger.warn(`Adresse introuvable : ${id}`);
      const response = BaseResponse.NotFound("Adresse non trouvée");
      return res.status(response.statusCode).json(response);
    }

    await unsetOtherDefaults(address.userId, id, session);
    address.isDefault = true;
    await address.save({ session });

    await session.commitTransaction();

    logger.info(`Adresse par défaut définie : ${id}`);

    const response = BaseResponse.WithSuccess(toAddressResponseDto(address), "Adresse définie par défaut avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur définition adresse par défaut : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /addresses/:id (soft delete)
//  Si l'adresse supprimée était par défaut, on promeut la plus récente restante.
// ─────────────────────────────────────────────
export const deleteAddress = async (req: Request, res: Response) => {
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

    logger.info(`Suppression adresse : ${id}`);

    const address = await Address.findById(id).session(session);
    if (!address) {
      await session.abortTransaction();
      logger.warn(`Adresse introuvable pour suppression : ${id}`);
      const response = BaseResponse.NotFound("Adresse non trouvée");
      return res.status(response.statusCode).json(response);
    }

    const wasDefault = address.isDefault;
    address.deletedAt = new Date();
    address.isDefault = false;
    await address.save({ session });

    // Promotion d'une autre adresse en défaut si nécessaire.
    if (wasDefault) {
      const next = await Address.findOne({ userId: address.userId }).sort({ createdAt: -1 }).session(session);
      if (next) {
        next.isDefault = true;
        await next.save({ session });
      }
    }

    await session.commitTransaction();

    logger.info(`Adresse supprimée (soft) : ${id}`);

    const response = BaseResponse.WithSuccess(null, "Adresse supprimée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur suppression adresse : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};
