// ─────────────────────────────────────────────
//  Demande d'ouverture de boutique — miroir de ShopRequestResponseDto
//  (Back/src/shared/interfaces/ShopRequest.interfaces.ts).
//
//  Un client la dépose depuis son profil ; l'administration l'approuve (la
//  boutique est créée, le compte devient gérant) ou la refuse, motif à
//  l'appui. Les dates arrivent en chaînes, sérialisées par JSON.
// ─────────────────────────────────────────────

export const ShopRequestStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export type ShopRequestStatus = (typeof ShopRequestStatus)[keyof typeof ShopRequestStatus];

export const SHOP_REQUEST_STATUSES: readonly ShopRequestStatus[] = Object.values(ShopRequestStatus);

export const SHOP_REQUEST_STATUS_LABELS: Record<ShopRequestStatus, string> = {
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Refusée",
  cancelled: "Annulée",
};

export const SellerType = {
  PARTICULIER: "particulier",
  ENTREPRISE: "entreprise",
} as const;

export type SellerType = (typeof SellerType)[keyof typeof SellerType];

export const SELLER_TYPE_LABELS: Record<SellerType, string> = {
  particulier: "Particulier",
  entreprise: "Entreprise",
};

export const SellerExperience = {
  DEBUTANT: "debutant",
  UN_A_TROIS: "1_3_ans",
  TROIS_A_DIX: "3_10_ans",
  PLUS_DE_DIX: "plus_10_ans",
} as const;

export type SellerExperience = (typeof SellerExperience)[keyof typeof SellerExperience];

export const SELLER_EXPERIENCE_LABELS: Record<SellerExperience, string> = {
  debutant: "Je démarre (moins d'un an)",
  "1_3_ans": "De 1 à 3 ans",
  "3_10_ans": "De 3 à 10 ans",
  plus_10_ans: "Plus de 10 ans",
};

export const CatalogSize = {
  MOINS_DE_50: "moins_50",
  DE_50_A_200: "50_200",
  PLUS_DE_200: "plus_200",
} as const;

export type CatalogSize = (typeof CatalogSize)[keyof typeof CatalogSize];

export const CATALOG_SIZE_LABELS: Record<CatalogSize, string> = {
  moins_50: "Moins de 50 produits",
  "50_200": "De 50 à 200 produits",
  plus_200: "Plus de 200 produits",
};

/** Le demandeur, tel que l'administration le voit pour le recontacter. */
export interface ShopRequestApplicant {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string | undefined;
}

export interface ShopRequest {
  id: string;
  userId: string;
  /** Présent dans les lectures de l'administration. */
  applicant?: ShopRequestApplicant | undefined;
  nom: string;
  description: string;
  /** Domaines du catalogue ; `nom` présent quand le back les a chargés. */
  familles: { id: string; nom?: string | undefined }[];
  sellerType: SellerType;
  rccm: string | null;
  experience: SellerExperience;
  catalogSize: CatalogSize;
  hasPhysicalStore: boolean;
  adresse: string;
  email: string | null;
  message: string | null;
  acceptedTermsAt: string;
  status: ShopRequestStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  /** Boutique ouverte à l'approbation. */
  shopId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Corps de POST /shop-requests. Le demandeur est déduit de la session. */
export interface ShopRequestInput {
  nom: string;
  description: string;
  familleIds: string[];
  sellerType: SellerType;
  rccm?: string | undefined;
  experience: SellerExperience;
  catalogSize: CatalogSize;
  hasPhysicalStore: boolean;
  adresse: string;
  email?: string | undefined;
  message?: string | undefined;
  acceptTerms: boolean;
}

export type ShopRequestCounts = Record<ShopRequestStatus, number>;
