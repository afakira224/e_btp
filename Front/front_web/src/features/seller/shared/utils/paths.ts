// Chemins de l'espace vendeur, construits en un seul endroit.
const shop = (shopId: string) => `/ma-boutique/${encodeURIComponent(shopId)}`;

export const sellerPaths = {
  home: "/ma-boutique",
  products: (shopId: string) => `${shop(shopId)}/produits`,
  newProduct: (shopId: string) => `${shop(shopId)}/produits/nouveau`,
  editProduct: (shopId: string, offerId: string) =>
    `${shop(shopId)}/produits/${encodeURIComponent(offerId)}/modifier`,
  delivery: (shopId: string) => `${shop(shopId)}/livraison`,
} as const;
