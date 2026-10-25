import type { Request, Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { User, EntitiesLogin, EntityType, type IUser } from "../models/user.model.js";
import {
  sendWelcomeMail,
  sendForgotPasswordMail,
  sendVerifyEmailMail,
} from "../shared/helpers/mail.helper.js";
import {
  regenerateSession,
  destroySession,
  destroyUserSessions,
  type SessionUser,
} from "../shared/config/session.config.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import { normaliserProjet } from "../shared/helpers/projet.helper.js";
import logger from '../shared/logger/logger.js';
import { validationResult } from "express-validator";
import type {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from "../shared/interfaces/Auth.interfaces.js";

export interface AuthRequest<TBody> extends Request {
  user?: SessionUser;
  body: TBody;
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
// Identité minimale conservée en session : tout le reste est relu en base
// à chaque requête, donc jamais obsolète.
const toSessionUser = (user: IUser): SessionUser => ({
  id: String(user._id),
  entityType: user.role as unknown as EntityType,
});

// ─────────────────────────────────────────────
//  REGISTER (AVEC TRANSACTION)
// ─────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      session.endSession();
      res.status(422).json(BaseResponse.BadRequest(
        errors.array().map(e => e.msg).join(" | ")
      ));
      return;
    }

    const { nom, prenom, email, telephone, password, role, projet } = req.body as RegisterDto;

    logger.info(`Tentative d'inscription pour : ${email}`);

    const existing = await User.findOne({ email }).session(session);
    if (existing) {
      await session.abortTransaction();
      session.endSession();
      logger.warn(`Inscription refusée — email déjà utilisé : ${email}`);
      res.status(409).json(BaseResponse.Conflict("Email déjà utilisé."));
      return;
    }

    const emailVerifyToken = crypto.randomBytes(32).toString("hex");

    // Création du User
    const [user] = await User.create([{
      nom,
      prenom,
      email,
      telephone,
      role,
      // Le projet décrit à l'inscription personnalise le site dès la première visite.
      projet: normaliserProjet(projet, new Date()),
    }], { session });

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!user) throw new Error("La création de l'utilisateur a échoué.");

    // Création du EntitiesLogin - Maintenant le typage est correct ✅
    await EntitiesLogin.create([{
      entityId: user._id,
      email: email,
      password: password,
      entityType: user.role,
      emailVerifyToken: emailVerifyToken,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // Envoi email hors transaction
    try {
      await sendVerifyEmailMail(user, emailVerifyToken);
    } catch (emailError) {
      logger.error(`Erreur d'envoi d'email pour ${email}: ${emailError}`);
    }

    logger.info(`Compte créé avec succès pour : ${email}`);

    res.status(201).json(BaseResponse.Created(null, "Compte créé. Vérifie ton email."));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Erreur lors de l'inscription : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  LOGIN (ouvre une session serveur)
// ─────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as LoginDto;

    logger.info(`Tentative de connexion pour : ${email}`);

    const [entity, user] = await Promise.all([
      EntitiesLogin.findOne({ email }),
      User.findOne({ email }),
    ]);

    if (!user || !entity) {
      logger.warn(`Connexion échouée — utilisateur introuvable : ${email}`);
      res.status(401).json(BaseResponse.UnAuthorized("Identifiants invalides."));
      return;
    }

    const valid = await entity.comparePassword(password);
    if (!valid) {
      logger.warn(`Connexion échouée — mot de passe incorrect pour : ${email}`);
      res.status(401).json(BaseResponse.UnAuthorized("Identifiants invalides."));
      return;
    }

    if (!user.isEmailVerified) {
      logger.warn(`Connexion refusée — email non vérifié : ${email}`);
      res.status(403).json(BaseResponse.Forbidden("Email non vérifié."));
      return;
    }

    // Nouvel identifiant de session : une session ouverte avant le login ne
    // peut pas être réutilisée pour usurper le compte (fixation de session).
    await regenerateSession(req, toSessionUser(user));

    logger.info(`Connexion réussie pour : ${email}`);

    res.json(BaseResponse.WithSuccess({ user }));
  } catch (err) {
    logger.error(`Erreur lors de la connexion : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  LOGOUT (ferme la session serveur)
// ─────────────────────────────────────────────
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.session?.user?.id;

    await destroySession(req);

    // Le cookie ne sert plus à rien : on demande au navigateur de l'oublier.
    res.clearCookie(process.env.SESSION_NAME ?? "btp.sid", { path: "/" });

    logger.info(`Déconnexion réussie pour : ${userId ?? "session anonyme"}`);

    res.json(BaseResponse.WithSuccess(null, "Déconnexion réussie."));
  } catch (err) {
    logger.error(`Erreur lors de la déconnexion : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  LOGOUT ALL (ferme les sessions de tous les appareils)
// ─────────────────────────────────────────────
export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(BaseResponse.UnAuthorized("Authentification requise."));
      return;
    }

    const revoked = await destroyUserSessions(userId);
    await destroySession(req);
    res.clearCookie(process.env.SESSION_NAME ?? "btp.sid", { path: "/" });

    logger.info(`${revoked} session(s) révoquée(s) pour : ${userId}`);

    res.json(BaseResponse.WithSuccess({ revoked }, "Toutes les sessions ont été fermées."));
  } catch (err) {
    logger.error(`Erreur lors de la révocation des sessions : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  ME (Lecture seule - pas de transaction)
// ─────────────────────────────────────────────
export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    // L'identité provient de la session : impossible de lire le profil d'autrui.
    const id = req.user?.id;
    if (!id) {
      res.status(401).json(BaseResponse.UnAuthorized("Authentification requise."));
      return;
    }
    logger.info(`Récupération du profil pour l'utilisateur : ${id}`);

    const user = await User.findById(id);
    if (!user) {
      logger.warn(`Profil introuvable pour l'id : ${id}`);
      res.status(404).json(BaseResponse.NotFound("Utilisateur introuvable."));
      return;
    }

    res.json(BaseResponse.WithSuccess(user));
  } catch (err) {
    logger.error(`Erreur lors de la récupération du profil : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  UPDATE ME (AVEC TRANSACTION)
// ─────────────────────────────────────────────
export const updateMe = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // L'identité provient de la session : on ne modifie que son propre profil.
    const userId = req.user?.id;
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      res.status(401).json(BaseResponse.UnAuthorized("Authentification requise."));
      return;
    }
    logger.info(`Mise à jour du profil pour l'utilisateur : ${userId}`);

    const { nom, prenom, telephone, avatar } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { nom, prenom, telephone, avatar },
      { new: true, runValidators: true, session }
    );

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      logger.warn(`Profil introuvable pour l'id : ${userId}`);
      res.status(404).json(BaseResponse.NotFound("Utilisateur introuvable."));
      return;
    }

    await session.commitTransaction();
    session.endSession();

    logger.info(`Profil mis à jour avec succès pour : ${userId}`);

    res.json(BaseResponse.WithSuccess(user));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Erreur lors de la mise à jour du profil : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  UPDATE PROJET
//  Le client décrit ou modifie son projet (types, avancement du chantier).
//  Un projet vide efface la réponse : la personnalisation repart de son
//  activité seule.
// ─────────────────────────────────────────────
export const updateProjet = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json(BaseResponse.UnAuthorized("Authentification requise."));
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json(BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | ")));
      return;
    }

    const projet = normaliserProjet(req.body, new Date());
    const user = await User.findByIdAndUpdate(userId, { projet }, { new: true, runValidators: true });
    if (!user) {
      res.status(404).json(BaseResponse.NotFound("Utilisateur introuvable."));
      return;
    }

    logger.info(`Projet mis à jour pour ${userId} : ${projet ? [...projet.types, projet.avancement ?? ""].join(" ").trim() : "aucun"}`);
    res.json(BaseResponse.WithSuccess(user, "Projet enregistré."));
  } catch (err) {
    logger.error(`Erreur lors de la mise à jour du projet : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  CHANGE PASSWORD (AVEC TRANSACTION)
// ─────────────────────────────────────────────
export const changePassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {

    // L'identité provient de la session : on ne change que son propre mot de passe.
    const userId = req.user?.id;
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      res.status(401).json(BaseResponse.UnAuthorized("Authentification requise."));
      return;
    }
    logger.info(`Changement de mot de passe pour : ${userId}`);

    const { currentPassword, newPassword } = req.body;

    const login = await EntitiesLogin.findOne({ entityId: userId }).session(session);
    if (!login) {
      await session.abortTransaction();
      session.endSession();
      logger.warn(`Changement de mot de passe — utilisateur introuvable : ${userId}`);
      res.status(404).json(BaseResponse.NotFound());
      return;
    }

    const valid = await login.comparePassword(currentPassword);
    if (!valid) {
      await session.abortTransaction();
      session.endSession();
      logger.warn(`Changement de mot de passe — mot de passe actuel incorrect pour : ${userId}`);
      res.status(400).json(BaseResponse.BadRequest("Mot de passe actuel incorrect."));
      return;
    }

    login.password = newPassword;
    await login.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Un mot de passe qui change invalide les sessions ouvertes ailleurs.
    // La session courante est renouvelée : l'utilisateur reste connecté ici.
    const currentUser = req.session.user;
    if (currentUser) {
      await destroyUserSessions(userId, req.sessionID);
      await regenerateSession(req, currentUser);
    }

    logger.info(`Mot de passe changé avec succès pour : ${userId}`);

    res.json(BaseResponse.WithSuccess(null, "Mot de passe mis à jour."));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Erreur lors du changement de mot de passe : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  FORGOT PASSWORD (AVEC TRANSACTION)
// ─────────────────────────────────────────────
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email } = req.body as ForgotPasswordDto;

    logger.info(`Demande de réinitialisation de mot de passe pour : ${email}`);

    const login = await EntitiesLogin.findOne({ email }).session(session);
    if (!login) {
      await session.abortTransaction();
      session.endSession();
      logger.warn(`Réinitialisation — email introuvable : ${email}`);
      res.status(404).json(BaseResponse.NotFound("Email introuvable."));
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    login.resetPasswordToken   = token;
    login.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await login.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Envoi email (hors transaction)
    try {
      const user = await User.findOne({ email });
      if (user) await sendForgotPasswordMail(user, token);
    } catch (emailError) {
      logger.error(`Erreur d'envoi d'email de réinitialisation pour ${email}: ${emailError}`);
    }

    logger.info(`Email de réinitialisation envoyé à : ${email}`);

    res.json(BaseResponse.WithSuccess(null, "Email de réinitialisation envoyé."));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Erreur lors de la demande de réinitialisation : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  RESET PASSWORD (AVEC TRANSACTION)
// ─────────────────────────────────────────────
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const token = String(req.params.token);

    logger.info("Tentative de réinitialisation de mot de passe");

    const login = await EntitiesLogin.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    }).session(session);

    if (!login) {
      await session.abortTransaction();
      session.endSession();
      logger.warn("Réinitialisation — token invalide ou expiré");
      res.status(400).json(BaseResponse.BadRequest("Token invalide ou expiré."));
      return;
    }

    const { password } = req.body as ResetPasswordDto;
    login.password             = password;
    login.resetPasswordToken   = null;
    login.resetPasswordExpires = null;
    await login.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Le mot de passe a pu être compromis : aucune session ne survit.
    await destroyUserSessions(String(login.entityId));

    logger.info(`Mot de passe réinitialisé avec succès pour : ${login.email}`);

    res.json(BaseResponse.WithSuccess(null, "Mot de passe réinitialisé."));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Erreur lors de la réinitialisation du mot de passe : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  VERIFY EMAIL (AVEC TRANSACTION)
// ─────────────────────────────────────────────
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const token = String(req.params.token);

    logger.info("Tentative de vérification d'email");

    const login = await EntitiesLogin.findOne({ emailVerifyToken: token }).session(session);
    if (!login) {
      await session.abortTransaction();
      session.endSession();
      logger.warn("Vérification email — token invalide");
      res.status(400).json(BaseResponse.BadRequest("Token invalide."));
      return;
    }

    login.emailVerifyToken = null;
    await login.save({ session });

    const user = await User.findOneAndUpdate(
      { email: login.email },
      { isEmailVerified: true },
      { new: true, session }
    );

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      logger.warn(`Vérification email — utilisateur introuvable pour : ${login.email}`);
      res.status(404).json(BaseResponse.NotFound("Utilisateur introuvable."));
      return;
    }

    await session.commitTransaction();
    session.endSession();

    // Envoi email de bienvenue (hors transaction)
    try {
      await sendWelcomeMail(user);
    } catch (emailError) {
      logger.error(`Erreur d'envoi d'email de bienvenue pour ${login.email}: ${emailError}`);
    }

    logger.info(`Email vérifié avec succès pour : ${login.email}`);

    res.json(BaseResponse.WithSuccess(null, "Email vérifié avec succès."));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Erreur lors de la vérification d'email : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};

// ─────────────────────────────────────────────
//  RESEND VERIFICATION (AVEC TRANSACTION)
// ─────────────────────────────────────────────
export const resendVerification = async (
  req: AuthRequest<{ user: Partial<IUser> }>,
  res: Response
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // L'identité provient de la session (route protégée par requireAuth).
    const userId = String(req.user?.id ?? "");
    logger.info(`Renvoi de l'email de vérification pour : ${userId}`);

    const login = await EntitiesLogin.findOne({ entityId: userId }).session(session);
    const user = await User.findById(userId).session(session);

    if (!login || !user) {
      await session.abortTransaction();
      session.endSession();
      logger.warn(`Renvoi vérification — entité introuvable : ${req.user?.id}`);
      res.status(404).json(BaseResponse.NotFound());
      return;
    }

    if (user.isEmailVerified) {
      await session.abortTransaction();
      session.endSession();
      logger.warn(`Renvoi vérification — email déjà vérifié : ${login.email}`);
      res.status(400).json(BaseResponse.BadRequest("Email déjà vérifié."));
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    login.emailVerifyToken = token;
    await login.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Envoi email (hors transaction)
    try {
      await sendVerifyEmailMail(user, token);
    } catch (emailError) {
      logger.error(`Erreur d'envoi d'email de vérification pour ${login.email}: ${emailError}`);
    }

    logger.info(`Email de vérification renvoyé à : ${login.email}`);

    res.json(BaseResponse.WithSuccess(null, "Email de vérification renvoyé."));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Erreur lors du renvoi de la vérification : ${(err as Error).message}`);
    res.status(500).json(BaseResponse.ServerError((err as Error).message));
  }
};