// Chemins du parcours d'ouverture de boutique, construits en un seul endroit.
export const shopRequestPaths = {
  /** Suivi de la demande la plus récente. */
  status: "/compte/boutique",
  /** Questionnaire d'ouverture. */
  apply: "/compte/boutique/demande",
  /** Panneau « Ma boutique » du profil. */
  profile: "/compte/profil#boutique",
  /** Espace vendeur : la boutique ouverte. */
  seller: "/ma-boutique",
} as const;
