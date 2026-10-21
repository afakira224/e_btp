const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** « 24 septembre 2026 » */
export const formatDate = (iso: string): string => dateFormat.format(new Date(iso));

/** « 24 sept., 14:30 » — pour les étapes d'une commande. */
export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));

/**
 * Référence courte pour l'affichage : le back produit « CMD-<horodatage>-<n> »,
 * trop long pour une liste. On garde le préfixe et la fin, qui suffisent à
 * reconnaître une commande ; la référence complète reste sur la fiche.
 */
export const shortReference = (reference: string): string => {
  const parts = reference.split("-");
  if (parts.length < 3) return reference;
  return `${parts[0]}-${parts[parts.length - 1]}`;
};
