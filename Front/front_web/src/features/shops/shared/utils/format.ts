const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

/** « septembre 2026 » — l'ancienneté de la boutique sur la plateforme. */
export const formatSince = (iso: string): string => monthYear.format(new Date(iso));

/**
 * Quartier ou commune : premier segment de l'adresse (« Matam, Conakry »
 * → « Matam »). L'adresse est un texte libre côté back, on ne suppose rien
 * de plus.
 */
export const districtOf = (adresse: string | undefined): string | undefined =>
  adresse?.split(",")[0]?.trim() || undefined;

/** Lien de recherche d'itinéraire vers une adresse libre. */
export const mapsHref = (adresse: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
