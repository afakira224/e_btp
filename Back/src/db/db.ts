import mongoose from "mongoose";
import logger from "../shared/logger/logger.js";

// ─────────────────────────────────────────────
//  Connexion MongoDB.
//  Lève une erreur en cas d'échec : c'est l'appelant (index.ts) qui décide
//  d'arrêter le processus, ce qui rend la fonction testable.
// ─────────────────────────────────────────────
export const DB_CONNECT = async (): Promise<typeof mongoose> => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI n'est pas défini dans les variables d'environnement.");
  }

  const connection = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
  });

  logger.info(`MongoDB connecté : ${connection.connection.host}`);

  mongoose.connection.on("error", (err: Error) => {
    logger.error(`Erreur de connexion MongoDB : ${err.message}`);
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB déconnecté.");
  });

  return connection;
};
