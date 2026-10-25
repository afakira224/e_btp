import { query, type ValidationChain } from "express-validator";

// ─────────────────────────────────────────────
//  Recommandations personnalisées.
// ─────────────────────────────────────────────

/** Pages qui reçoivent des sélections personnalisées. */
export const PAGES_RECOMMANDATION = ["accueil", "promotions", "nouveautes", "meilleures-ventes"] as const;
export type PageRecommandation = (typeof PAGES_RECOMMANDATION)[number];

/** Produits vus au plus (historique local d'un visiteur sans compte). */
export const MAX_VUS = 20;

// Une liste d'identifiants séparés par des virgules : `a,b,c`.
const listeIds = (champ: string, max: number, facultatif: boolean) =>
  (facultatif ? query(champ).optional() : query(champ).notEmpty().withMessage(`Le paramètre ${champ} est requis.`))
    .isString().withMessage(`Le paramètre ${champ} doit être une liste d'identifiants.`)
    .custom((value: string) => {
      const ids = value.split(",").filter(Boolean);
      if (ids.length > max) throw new Error(`${max} identifiants au plus dans ${champ}.`);
      if (!ids.every((id) => /^[0-9a-f]{24}$/i.test(id))) throw new Error(`Identifiant invalide dans ${champ}.`);
      return true;
    });

// GET /recommandations?page=&vus=&limit=
export const recommandationsForm: ValidationChain[] = [
  query("page")
    .optional()
    .isIn(PAGES_RECOMMANDATION).withMessage(`Page invalide. Valeurs acceptées : ${PAGES_RECOMMANDATION.join(", ")}.`),
  listeIds("vus", MAX_VUS, true),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 24 }).withMessage("limit doit être compris entre 1 et 24."),
];

// GET /recommandations/complements?offres=&limit=
export const complementsForm: ValidationChain[] = [
  listeIds("offres", 50, false),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 24 }).withMessage("limit doit être compris entre 1 et 24."),
];

/** `a,b,,c` → ["a", "b", "c"], sans doublon. */
export const lireIds = (value: unknown): string[] =>
  typeof value === "string" ? [...new Set(value.split(",").filter(Boolean))] : [];
