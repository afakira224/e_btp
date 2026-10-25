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
  // Ouverture d'une boutique : questionnaire, puis suivi de la demande.
  accountShopRequest: "/compte/boutique",
  accountShopRequestNew: "/compte/boutique/demande",
  // Espace vendeur : une boutique, ses produits et ses modes de livraison.
  seller: "/ma-boutique",
  sellerShop: "/ma-boutique/:boutiqueId",
  sellerProducts: "/ma-boutique/:boutiqueId/produits",
  sellerProductNew: "/ma-boutique/:boutiqueId/produits/nouveau",
  sellerProductEdit: "/ma-boutique/:boutiqueId/produits/:offreId/modifier",
  sellerDelivery: "/ma-boutique/:boutiqueId/livraison",
  sellerInfo: "/ma-boutique/:boutiqueId/informations",
  // Administration : examen des demandes d'ouverture de boutique.
  admin: "/admin",
  adminShopRequests: "/admin/demandes-boutique",
  adminShopRequest: "/admin/demandes-boutique/:requestId",
  panier: "/panier",
  // Tunnel de commande : livraison par boutique, adresse, confirmation.
  commande: "/commande",
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
