// Chemins de l'espace vendeur, construits en un seul endroit.
const shop = (shopId: string) => `/ma-boutique/${encodeURIComponent(shopId)}`;

export const sellerPaths = {
  home: "/ma-boutique",
  /** Connexion propre à l'espace boutique. */
  login: "/ma-boutique/connexion",
  /** Tableau de bord : l'accueil d'une boutique. */
  dashboard: (shopId: string) => shop(shopId),
  products: (shopId: string) => `${shop(shopId)}/produits`,
  newProduct: (shopId: string) => `${shop(shopId)}/produits/nouveau`,
  editProduct: (shopId: string, offerId: string) =>
    `${shop(shopId)}/produits/${encodeURIComponent(offerId)}/modifier`,
  orders: (shopId: string) => `${shop(shopId)}/commandes`,
  order: (shopId: string, partId: string) => `${shop(shopId)}/commandes/${encodeURIComponent(partId)}`,
  /** Réclamations des clients, signalements de la boutique, mesures. */
  support: (shopId: string) => `${shop(shopId)}/support`,
  supportTicket: (shopId: string, ticketId: string) => `${shop(shopId)}/support/${encodeURIComponent(ticketId)}`,
  newSupport: (shopId: string, type: string, target?: { id: string; label?: string | undefined }) => {
    const query = new URLSearchParams({ type });
    if (target) {
      query.set("cible", target.id);
      if (target.label) query.set("libelle", target.label);
    }
    return `${shop(shopId)}/support/nouvelle?${query.toString()}`;
  },
  delivery: (shopId: string) => `${shop(shopId)}/livraison`,
  info: (shopId: string) => `${shop(shopId)}/informations`,
  /** Vitrine publique de la boutique, telle que les clients la voient. */
  storefront: (shopId: string) => `/boutiques/${encodeURIComponent(shopId)}`,
} as const;
