// Chemins de l'espace d'administration, construits en un seul endroit.
export const adminPaths = {
  home: "/admin",
  shopRequests: "/admin/demandes-boutique",
  shopRequest: (id: string) => `/admin/demandes-boutique/${encodeURIComponent(id)}`,
  orders: "/admin/commandes",
  order: (id: string) => `/admin/commandes/${encodeURIComponent(id)}`,
  support: "/admin/support",
  supportTicket: (id: string) => `/admin/support/${encodeURIComponent(id)}`,
  /** Campagnes de la plateforme et réglages des boosts. */
  marketing: "/admin/promotions",
} as const;
