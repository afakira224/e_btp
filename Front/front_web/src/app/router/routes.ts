// Chemins centralisés : aucune chaîne d'URL en dur dans les composants.
export const ROUTES = {
  home: "/",
  // Espace compte : « Mon compte » et chacune de ses rubriques sont des
  // pages autonomes.
  account: "/compte",
  accountOrders: "/compte/commandes",
  accountOrder: "/compte/commandes/:orderId",
  accountAddresses: "/compte/adresses",
  accountAddressNew: "/compte/adresses/nouvelle",
  accountAddressEdit: "/compte/adresses/:addressId/modifier",
  accountProfile: "/compte/profil",
  accountSettings: "/compte/parametres",
  panier: "/panier",
  favoris: "/favoris",
  recherche: "/recherche",
  nouveautes: "/nouveautes",
  meilleuresVentes: "/meilleures-ventes",
  promotions: "/promotions",
  boutiques: "/boutiques",
  boutique: "/boutiques/:boutiqueId",

  // Catalogue — `/categories` est la racine de navigation : elle affiche
  // les domaines et leurs catégories, ce que vise « voir tout le catalogue ».
  catalogue: "/categories",
  famille: "/familles/:familleId",
  categorie: "/categories/:categorieId",
  sousCategorie: "/sous-categories/:sousCategorieId",
  produit: "/produits/:offreId",

  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password/:token",
  verifyEmail: "/verify-email/:token",
} as const;
