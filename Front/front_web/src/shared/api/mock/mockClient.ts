import { EntityType, type User } from "../../../entities/user";
import {
  categorieOf,
  familleOf,
  sousCategorieOf,
  type ProductBoutique,
} from "../../../entities/product";
import { isRunning, PromotionType } from "../../../entities/promotion";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import {
  CATALOG,
  CATEGORIES_TREE,
  FAMILLES_TREE,
  PROMOTIONS,
  SHOPS,
  SOUS_CATEGORIES,
} from "./catalogSeed";
import {
  addToCart,
  addToWishlist,
  clearCart,
  clearWishlist,
  getCart,
  getWishlist,
  removeFromCart,
  removeFromWishlist,
  updateCartItem,
} from "./cartWishlist";
import * as account from "./account";
import {
  objectId,
  randomToken,
  readDb,
  writeDb,
  type MockEntityLogin,
} from "./mockDb";

// ─────────────────────────────────────────────
//  Client simulé.
//
//  Même signature que `httpClient`, mêmes codes HTTP, même enveloppe
//  BaseResponse et mêmes messages que le back. Les features ne savent pas
//  lequel des deux elles utilisent : passer au vrai serveur se fait en
//  basculant VITE_USE_MOCK, sans toucher une ligne de feature.
// ─────────────────────────────────────────────

/** Latence simulée : sans elle, les états de chargement ne s'observent pas. */
const latency = () => new Promise((resolve) => setTimeout(resolve, 260));

const ok = <T>(data: T | null, message = "Opération réussie"): ApiResponse<T> => ({
  success: true,
  message,
  statusCode: 200,
  data,
});

const created = <T>(data: T | null, message: string): ApiResponse<T> => ({
  success: true,
  message,
  statusCode: 201,
  data,
});

// ─────────────────────────────────────────────
//  Lien envoyé par email.
//  Aucun email ne part en mock : le lien est renvoyé dans la réponse pour
//  que les parcours de vérification et de réinitialisation restent testables.
// ─────────────────────────────────────────────
const linkTo = (path: string) => `${window.location.origin}${path}`;

const findUserByEmail = (email: string): User | undefined => {
  const normalized = email.trim().toLowerCase();
  return readDb().users.find((user) => user.email.toLowerCase() === normalized);
};

const findLoginByEmail = (email: string): MockEntityLogin | undefined => {
  const normalized = email.trim().toLowerCase();
  return readDb().logins.find((login) => login.email.toLowerCase() === normalized);
};

// ─────────────────────────────────────────────
//  Handlers — un par route du back.
// ─────────────────────────────────────────────

interface RegisterBody {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  password: string;
  role?: EntityType;
}

const register = (body: RegisterBody): ApiResponse<{ verifyLink: string }> => {
  const db = readDb();

  if (findLoginByEmail(body.email)) {
    throw new ApiError("Email déjà utilisé.", 409);
  }

  const now = new Date().toISOString();
  const userId = objectId();
  const emailVerifyToken = randomToken();

  // L'inscription publique ne crée que des comptes « user » : le rôle envoyé
  // par le client n'est jamais repris tel quel.
  const user: User = {
    _id: userId,
    nom: body.nom,
    prenom: body.prenom,
    email: body.email.toLowerCase(),
    telephone: body.telephone,
    avatar: null,
    role: EntityType.USER,
    isEmailVerified: false,
    createdAt: now,
    updatedAt: now,
  };

  db.users.push(user);
  db.logins.push({
    _id: objectId(),
    entityId: userId,
    email: user.email,
    password: body.password,
    entityType: EntityType.USER,
    emailVerifyToken,
    resetPasswordToken: null,
    resetPasswordExpires: null,
  });
  writeDb(db);

  return created(
    { verifyLink: linkTo(`/verify-email/${emailVerifyToken}`) },
    "Compte créé. Vérifie ton email."
  );
};

const login = (body: { email: string; password: string }): ApiResponse<{ user: User }> => {
  const db = readDb();
  const entity = findLoginByEmail(body.email);
  const user = findUserByEmail(body.email);

  // Message identique dans les deux cas : on ne révèle pas si l'email existe.
  if (!entity || !user || entity.password !== body.password) {
    throw new ApiError("Identifiants invalides.", 401);
  }

  if (!user.isEmailVerified) {
    throw new ApiError("Email non vérifié.", 403);
  }

  db.sessionUserId = user._id;
  writeDb(db);

  return ok({ user });
};

const me = (): ApiResponse<User> => {
  const db = readDb();
  if (!db.sessionUserId) {
    throw new ApiError("Session absente ou expirée, veuillez vous connecter.", 401);
  }

  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  if (!user) throw new ApiError("Utilisateur introuvable.", 404);

  return ok(user);
};

const logout = (): ApiResponse<null> => {
  const db = readDb();
  db.sessionUserId = null;
  writeDb(db);
  return ok(null, "Déconnexion réussie.");
};

const logoutAll = (): ApiResponse<{ revoked: number }> => {
  const db = readDb();
  const revoked = db.otherSessions;
  db.sessionUserId = null;
  db.otherSessions = 0;
  writeDb(db);
  return ok({ revoked }, "Toutes les sessions ont été fermées.");
};

const forgotPassword = (body: { email: string }): ApiResponse<{ resetLink: string }> => {
  const db = readDb();
  const entity = findLoginByEmail(body.email);

  // Le back répond 404 sur un email inconnu ; le mock reproduit ce
  // comportement pour que le front garde la même logique de neutralisation.
  if (!entity) throw new ApiError("Email introuvable.", 404);

  entity.resetPasswordToken = randomToken();
  entity.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  writeDb(db);

  return ok(
    { resetLink: linkTo(`/reset-password/${entity.resetPasswordToken}`) },
    "Email de réinitialisation envoyé."
  );
};

const resetPassword = (token: string, body: { password: string }): ApiResponse<null> => {
  const db = readDb();
  const entity = db.logins.find((candidate) => candidate.resetPasswordToken === token);

  const expired =
    entity?.resetPasswordExpires != null &&
    new Date(entity.resetPasswordExpires) <= new Date();

  if (!entity || expired) {
    throw new ApiError("Token invalide ou expiré.", 400);
  }

  entity.password = body.password;
  entity.resetPasswordToken = null;
  entity.resetPasswordExpires = null;

  // Comme côté back, un mot de passe réinitialisé ferme toutes les sessions.
  db.sessionUserId = null;
  db.otherSessions = 0;
  writeDb(db);

  return ok(null, "Mot de passe réinitialisé.");
};

const verifyEmail = (token: string): ApiResponse<null> => {
  const db = readDb();
  const entity = db.logins.find((candidate) => candidate.emailVerifyToken === token);
  if (!entity) throw new ApiError("Token invalide.", 400);

  const user = db.users.find((candidate) => candidate._id === entity.entityId);
  if (!user) throw new ApiError("Utilisateur introuvable.", 404);

  entity.emailVerifyToken = null;
  user.isEmailVerified = true;
  user.updatedAt = new Date().toISOString();
  writeDb(db);

  return ok(null, "Email vérifié avec succès.");
};

const resendVerification = (): ApiResponse<{ verifyLink: string }> => {
  const db = readDb();
  if (!db.sessionUserId) {
    throw new ApiError("Authentification requise.", 401);
  }

  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  const entity = db.logins.find((candidate) => candidate.entityId === db.sessionUserId);
  if (!user || !entity) throw new ApiError("Ressource introuvable.", 404);

  if (user.isEmailVerified) {
    throw new ApiError("Email déjà vérifié.", 400);
  }

  entity.emailVerifyToken = randomToken();
  writeDb(db);

  return ok(
    { verifyLink: linkTo(`/verify-email/${entity.emailVerifyToken}`) },
    "Email de vérification renvoyé."
  );
};

// ─────────────────────────────────────────────
//  Catalogue
//  En lecture seule : la page d'accueil ne fait que lister.
// ─────────────────────────────────────────────

const listCategories = (): ApiResponse<typeof CATEGORIES_TREE> =>
  ok(CATEGORIES_TREE.filter((categorie) => categorie.actif));

/** Domaines : familles avec leurs catégories imbriquées. */
const listFamilles = (): ApiResponse<typeof FAMILLES_TREE> =>
  ok(FAMILLES_TREE.filter((famille) => famille.actif));

const getFamille = (id: string) => {
  const famille = FAMILLES_TREE.find((candidate) => candidate.id === id);
  if (!famille) throw new ApiError("Famille introuvable.", 404);
  return ok(famille);
};

const getCategorie = (id: string) => {
  const categorie = CATEGORIES_TREE.find((candidate) => candidate.id === id);
  if (!categorie) throw new ApiError("Catégorie introuvable.", 404);
  return ok(categorie);
};

const getSousCategorie = (id: string) => {
  const sous = SOUS_CATEGORIES.find((candidate) => candidate.id === id);
  if (!sous) throw new ApiError("Sous-catégorie introuvable.", 404);
  return ok(sous);
};

// ─────────────────────────────────────────────
//  Produits filtrés par taxonomie.
//  Un seul point d'entrée pour les trois niveaux : c'est le même listing,
//  seul le critère change.
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  Listings de product-boutiques.
//  Trois routes distinctes côté back, trois fonctions ici :
//   • GET /product-boutiques         — filtres boutiqueId / productId / isFeatured
//   • GET /product-boutiques/search  — texte, taxonomie, prix, tri
//   • GET /product-boutiques/:id/suggestions
//  La pagination renvoie `{ items, total, page, totalPages }`, comme le back.
// ─────────────────────────────────────────────

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

const paginate = <T>(tous: T[], params: URLSearchParams, parDefaut = 10) => {
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? parDefaut)));
  const skip = (page - 1) * limit;
  return {
    items: tous.slice(skip, skip + limit),
    total: tous.length,
    page,
    totalPages: Math.ceil(tous.length / limit),
  };
};

const listProductBoutiques = (
  params: URLSearchParams
): ApiResponse<Paginated<ProductBoutique>> => {
  const boutiqueId = params.get("boutiqueId");
  const productId = params.get("productId");
  const isFeatured = params.get("isFeatured");

  if (boutiqueId && !SHOPS.some((shop) => shop.id === boutiqueId)) {
    throw new ApiError("Boutique introuvable", 404);
  }

  const tous = CATALOG.filter((item) => {
    if (boutiqueId && item.boutique?.id !== boutiqueId) return false;
    if (productId && item.productId !== productId) return false;
    if (isFeatured !== null && item.isFeatured !== (isFeatured === "true")) return false;
    return true;
  });

  return ok(paginate(tous, params));
};

const searchProductBoutiques = (
  params: URLSearchParams
): ApiResponse<Paginated<ProductBoutique> & { priceRange: { min: number; max: number } }> => {
  const q = params.get("q")?.toLowerCase();
  const boutiqueId = params.get("boutiqueId");
  const familleId = params.get("familleId");
  const categoryId = params.get("categoryId");
  const sousCategoryId = params.get("sousCategoryId");
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  const minRating = params.get("minRating");
  const inStock = params.get("inStock") === "true";
  const discounted = params.get("discounted") === "true";

  // Même découpage que le back : le prix est filtré à part, pour que la
  // facette `priceRange` décrive la sélection *sans* la contrainte de prix.
  const horsPrix = CATALOG.filter((item) => {
    if (boutiqueId && item.boutique?.id !== boutiqueId) return false;
    // La taxonomie est imbriquée dans le DTO : on lit les objets, pas des
    // identifiants nus.
    if (familleId && familleOf(item)?.id !== familleId) return false;
    if (categoryId && categorieOf(item)?.id !== categoryId) return false;
    if (sousCategoryId && sousCategorieOf(item)?.id !== sousCategoryId) return false;
    if (q) {
      const texte = `${item.product?.name ?? ""} ${item.product?.description ?? ""}`;
      if (!texte.toLowerCase().includes(q)) return false;
    }
    if (minRating !== null && (item.rating ?? 0) < Number(minRating)) return false;
    if (inStock && item.stock <= 0) return false;
    if (discounted && !(item.discountPrice != null && item.discountPrice < item.price)) {
      return false;
    }
    return true;
  });

  // Comme côté back, le filtre porte sur `price`, pas sur le prix remisé.
  const tous = horsPrix.filter((item) => {
    if (minPrice !== null && item.price < Number(minPrice)) return false;
    if (maxPrice !== null && item.price > Number(maxPrice)) return false;
    return true;
  });

  const prix = horsPrix.map((item) => item.price);
  const priceRange = {
    min: prix.length > 0 ? Math.min(...prix) : 0,
    max: prix.length > 0 ? Math.max(...prix) : 0,
  };

  // Tris acceptés par le back : newest, price_asc, price_desc, rating, popular.
  const sort = params.get("sort") ?? "newest";
  const tris: Record<string, (a: ProductBoutique, b: ProductBoutique) => number> = {
    newest: (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    popular: (a, b) => (b.reviewsCount ?? 0) - (a.reviewsCount ?? 0),
  };

  return ok({
    ...paginate([...tous].sort(tris[sort] ?? tris["newest"]!), params),
    priceRange,
  });
};

// ─────────────────────────────────────────────
//  Suggestions — même cascade que le back :
//  sous-catégorie (3) > catégorie (2) > famille (1), produit courant exclu.
// ─────────────────────────────────────────────
const suggestionsFor = (
  id: string,
  params: URLSearchParams
): ApiResponse<ProductBoutique[]> => {
  const item = CATALOG.find((candidate) => candidate.id === id);
  if (!item) throw new ApiError("Produit en boutique non trouvé", 404);

  const limit = Math.min(50, Math.max(1, Number(params.get("limit") ?? 10)));

  const sousId = sousCategorieOf(item)?.id;
  const catId = categorieOf(item)?.id;
  const famId = familleOf(item)?.id;

  const score = (candidate: ProductBoutique): number => {
    if (sousId && sousCategorieOf(candidate)?.id === sousId) return 3;
    if (catId && categorieOf(candidate)?.id === catId) return 2;
    if (famId && familleOf(candidate)?.id === famId) return 1;
    return 0;
  };

  const ranked = CATALOG.filter(
    (candidate) =>
      candidate.id !== item.id &&
      candidate.productId !== item.productId &&
      score(candidate) > 0
  )
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);

  return ok(ranked);
};

// ─────────────────────────────────────────────
//  Récemment vus — historique par utilisateur, plus récent en tête.
//  Le back plafonne à 20 et déduplique ; on fait de même.
// ─────────────────────────────────────────────
const MAX_RECENTLY_VIEWED = 20;

/** Enregistrement « au mieux » : une erreur ici ne casse pas la consultation. */
const recordProductView = (productBoutiqueId: string): void => {
  const db = readDb();
  if (!db.sessionUserId) return;

  let historique = db.recentlyViewed.find(
    (entry) => entry.userId === db.sessionUserId
  );
  if (!historique) {
    historique = { userId: db.sessionUserId, items: [] };
    db.recentlyViewed.push(historique);
  }

  historique.items = historique.items.filter(
    (entry) => entry.productBoutiqueId !== productBoutiqueId
  );
  historique.items.unshift({
    productBoutiqueId,
    viewedAt: new Date().toISOString(),
  });
  historique.items = historique.items.slice(0, MAX_RECENTLY_VIEWED);

  writeDb(db);
};

/** DTO d'offre enrichi de la date de consultation, comme le back le renvoie. */
type ViewedItem = ProductBoutique & { viewedAt: string };

const listRecentlyViewed = (userId: string): ApiResponse<ViewedItem[]> => {
  const db = readDb();

  // La route du back est protégée par requireAuth + requireSelf.
  if (!db.sessionUserId) {
    throw new ApiError("Session absente ou expirée, veuillez vous connecter.", 401);
  }
  if (db.sessionUserId !== userId) {
    throw new ApiError("Vous ne pouvez accéder qu'à vos propres données.", 403);
  }

  const historique = db.recentlyViewed.find((entry) => entry.userId === userId);
  if (!historique || historique.items.length === 0) {
    return ok([], "Aucun produit récemment vu");
  }

  const ordered = historique.items
    .map((entry) => {
      const dto = CATALOG.find((item) => item.id === entry.productBoutiqueId);
      return dto ? { ...dto, viewedAt: entry.viewedAt } : null;
    })
    .filter((entry): entry is ViewedItem => entry !== null);

  return ok(ordered, "Produits récemment vus récupérés avec succès");
};

const getOffer = (id: string): ApiResponse<ProductBoutique> => {
  const offre = CATALOG.find((item) => item.id === id);
  if (!offre) throw new ApiError("Produit introuvable.", 404);

  // Comme `getProductBoutiqueById` cote back : consulter une fiche alimente
  // l'historique, mais seulement pour un utilisateur identifie.
  recordProductView(id);

  return ok(offre);
};

// ─────────────────────────────────────────────
//  Boutiques.
//  Le contrôleur du back (`getShops`, `getShopById`) renvoie les documents
//  Mongoose tels quels, sans passer par `toShopResponseDto` : `_id` au lieu
//  de `id`, plus `deletedAt` et `__v`. Le mock reproduit cette forme pour
//  que le front soit éprouvé contre ce qu'il recevra vraiment.
// ─────────────────────────────────────────────
const rawShop = (shop: (typeof SHOPS)[number]) => {
  const { id, ...rest } = shop;
  return { _id: id, ...rest, deletedAt: null, __v: 0 };
};

const listShops = (params: URLSearchParams) => {
  const search = params.get("search")?.toLowerCase();
  const ownerId = params.get("ownerId");
  const toutes = SHOPS.filter((shop) => {
    if (ownerId && shop.ownerId !== ownerId) return false;
    if (search && !shop.nom.toLowerCase().includes(search)) return false;
    return true;
  });
  const { items, ...page } = paginate(toutes, params);
  return ok({ shops: items.map(rawShop), ...page });
};

const getShop = (id: string) => {
  const shop = SHOPS.find((candidate) => candidate.id === id);
  if (!shop) throw new ApiError("Boutique introuvable.", 404);
  return ok(rawShop(shop));
};

/** Seules les promotions reellement en cours remontent. */
const listPromotions = () => ok(PROMOTIONS.filter((promotion) => isRunning(promotion)));

/** Comme le back : ventes flash en cours, la plus proche de sa fin d'abord. */
const listActiveFlashSales = () =>
  ok(
    PROMOTIONS.filter(
      (promotion) => promotion.type === PromotionType.FLASH_SALE && isRunning(promotion)
    )
      .map((promotion) => ({ ...promotion, isActive: true }))
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
  );

const route = (method: string, path: string, body: unknown): ApiResponse<unknown> => {
  // La chaîne de requête est analysée plutôt que comparée : `?page=2&limit=8`
  // ne peut pas s'apparier par égalité, et l'ordre des paramètres ne doit
  // rien changer au routage.
  const [pathname = "", query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const key = `${method} ${pathname}`;

  switch (key) {
    case "POST /auth/register":
      return register(body as RegisterBody);
    case "POST /auth/login":
      return login(body as { email: string; password: string });
    case "POST /auth/logout":
      return logout();
    case "POST /auth/logout-all":
      return logoutAll();
    case "GET /auth/me":
      return me();
    case "POST /auth/forgot-password":
      return forgotPassword(body as { email: string });
    case "POST /auth/resend-verification":
      return resendVerification();
    case "GET /categories":
      return listCategories();
    case "GET /familles":
      return listFamilles();
    case "GET /product-boutiques":
      return listProductBoutiques(params);
    case "GET /product-boutiques/search":
      return searchProductBoutiques(params);
    case "GET /promotions":
      return listPromotions();
    case "GET /promotions/flash/active":
      return listActiveFlashSales();
    case "GET /shops":
      return listShops(params);
    case "PUT /auth/me":
      return account.updateMe(body as Parameters<typeof account.updateMe>[0]);
    case "PUT /auth/change-password":
      return account.changePassword(body as Parameters<typeof account.changePassword>[0]);
    case "GET /addresses":
      return account.listAddresses(params);
    case "POST /addresses":
      return account.createAddress(body as Parameters<typeof account.createAddress>[0]);
    case "GET /orders":
      return account.listOrders(params);
    default:
      break;
  }

  // L'ordre compte : `/search` et `/recently-viewed/:userId` seraient
  // sinon capturés comme des identifiants d'offre.
  const suggestions = /^GET \/product-boutiques\/([^/]+)\/suggestions$/.exec(key);
  if (suggestions?.[1]) {
    return suggestionsFor(decodeURIComponent(suggestions[1]), params);
  }

  const vus = /^GET \/product-boutiques\/recently-viewed\/(.+)$/.exec(key);
  if (vus?.[1]) return listRecentlyViewed(decodeURIComponent(vus[1]));

  const offre = /^GET \/product-boutiques\/([^/]+)$/.exec(key);
  if (offre?.[1]) return getOffer(decodeURIComponent(offre[1]));

  // ── Espace compte ─────────────────────────
  const adresseDefaut = /^PATCH \/addresses\/([^/]+)\/default$/.exec(key);
  if (adresseDefaut?.[1]) return account.setDefaultAddress(decodeURIComponent(adresseDefaut[1]));

  const adresse = /^(PUT|DELETE) \/addresses\/([^/]+)$/.exec(key);
  if (adresse?.[2]) {
    const id = decodeURIComponent(adresse[2]);
    return adresse[1] === "PUT"
      ? account.updateAddress(id, body as Parameters<typeof account.updateAddress>[1])
      : account.deleteAddress(id);
  }

  const commande = /^GET \/orders\/([^/]+)$/.exec(key);
  if (commande?.[1]) return account.getOrder(decodeURIComponent(commande[1]));

  const boutique = /^GET \/shops\/([^/]+)$/.exec(key);
  if (boutique?.[1]) return getShop(decodeURIComponent(boutique[1]));

  const famille = /^GET \/familles\/(.+)$/.exec(key);
  if (famille?.[1]) return getFamille(decodeURIComponent(famille[1]));

  const categorie = /^GET \/categories\/(.+)$/.exec(key);
  if (categorie?.[1]) return getCategorie(decodeURIComponent(categorie[1]));

  const sousCategorie = /^GET \/sous-categories\/(.+)$/.exec(key);
  if (sousCategorie?.[1]) return getSousCategorie(decodeURIComponent(sousCategorie[1]));

  const reset = /^PUT \/auth\/reset-password\/(.+)$/.exec(key);
  if (reset?.[1]) {
    return resetPassword(decodeURIComponent(reset[1]), body as { password: string });
  }

  const verify = /^GET \/auth\/verify-email\/(.+)$/.exec(key);
  if (verify?.[1]) return verifyEmail(decodeURIComponent(verify[1]));

  // ── Panier ────────────────────────────────
  // Les routes « items » viennent avant celles qui ne portent qu'un userId,
  // sinon `/cart/:userId` capturerait `/cart/abc/items`.
  const cartItem = /^(PUT|DELETE) \/cart\/([^/]+)\/items\/(.+)$/.exec(key);
  if (cartItem) {
    const [, verbe, user, produit] = cartItem;
    return verbe === "PUT"
      ? updateCartItem(
          decodeURIComponent(user!),
          decodeURIComponent(produit!),
          body as { quantity: number }
        )
      : removeFromCart(decodeURIComponent(user!), decodeURIComponent(produit!));
  }

  const cartAdd = /^POST \/cart\/([^/]+)\/items$/.exec(key);
  if (cartAdd?.[1]) {
    return addToCart(
      decodeURIComponent(cartAdd[1]),
      body as { productBoutiqueId: string; quantity?: number }
    );
  }

  const cartRead = /^GET \/cart\/([^/]+)$/.exec(key);
  if (cartRead?.[1]) return getCart(decodeURIComponent(cartRead[1]));

  const cartClear = /^DELETE \/cart\/([^/]+)$/.exec(key);
  if (cartClear?.[1]) return clearCart(decodeURIComponent(cartClear[1]));

  // ── Favoris ───────────────────────────────
  const wishItem = /^DELETE \/wishlist\/([^/]+)\/items\/(.+)$/.exec(key);
  if (wishItem) {
    return removeFromWishlist(
      decodeURIComponent(wishItem[1]!),
      decodeURIComponent(wishItem[2]!)
    );
  }

  const wishAdd = /^POST \/wishlist\/([^/]+)\/items$/.exec(key);
  if (wishAdd?.[1]) {
    return addToWishlist(
      decodeURIComponent(wishAdd[1]),
      body as { productBoutiqueId: string }
    );
  }

  const wishRead = /^GET \/wishlist\/([^/]+)$/.exec(key);
  if (wishRead?.[1]) return getWishlist(decodeURIComponent(wishRead[1]));

  const wishClear = /^DELETE \/wishlist\/([^/]+)$/.exec(key);
  if (wishClear?.[1]) return clearWishlist(decodeURIComponent(wishClear[1]));

  throw new ApiError(`Route non simulée : ${key}`, 404);
};

const call = async <T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> => {
  await latency();
  return route(method, path, body) as ApiResponse<T>;
};

export const mockClient = {
  get: <T>(path: string, _signal?: AbortSignal) => call<T>("GET", path),
  post: <T>(path: string, body?: unknown) => call<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => call<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => call<T>("PATCH", path, body),
  delete: <T>(path: string) => call<T>("DELETE", path),
};
