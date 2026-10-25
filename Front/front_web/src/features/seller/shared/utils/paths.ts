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
  delivery: (shopId: string) => `${shop(shopId)}/livraison`,
  info: (shopId: string) => `${shop(shopId)}/informations`,
  /** Vitrine publique de la boutique, telle que les clients la voient. */
  storefront: (shopId: string) => `/boutiques/${encodeURIComponent(shopId)}`,
} as const;
