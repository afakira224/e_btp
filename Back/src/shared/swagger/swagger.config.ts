import swaggerJsdoc from "swagger-jsdoc";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url)
const __dirname= path.dirname(__filename)
const toPosix = (p: string) => p.split(path.sep).join("/");
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "BTP API",
      version: "1.0.0",
      description: "Documentation de l'API BTP",
    },
    servers: [
      { url: "http://localhost:5000/api/v1", description: "Serveur local" },
    ],
    components: {
      securitySchemes: {
        // Authentification par session : le cookie est posé par /auth/login
        // et renvoyé automatiquement par le navigateur.
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: process.env.SESSION_NAME ?? "btp.sid",
        },
      },
      schemas: {
        // Garde ici SEULEMENT les schémas génériques réutilisés partout
        BaseSuccess: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Opération réussie." },
            statusCode: { type: "integer", example: 200 },
            data: { type: "object", nullable: true },
          },
        },
        BaseError: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Une erreur est survenue." },
            statusCode: { type: "integer", example: 400 },
            data: { type: "null", example: null },
          },
        },
      },
    },
    security: [{ cookieAuth: [] }],
  },
  // 👇 C'est ÇA qui change tout : swagger-jsdoc va scanner ces fichiers
  // et lire les commentaires @swagger au-dessus de chaque route
  apis: [
    toPosix(path.join(__dirname, "../../routers/**/*.ts")),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

console.log("Glob utilisé:", options.apis?.[0]);
console.log("Routes détectées:", Object.keys((swaggerSpec as any).paths || {}));