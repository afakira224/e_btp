import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import swaggerUi from "swagger-ui-express";
import mongoose from "mongoose";

import { swaggerSpec } from "./shared/swagger/swagger.config.js";
import { DB_CONNECT } from "./db/db.js";
import mainRouter from "./routers/router.router.js";
import logger from "./shared/logger/logger.js";
import { errorHandler, notFoundHandler } from "./shared/middlewares/error.middleware.js";
import { globalLimiter } from "./shared/middlewares/rateLimit.middleware.js";
import { buildSessionMiddleware } from "./shared/config/session.config.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 5000);

// ─────────────────────────────────────────────
//  Sécurité & performance
// ─────────────────────────────────────────────
app.disable("x-powered-by");

// Derrière un reverse proxy (Nginx, Heroku, Render…), Express doit lire
// X-Forwarded-Proto pour savoir que la connexion est en HTTPS : sans cela,
// le cookie de session marqué `secure` ne serait jamais émis.
if (process.env.TRUST_PROXY === "true" || process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// crossOriginResourcePolicy assoupli : les images d'uploads doivent rester
// consultables depuis le front, hébergé sur un autre domaine.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Origines autorisées, séparées par des virgules dans CORS_ORIGINS.
// `credentials: true` est indispensable : sans lui le navigateur n'envoie
// pas le cookie de session sur les requêtes cross-origin.
const corsOrigins = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: corsOrigins?.length ? corsOrigins : true,
    credentials: true,
  })
);

app.use(compression());
app.use(globalLimiter);

///test pour le commit


// ─────────────────────────────────────────────
//  Parsing
// ─────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─────────────────────────────────────────────
//  Session (cookie httpOnly + stockage MongoDB)
//  Placée avant les routes : req.session doit exister partout.
// ─────────────────────────────────────────────
app.use(buildSessionMiddleware());

// ─────────────────────────────────────────────
//  Fichiers statiques & documentation
// ─────────────────────────────────────────────
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─────────────────────────────────────────────
//  Sonde de santé (déploiement, orchestrateur, monitoring)
// ─────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    success: connected,
    status: connected ? "ok" : "degraded",
    database: connected ? "connected" : "disconnected",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
//  Routes applicatives
// ─────────────────────────────────────────────
app.use("/api/v1", mainRouter);

// ─────────────────────────────────────────────
//  404 puis gestionnaire d'erreurs global (toujours en dernier)
// ─────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─────────────────────────────────────────────
//  Démarrage : la base est connectée AVANT d'accepter du trafic.
// ─────────────────────────────────────────────
const start = async (): Promise<void> => {
  await DB_CONNECT();

  const server = app.listen(PORT, () => {
    logger.info(`Serveur démarré sur le port ${PORT}`);
    logger.info(`Documentation : http://localhost:${PORT}/api-docs`);
  });

  // Arrêt propre : on laisse les requêtes en cours se terminer.
  const shutdown = (signal: string) => {
    logger.info(`${signal} reçu — arrêt du serveur...`);
    server.close(() => {
      void mongoose.connection.close(false).then(() => {
        logger.info("Connexion MongoDB fermée. Arrêt terminé.");
        process.exit(0);
      });
    });

    // Filet de sécurité si des connexions restent ouvertes.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((error: unknown) => {
  logger.error(`Impossible de démarrer le serveur : ${(error as Error).message}`);
  process.exit(1);
});

export default app;
