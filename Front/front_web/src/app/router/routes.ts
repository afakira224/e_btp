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
  // Support : demandes à une boutique ou à l'équipe, signalements, mesures.
  accountSupport: "/compte/support",
  accountSupportNew: "/compte/support/nouvelle",
  accountSupportTicket: "/compte/support/:ticketId",
  // Ouverture d'une boutique : questionnaire, puis suivi de la demande.
  accountShopRequest: "/compte/boutique",
  accountShopRequestNew: "/compte/boutique/demande",
  // Espace boutique : application à part, avec sa connexion. Une boutique =
  // un tableau de bord, ses commandes, ses produits et ses modes de livraison.
  seller: "/ma-boutique",
  sellerLogin: "/ma-boutique/connexion",
  sellerShop: "/ma-boutique/:boutiqueId",
  sellerOrders: "/ma-boutique/:boutiqueId/commandes",
  sellerOrder: "/ma-boutique/:boutiqueId/commandes/:partId",
  sellerProducts: "/ma-boutique/:boutiqueId/produits",
  sellerProductNew: "/ma-boutique/:boutiqueId/produits/nouveau",
  sellerProductEdit: "/ma-boutique/:boutiqueId/produits/:offreId/modifier",
  sellerSupport: "/ma-boutique/:boutiqueId/support",
  sellerSupportNew: "/ma-boutique/:boutiqueId/support/nouvelle",
  sellerSupportTicket: "/ma-boutique/:boutiqueId/support/:ticketId",
  sellerDelivery: "/ma-boutique/:boutiqueId/livraison",
  sellerInfo: "/ma-boutique/:boutiqueId/informations",
  // Administration : demandes d'ouverture de boutique, commandes et litiges,
  // support et modération.
  admin: "/admin",
  adminShopRequests: "/admin/demandes-boutique",
  adminShopRequest: "/admin/demandes-boutique/:requestId",
  adminOrders: "/admin/commandes",
  adminOrder: "/admin/commandes/:partId",
  adminSupport: "/admin/support",
  adminSupportTicket: "/admin/support/:ticketId",
  panier: "/panier",
  // Tunnel de commande : livraison par boutique, adresse, paiement, confirmation.
  commande: "/commande",
  // Page du prestataire de paiement simulé (paiement en ligne).
  paiement: "/paiement/:orderId",
  favoris: "/favoris",
  recherche: "/recherche",
  nouveautes: "/nouveautes",
  meilleuresVentes: "/meilleures-ventes",
  promotions: "/promotions",
  boutiques: "/boutiques",
  boutique: "/boutiques/:boutiqueId",
  // Nous contacter : public, un visiteur y laisse son email.
  contact: "/contact",

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
