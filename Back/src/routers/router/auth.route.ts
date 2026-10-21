import express from "express";
import { requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { validate } from "../../shared/middlewares/validate.middleware.js";
import { authLimiter, mailLimiter } from "../../shared/middlewares/rateLimit.middleware.js";
import {
  register,
  login,
  me,
  updateMe,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  logout,
  logoutAll,
} from "../../controllers/authController.controller.js";
import {
  registerForm,
  loginForm,
  updateForm,
  forgotPasswordForm,
  resetPasswordForm,
  changePasswordForm,
  verifyEmailParam,
} from "../../shared/forms/auth.form.js";

const authRouter = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Créer un compte
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, telephone, password, role]
 *             properties:
 *               nom: { type: string, example: Diallo }
 *               prenom: { type: string, example: Mamadou }
 *               email: { type: string, format: email, example: mamadou@btp.com }
 *               telephone: { type: string, example: "+224620000000" }
 *               password: { type: string, minLength: 8, example: "Secret@123" }
 *               role: { type: string, enum: [user, shop, admin, user_societe], example: user }
 *     responses:
 *       201:
 *         description: Compte créé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       409:
 *         description: Email déjà utilisé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       422:
 *         description: Erreur de validation
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.post("/register", authLimiter, registerForm, register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Se connecter
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: mamadou@btp.com }
 *               password: { type: string, example: "Secret@123" }
 *     responses:
 *       200:
 *         description: Connexion réussie. Un cookie de session httpOnly est posé.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       401:
 *         description: Identifiants invalides
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.post("/login", authLimiter, loginForm, login);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Se déconnecter (ferme la session courante)
 *     responses:
 *       200:
 *         description: Déconnexion réussie
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
authRouter.post("/logout", logout);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Fermer les sessions de tous les appareils
 *     responses:
 *       200:
 *         description: Sessions révoquées
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       401:
 *         description: Authentification requise
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.post("/logout-all", requireAuth, logoutAll);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Demander la réinitialisation du mot de passe
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: mamadou@btp.com }
 *     responses:
 *       200:
 *         description: Email de réinitialisation envoyé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Email introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.post("/forgot-password", mailLimiter, forgotPasswordForm, forgotPassword);

/**
 * @swagger
 * /auth/reset-password/{token}:
 *   put:
 *     tags: [Auth]
 *     summary: Réinitialiser le mot de passe
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: Token reçu par email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password, confirmPassword]
 *             properties:
 *               password: { type: string, minLength: 8, example: "NewSecret@123" }
 *               confirmPassword: { type: string, example: "NewSecret@123" }
 *     responses:
 *       200:
 *         description: Mot de passe réinitialisé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Token invalide ou expiré
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.put("/reset-password/:token", resetPasswordForm, resetPassword);

/**
 * @swagger
 * /auth/verify-email/{token}:
 *   get:
 *     tags: [Auth]
 *     summary: Vérifier l'adresse email
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: Token reçu par email lors de l'inscription
 *     responses:
 *       200:
 *         description: Email vérifié
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Token invalide
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.get("/verify-email/:token", verifyEmailParam, validate, verifyEmail);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Récupérer son profil
 *     responses:
 *       200:
 *         description: Profil retourné
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Utilisateur introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.get("/me", requireAuth, me);

/**
 * @swagger
 * /auth/me:
 *   put:
 *     tags: [Auth]
 *     summary: Mettre à jour son profil
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               nom: { type: string, example: Diallo }
 *               prenom: { type: string, example: Mamadou }
 *               telephone: { type: string, example: "+224620000000" }
 *               avatar: { type: string, format: uri }
 *     responses:
 *       200:
 *         description: Profil mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Utilisateur introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.put("/me", requireAuth, updateForm, updateMe);

/**
 * @swagger
 * /auth/change-password:
 *   put:
 *     tags: [Auth]
 *     summary: Changer son mot de passe
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, currentPassword, newPassword, confirmNewPassword]
 *             properties:
 *               id: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               currentPassword: { type: string, example: "Secret@123" }
 *               newPassword: { type: string, minLength: 8, example: "NewSecret@456" }
 *               confirmNewPassword: { type: string, example: "NewSecret@456" }
 *     responses:
 *       200:
 *         description: Mot de passe mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Mot de passe actuel incorrect
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.put("/change-password", requireAuth, changePasswordForm, changePassword);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Renvoyer l'email de vérification
 *     responses:
 *       200:
 *         description: Email renvoyé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Email déjà vérifié
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
authRouter.post("/resend-verification", requireAuth, mailLimiter, resendVerification);

// Dev / test
// authRouter.post("/send-mail", async (req: Request, res: Response) => {
//   try {
//     const jobId = sendWelcomeMail({
//       email: process.env.MAIL_USER ?? "",
//       nom:   "Test User",
//     } as any);
//     res.json({ message: "Job ajouté en queue.", jobId });
//   } catch (err) {
//     res.status(500).json({ message: (err as Error).message });
//   }
// });

export default authRouter;