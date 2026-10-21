// ─────────────────────────────────────────────
//  Modèle métier User — miroir du modèle Mongoose côté API.
//  Partagé par toutes les features : il vit dans `entities`, pas dans `auth`.
// ─────────────────────────────────────────────
export const EntityType = {
  USER: "user",
  SHOP: "shop",
  ADMIN: "admin",
  USER_SOCIETE: "user_societe",
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export interface User {
  _id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  avatar?: string | null;
  role: EntityType;
  isEmailVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Libellés affichables des rôles. */
export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  user: "Particulier",
  shop: "Boutique",
  admin: "Administrateur",
  user_societe: "Société",
};

export const getFullName = (user: Pick<User, "nom" | "prenom">): string =>
  `${user.prenom} ${user.nom}`.trim();

/** Initiales pour l'avatar de repli. */
export const getInitials = (user: Pick<User, "nom" | "prenom">): string =>
  `${user.prenom.charAt(0)}${user.nom.charAt(0)}`.toUpperCase();
