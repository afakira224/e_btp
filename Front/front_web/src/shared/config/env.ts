// ─────────────────────────────────────────────
//  Configuration d'environnement.
// ─────────────────────────────────────────────
const flag = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value === "true";

export const env = {
  /** Base de l'API réelle. Ignorée tant que `useMock` vaut true. */
  apiUrl: import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1",

  // Le front tourne sur des données simulées par défaut : il n'a besoin
  // d'aucun serveur ni d'aucune base pour être développé et montré.
  // Passer VITE_USE_MOCK=false pour taper sur la vraie API.
  useMock: flag(import.meta.env.VITE_USE_MOCK, true),
} as const;

/**
 * URL d'un fichier servi par le back (« /uploads/… ») : relative à l'origine
 * de l'API. Avec le proxy de développement (VITE_API_URL=/api/v1), c'est
 * l'origine du front ; avec une API sur un autre domaine, c'est la sienne.
 * Les URL absolues (CDN, data:, blob:) passent telles quelles.
 */
export const assetUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  const origin = new URL(env.apiUrl, window.location.origin).origin;
  return origin === window.location.origin ? url : `${origin}${url}`;
};
