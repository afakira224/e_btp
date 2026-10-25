import { z } from "zod";
import {
  CatalogSize,
  SellerExperience,
  SellerType,
  type ShopRequest,
  type ShopRequestInput,
} from "../../../../entities/shop-request";

const oneOf = (allowed: Record<string, string>) => (value: string) =>
  Object.values(allowed).includes(value);

// ─────────────────────────────────────────────
//  Questionnaire d'ouverture — mêmes bornes et mêmes messages que
//  createShopRequestForm côté back, pour éviter un aller-retour inutile.
//  Le serveur revalide tout.
//
//  Les choix sont des chaînes tant que le formulaire est ouvert (« » = pas
//  encore répondu) ; toInput les convertit une fois la saisie validée.
// ─────────────────────────────────────────────
export const shopRequestSchema = z
  .object({
    nom: z
      .string()
      .trim()
      .min(2, "Le nom de la boutique doit compter entre 2 et 100 caractères.")
      .max(100, "Le nom de la boutique doit compter entre 2 et 100 caractères."),
    description: z
      .string()
      .trim()
      .min(20, "Présentez votre boutique en 20 caractères au moins.")
      .max(1000, "La présentation ne peut dépasser 1000 caractères."),
    familleIds: z.array(z.string()).min(1, "Choisissez au moins un domaine d'activité."),
    sellerType: z
      .string()
      .refine(oneOf(SellerType), "Précisez si vous vendez en tant que particulier ou entreprise."),
    rccm: z.string(),
    experience: z.string().refine(oneOf(SellerExperience), "Indiquez l'ancienneté de votre activité."),
    catalogSize: z
      .string()
      .refine(oneOf(CatalogSize), "Indiquez le nombre de produits que vous comptez vendre."),
    hasPhysicalStore: z
      .string()
      // Annoté `boolean` : sinon TypeScript en ferait un prédicat de type, et la
      // valeur de départ « » (pas encore répondu) ne serait plus admise.
      .refine((value): boolean => value === "oui" || value === "non", "Indiquez si vous disposez d'un point de vente."),
    adresse: z
      .string()
      .trim()
      .min(5, "L'adresse doit compter entre 5 et 255 caractères.")
      .max(255, "L'adresse doit compter entre 5 et 255 caractères."),
    email: z
      .string()
      .trim()
      .refine((value) => value === "" || z.email().safeParse(value).success, "Email de la boutique invalide."),
    message: z.string().trim().max(1000, "Le message ne peut dépasser 1000 caractères."),
    acceptTerms: z
      .boolean()
      .refine((value) => value, "Vous devez accepter les conditions de vente de la plateforme."),
  })
  // Le registre du commerce n'est exigé que d'une entreprise.
  .superRefine((values, context) => {
    if (values.sellerType !== SellerType.ENTREPRISE) return;
    const rccm = values.rccm.trim();
    if (!rccm) {
      context.addIssue({ code: "custom", path: ["rccm"], message: "Le numéro RCCM est requis pour une entreprise." });
    } else if (rccm.length < 5 || rccm.length > 50) {
      context.addIssue({
        code: "custom",
        path: ["rccm"],
        message: "Le numéro RCCM doit compter entre 5 et 50 caractères.",
      });
    }
  });

export type ShopRequestValues = z.infer<typeof shopRequestSchema>;

export const EMPTY_VALUES: ShopRequestValues = {
  nom: "",
  description: "",
  familleIds: [],
  sellerType: "",
  rccm: "",
  experience: "",
  catalogSize: "",
  hasPhysicalStore: "",
  adresse: "",
  email: "",
  message: "",
  acceptTerms: false,
};

/**
 * Une demande refusée sert de brouillon à la suivante : le demandeur corrige
 * ce que le motif signale au lieu de tout ressaisir. L'acceptation des
 * conditions, elle, se redonne à chaque envoi.
 */
export const valuesFrom = (request: ShopRequest): ShopRequestValues => ({
  nom: request.nom,
  description: request.description,
  familleIds: request.familles.map((famille) => famille.id),
  sellerType: request.sellerType,
  rccm: request.rccm ?? "",
  experience: request.experience,
  catalogSize: request.catalogSize,
  hasPhysicalStore: request.hasPhysicalStore ? "oui" : "non",
  adresse: request.adresse,
  email: request.email ?? "",
  message: request.message ?? "",
  acceptTerms: false,
});

/** Saisie validée → corps de POST /shop-requests. */
export const toInput = (values: ShopRequestValues): ShopRequestInput => {
  const entreprise = values.sellerType === SellerType.ENTREPRISE;
  return {
    nom: values.nom.trim(),
    description: values.description.trim(),
    familleIds: values.familleIds,
    sellerType: values.sellerType as SellerType,
    ...(entreprise ? { rccm: values.rccm.trim() } : {}),
    experience: values.experience as SellerExperience,
    catalogSize: values.catalogSize as CatalogSize,
    hasPhysicalStore: values.hasPhysicalStore === "oui",
    adresse: values.adresse.trim(),
    ...(values.email.trim() ? { email: values.email.trim() } : {}),
    ...(values.message.trim() ? { message: values.message.trim() } : {}),
    acceptTerms: values.acceptTerms,
  };
};
