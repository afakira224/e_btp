// Chemins de l'espace d'administration, construits en un seul endroit.
export const adminPaths = {
  home: "/admin",
  shopRequests: "/admin/demandes-boutique",
  shopRequest: (id: string) => `/admin/demandes-boutique/${encodeURIComponent(id)}`,
} as const;
