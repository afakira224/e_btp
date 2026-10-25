// ─────────────────────────────────────────────
//  SHOP REQUEST - DTO
// ─────────────────────────────────────────────

import type { Types } from "mongoose";
import type {
  CatalogSize,
  IShopRequest,
  SellerExperience,
  SellerType,
  ShopRequestStatus,
} from "../../models/shopRequest.model.js";

export interface CreateShopRequestDto {
  nom: string;
  description: string;
  familleIds: string[];
  sellerType: SellerType;
  rccm?: string;
  experience: SellerExperience;
  catalogSize: CatalogSize;
  hasPhysicalStore: boolean;
  adresse: string;
  email?: string;
  message?: string;
  acceptTerms: boolean;
}

/** Le demandeur, tel que l'administration le voit pour le recontacter. */
export interface ShopRequestApplicantDto {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string | undefined;
}

export interface ShopRequestResponseDto {
  id: string;
  userId: string;
  /** Présent quand le demandeur a été chargé (populate). */
  applicant?: ShopRequestApplicantDto | undefined;
  nom: string;
  description: string;
  /** Domaines choisis, avec leur nom quand ils ont été chargés. */
  familles: { id: string; nom?: string | undefined }[];
  sellerType: SellerType;
  rccm: string | null;
  experience: SellerExperience;
  catalogSize: CatalogSize;
  hasPhysicalStore: boolean;
  adresse: string;
  email: string | null;
  message: string | null;
  acceptedTermsAt: Date;
  status: ShopRequestStatus;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  shopId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Identifiant d'une référence, qu'elle ait été chargée (populate) ou non. */
const refId = (ref: unknown): string | null => {
  if (ref === null || ref === undefined) return null;
  // Un document chargé porte son `_id` ; un ObjectId aussi (il se renvoie lui-même).
  if (typeof ref === "object" && "_id" in ref && ref._id != null) return String(ref._id);
  return String(ref);
};

/** Document chargé par populate : un objet qui porte plus que son `_id`. */
const isPopulated = <T extends object>(ref: unknown, field: keyof T): ref is T & { _id: Types.ObjectId } =>
  typeof ref === "object" && ref !== null && field in ref;

export const toShopRequestResponseDto = (request: IShopRequest): ShopRequestResponseDto => {
  const owner: unknown = request.userId;
  const applicant = isPopulated<{ nom: string; prenom: string; email: string; telephone?: string }>(owner, "email")
    ? {
        id: owner._id.toString(),
        nom: owner.nom,
        prenom: owner.prenom,
        email: owner.email,
        telephone: owner.telephone,
      }
    : undefined;

  return {
    id: request._id.toString(),
    userId: refId(request.userId) ?? "",
    applicant,
    nom: request.nom,
    description: request.description,
    familles: (request.familleIds ?? []).map((famille: unknown) =>
      isPopulated<{ nom: string }>(famille, "nom")
        ? { id: famille._id.toString(), nom: famille.nom }
        : { id: refId(famille) ?? "" }
    ),
    sellerType: request.sellerType,
    rccm: request.rccm ?? null,
    experience: request.experience,
    catalogSize: request.catalogSize,
    hasPhysicalStore: request.hasPhysicalStore,
    adresse: request.adresse,
    email: request.email ?? null,
    message: request.message ?? null,
    acceptedTermsAt: request.acceptedTermsAt,
    status: request.status,
    rejectionReason: request.rejectionReason ?? null,
    reviewedAt: request.reviewedAt ?? null,
    shopId: refId(request.shopId),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
};
