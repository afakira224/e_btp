import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import type { Request, RequestHandler } from "express";
import type { EntityType } from "../../models/user.model.js";

// ─────────────────────────────────────────────
//  Identité stockée côté serveur, dans la session.
//  Le client ne reçoit qu'un identifiant de session signé (cookie httpOnly) :
//  aucune donnée d'identité ne transite ni ne se stocke dans le navigateur.
// ─────────────────────────────────────────────
export interface SessionUser {
  id: string;
  entityType: EntityType;
}

// Enrichit SessionData : req.session.user est renseigné au login.
declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

// Durée de vie du cookie et de la session en base, en jours.
export const SESSIONS_COLLECTION = "sessions";

const ttlDays = Number(process.env.SESSION_TTL_DAYS ?? 7);
const ttlMs = ttlDays * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────
//  Middleware de session.
//  Construit paresseusement : les variables d'environnement doivent être
//  chargées (dotenv) avant l'appel, ce que garantit index.ts.
// ─────────────────────────────────────────────
export const buildSessionMiddleware = (): RequestHandler => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET n'est pas défini dans les variables d'environnement.");
  }

  const mongoUrl = process.env.MONGO_URI;
  if (!mongoUrl) {
    throw new Error("MONGO_URI n'est pas défini : impossible de stocker les sessions.");
  }

  // En production, le cookie n'est émis que sur HTTPS. Derrière un proxy,
  // pensez à `app.set("trust proxy", 1)` pour que la détection fonctionne.
  const secure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production";

  // "lax" convient quand le front partage le domaine de l'API.
  // Front et API sur des domaines distincts : "none" + secure obligatoires.
  const sameSite = (process.env.COOKIE_SAME_SITE ?? (secure ? "none" : "lax")) as
    | "lax"
    | "strict"
    | "none";

  const domain = process.env.COOKIE_DOMAIN;

  return session({
    name: process.env.SESSION_NAME ?? "btp.sid",
    secret,
    resave: false,
    // Aucune session n'est écrite en base tant que l'utilisateur n'est pas
    // connecté : les visiteurs anonymes ne polluent pas la collection.
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
      mongoUrl,
      collectionName: SESSIONS_COLLECTION,
      // Sessions stockées en sous-document plutôt qu'en JSON sérialisé :
      // indispensable pour révoquer les sessions d'un utilisateur donné.
      stringify: false,
      ttl: ttlMs / 1000,
      // Ne réécrit la session en base qu'au bout de 10 min d'inactivité,
      // pour éviter une écriture à chaque requête.
      touchAfter: 10 * 60,
    }),
    cookie: {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: ttlMs,
      path: "/",
      ...(domain ? { domain } : {}),
    },
  });
};

// ─────────────────────────────────────────────
//  regenerateSession
//  Crée un nouvel identifiant de session en conservant l'identité.
//  À appeler au login (parade contre la fixation de session) et après
//  un changement de mot de passe.
// ─────────────────────────────────────────────
export const regenerateSession = (req: Request, user: SessionUser): Promise<void> =>
  new Promise((resolve, reject) => {
    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        reject(regenerateError);
        return;
      }

      req.session.user = user;

      // La sauvegarde explicite garantit que la session existe en base avant
      // que la réponse ne parte : la requête suivante la retrouvera à coup sûr.
      req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });

// ─────────────────────────────────────────────
//  destroySession
//  Supprime la session courante côté serveur (déconnexion).
// ─────────────────────────────────────────────
export const destroySession = (req: Request): Promise<void> =>
  new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });

// ─────────────────────────────────────────────
//  destroyUserSessions
//  Révoque toutes les sessions d'un utilisateur, sur tous ses appareils.
//  Utilisé après une réinitialisation ou un changement de mot de passe :
//  un mot de passe compromis ne doit laisser aucune session ouverte.
//  `exceptSid` permet de préserver la session qui déclenche l'opération.
// ─────────────────────────────────────────────
export const destroyUserSessions = async (
  userId: string,
  exceptSid?: string
): Promise<number> => {
  const filter: Record<string, unknown> = { "session.user.id": userId };
  if (exceptSid) filter["_id"] = { $ne: exceptSid };

  const result = await mongoose.connection
    .collection(SESSIONS_COLLECTION)
    .deleteMany(filter);

  return result.deletedCount ?? 0;
};

// ─────────────────────────────────────────────
//  updateUserSessionsRole
//  Reporte un changement de type de compte dans les sessions déjà ouvertes.
//  requireRole lit le type en session : sans cette mise à jour, un client
//  dont la boutique vient d'être approuvée resterait « user » jusqu'à sa
//  prochaine connexion, et l'espace vendeur lui répondrait 403.
// ─────────────────────────────────────────────
export const updateUserSessionsRole = async (
  userId: string,
  entityType: EntityType
): Promise<number> => {
  const result = await mongoose.connection
    .collection(SESSIONS_COLLECTION)
    .updateMany(
      { "session.user.id": userId },
      { $set: { "session.user.entityType": entityType } }
    );

  return result.modifiedCount ?? 0;
};
