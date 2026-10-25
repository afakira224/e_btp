import { DELIVERY_MODES, DeliveryMode, isDeliveryMode, type ShopDeliveryOverview } from "../../../entities/delivery";
import type { Product, ProductBoutique } from "../../../entities/product";
import type { Shop } from "../../../entities/shop";
import { EntityType, type User } from "../../../entities/user";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import { PRODUCTS } from "./catalogSeed";
import { buildProductDelivery, normalizeSettings, toSettingsDto, validateSettings } from "./deliveryRules";
import { findLiveOffer, findShop, liveCatalog, rawShop, shopDeliveryOf } from "./liveCatalog";
import { objectId, readDb, writeDb, type MockProductDelivery, type MockShopPatch } from "./mockDb";

// ─────────────────────────────────────────────
//  Espace vendeur — routes simulées.
//
//   GET    /shops/:id/delivery          public
//   PUT    /shops/:id/delivery          { modes, flatRateFee? }      boutique, admin
//   GET    /products?search=&page=&limit=                             public
//   POST   /product-boutiques           multipart (images + champs)  boutique, admin
//   PUT    /product-boutiques/:id       JSON ou multipart             boutique, admin
//   PUT    /shops/:id                   JSON ou multipart (logo)      boutique, admin
//
//  Mêmes contrôles et mêmes messages que Back/src/controllers/{delivery,
//  productBoutique}.controller.ts : 401 sans session, 403 hors rôle ou hors
//  de ses boutiques, 422 pour la forme, 400 pour une règle métier.
// ─────────────────────────────────────────────

const ok = <T>(data: T, message: string, statusCode = 200): ApiResponse<T> => ({
  success: true,
  message,
  statusCode,
  data,
});

const SHOP_FORBIDDEN_MESSAGE = "Vous ne pouvez gérer que vos propres boutiques.";
const OFFER_FORBIDDEN_MESSAGE = "Vous ne pouvez gérer que les produits de vos propres boutiques.";
const MODES_MESSAGE = `Mode de livraison invalide. Valeurs autorisées : ${DELIVERY_MODES.join(", ")}.`;
const FEE_MESSAGE = "Le tarif de livraison doit être un nombre entier positif de GNF.";

/** requireAuth + requireRole(ADMIN, SHOP) */
const requireSeller = (): User => {
  const db = readDb();
  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  if (!db.sessionUserId || !user) {
    throw new ApiError("Session absente ou expirée, veuillez vous connecter.", 401);
  }
  if (user.role !== EntityType.ADMIN && user.role !== EntityType.SHOP) {
    throw new ApiError("Accès refusé, vous n'avez pas les permissions nécessaires", 403);
  }
  return user;
};

/** canManageShop : l'administrateur, ou le compte boutique propriétaire. */
const canManage = (user: User, shop: Pick<Shop, "ownerId">): boolean =>
  user.role === EntityType.ADMIN || (user.role === EntityType.SHOP && shop.ownerId === user._id);

// ── Lecture du corps ────────────────────────
// Un FormData arrive comme multer le rend au contrôleur : des chaînes, et
// les fichiers à part.
const readBody = (body: unknown): { fields: Record<string, unknown>; files: File[] } => {
  if (body instanceof FormData) {
    const fields: Record<string, unknown> = {};
    const files: File[] = [];
    body.forEach((value, key) => {
      if (typeof value !== "string") {
        if (key === "images") files.push(value);
        return;
      }
      fields[key] = value;
    });
    return { fields, files };
  }
  return { fields: (body ?? {}) as Record<string, unknown>, files: [] };
};

const parseJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const isNumberLike = (value: unknown, integer: boolean): boolean => {
  if (value === "" || value === null || typeof value === "boolean") return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && (!integer || Number.isInteger(number));
};

type DeliveryField = { useShopSettings?: boolean; modes?: unknown[]; flatRateFee?: number | null };

/** productDeliveryFields : forme du champ `delivery`, puis conversion. */
const readDeliveryField = (raw: unknown, errors: string[]): DeliveryField | undefined => {
  if (raw === undefined) return undefined;
  const value = parseJson(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push("delivery doit être un objet { useShopSettings, modes?, flatRateFee? }.");
    return undefined;
  }
  const input = value as Record<string, unknown>;
  const delivery: DeliveryField = {};

  if (input.useShopSettings !== undefined) {
    if (typeof input.useShopSettings === "boolean") delivery.useShopSettings = input.useShopSettings;
    else if (input.useShopSettings === "true" || input.useShopSettings === "false") {
      delivery.useShopSettings = input.useShopSettings === "true";
    } else errors.push("delivery.useShopSettings doit être un booléen.");
  }
  if (input.modes !== undefined) {
    if (!Array.isArray(input.modes)) errors.push("delivery.modes doit être une liste de modes de livraison.");
    else {
      if (input.modes.some((mode) => !isDeliveryMode(mode))) errors.push(MODES_MESSAGE);
      delivery.modes = input.modes;
    }
  }
  if (input.flatRateFee !== undefined && input.flatRateFee !== null) {
    if (!isNumberLike(input.flatRateFee, true)) errors.push(FEE_MESSAGE);
    else delivery.flatRateFee = Number(input.flatRateFee);
  } else if (input.flatRateFee === null) {
    delivery.flatRateFee = null;
  }
  return delivery;
};

// ─────────────────────────────────────────────
//  Livraison d'une boutique
// ─────────────────────────────────────────────
const overviewOf = (shop: Shop): ShopDeliveryOverview => {
  const offers = liveCatalog().filter((offer) => offer.boutique?.id === shop.id);
  const customProducts = offers.filter((offer) => offer.delivery?.source === "product").length;
  return {
    boutiqueId: shop.id,
    adresse: shop.adresse,
    ...toSettingsDto(shopDeliveryOf(shop.id)),
    inheritingProducts: offers.length - customProducts,
    customProducts,
  };
};

export const getShopDelivery = (id: string): ApiResponse<ShopDeliveryOverview> => {
  const shop = findShop(id);
  if (!shop) throw new ApiError("Boutique introuvable.", 404);
  return ok(overviewOf(shop), "Livraison de la boutique récupérée avec succès");
};

export const updateShopDelivery = (
  id: string,
  body: { modes?: unknown; flatRateFee?: unknown } = {}
): ApiResponse<ShopDeliveryOverview> => {
  const user = requireSeller();

  const errors: string[] = [];
  if (!Array.isArray(body.modes)) errors.push("modes doit être la liste des modes de livraison activés.");
  else if (body.modes.some((mode) => !isDeliveryMode(mode))) errors.push(MODES_MESSAGE);
  if (body.flatRateFee != null && !isNumberLike(body.flatRateFee, true)) errors.push(FEE_MESSAGE);
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);

  const shop = findShop(id);
  if (!shop) throw new ApiError("Boutique introuvable.", 404);
  if (!canManage(user, shop)) throw new ApiError(SHOP_FORBIDDEN_MESSAGE, 403);

  const modes = body.modes as unknown[];
  const flatRateFee = body.flatRateFee == null ? null : Number(body.flatRateFee);
  const invalid = validateSettings({ modes, flatRateFee }, shop);
  if (invalid) throw new ApiError(invalid, 400);

  // Les produits qui héritent liront ces réglages au prochain calcul ;
  // les produits personnalisés gardent les leurs.
  const db = readDb();
  db.shopDeliveries[id] = normalizeSettings(modes, flatRateFee);
  writeDb(db);

  return ok(overviewOf(findShop(id)!), "Livraison de la boutique mise à jour.");
};

// ─────────────────────────────────────────────
//  PUT /shops/:id — informations de la boutique (updateShop).
//  Multipart quand un logo part avec : le fichier est le champ « logo »,
//  `removeLogo` le retire. Le téléphone n'est ni lu ni renvoyé par le front.
// ─────────────────────────────────────────────
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const updateShop = (id: string, body: unknown): ApiResponse<ReturnType<typeof rawShop>> => {
  const user = requireSeller();

  let fields: Record<string, unknown> = {};
  let logo: File | undefined;
  if (body instanceof FormData) {
    body.forEach((value, key) => {
      if (typeof value !== "string") {
        if (key === "logo") logo = value;
        return;
      }
      fields[key] = value;
    });
  } else {
    fields = (body ?? {}) as Record<string, unknown>;
  }

  const read = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string).trim() : undefined);
  const nom = read("nom");
  const description = read("description");
  const email = read("email");
  const adresse = read("adresse");

  // updateShopForm
  const errors: string[] = [];
  if (nom !== undefined && (nom.length < 2 || nom.length > 100)) errors.push("Entre 2 et 100 caractères.");
  if (description !== undefined && description.length > 1000) errors.push("Maximum 1000 caractères.");
  if (email !== undefined && !EMAIL_PATTERN.test(email)) errors.push("Email invalide.");
  if (adresse !== undefined && adresse.length > 255) errors.push("Maximum 255 caractères.");
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);

  const shop = findShop(id);
  if (!shop) throw new ApiError("Boutique introuvable.", 404);
  if (!canManage(user, shop)) throw new ApiError(SHOP_FORBIDDEN_MESSAGE, 403);

  // Le retrait se fait à l'adresse de la boutique : tant qu'elle le propose,
  // par défaut ou sur un produit personnalisé, l'adresse ne peut pas disparaître.
  if (adresse === "") {
    const pickupByDefault = shopDeliveryOf(id).modes.includes(DeliveryMode.PICKUP);
    const pickupOnProducts = liveCatalog().some(
      (offer) =>
        offer.boutique?.id === id &&
        offer.delivery?.source === "product" &&
        offer.delivery.modes.includes(DeliveryMode.PICKUP)
    );
    if (pickupByDefault || pickupOnProducts) {
      throw new ApiError(
        "L'adresse de la boutique sert au retrait en boutique : désactivez ce mode avant de la retirer.",
        400
      );
    }
  }

  const removeLogo = fields.removeLogo === true || fields.removeLogo === "true";
  const changes: MockShopPatch = {
    ...(nom !== undefined ? { nom } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(email !== undefined ? { email: email.toLowerCase() } : {}),
    ...(adresse !== undefined ? { adresse } : {}),
    // URL d'objet, comme les photos des offres : elle ne survit pas à un rechargement.
    ...(logo ? { logo: URL.createObjectURL(logo) } : removeLogo ? { logo: null } : {}),
    updatedAt: new Date().toISOString(),
  };

  const db = readDb();
  const opened = db.shops.find((candidate) => candidate.id === id);
  if (opened) Object.assign(opened, changes);
  else db.shopPatches[id] = { ...db.shopPatches[id], ...changes };
  writeDb(db);

  return ok(rawShop(findShop(id)!), "Boutique mise à jour.");
};

// ─────────────────────────────────────────────
//  GET /products — fiches du catalogue, sur lesquelles une boutique crée ses offres.
// ─────────────────────────────────────────────
export const listProducts = (
  params: URLSearchParams
): ApiResponse<{ products: Product[]; total: number; page: number; totalPages: number }> => {
  const search = params.get("search")?.toLowerCase();
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 10)));
  const all = PRODUCTS.filter((product) => !search || product.name.toLowerCase().includes(search));
  return ok(
    {
      products: all.slice((page - 1) * limit, page * limit),
      total: all.length,
      page,
      totalPages: Math.ceil(all.length / limit),
    },
    "Produits récupérés avec succès"
  );
};

// ─────────────────────────────────────────────
//  Offres
// ─────────────────────────────────────────────
const readOfferFields = (fields: Record<string, unknown>, creation: boolean) => {
  const errors: string[] = [];
  const present = (key: string) => fields[key] !== undefined && fields[key] !== "";

  if (creation && !present("boutiqueId")) errors.push("L'identifiant de la boutique est requis.");
  if (creation && !present("productId")) errors.push("L'identifiant du produit est requis.");

  if (creation && !present("price")) errors.push("Le prix est requis.");
  else if (fields.price !== undefined && !isNumberLike(fields.price, false)) {
    errors.push("Le prix doit être un nombre positif.");
  }
  if (fields.discountPrice !== undefined && !isNumberLike(fields.discountPrice, false)) {
    errors.push("Le prix remisé doit être un nombre positif.");
  }
  if (creation && !present("stock")) errors.push("Le stock est requis.");
  else if (fields.stock !== undefined && !isNumberLike(fields.stock, true)) {
    errors.push("Le stock doit être un nombre entier positif.");
  }

  const delivery = readDeliveryField(fields.delivery, errors);
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);

  const number = (key: string) => (fields[key] !== undefined ? Number(fields[key]) : undefined);
  return { price: number("price"), discountPrice: number("discountPrice"), stock: number("stock"), delivery };
};

export const createOffer = (body: unknown): ApiResponse<ProductBoutique> => {
  const user = requireSeller();
  const { fields, files } = readBody(body);
  const values = readOfferFields(fields, true);

  if (files.length === 0) throw new ApiError("Au moins une image est requise.", 400);

  const boutiqueId = String(fields.boutiqueId);
  const productId = String(fields.productId);
  const shop = findShop(boutiqueId);
  if (!shop) throw new ApiError("Boutique introuvable", 404);
  if (!PRODUCTS.some((product) => product.id === productId)) {
    throw new ApiError("Produit introuvable", 404);
  }
  if (!canManage(user, shop)) throw new ApiError(OFFER_FORBIDDEN_MESSAGE, 403);

  // Sans précision, la nouvelle offre suit la livraison de sa boutique.
  let delivery: MockProductDelivery = { useShopSettings: true, modes: [], flatRateFee: null };
  if (values.delivery !== undefined) {
    const built = buildProductDelivery(values.delivery, shop);
    if ("error" in built) throw new ApiError(built.error, 400);
    delivery = built.delivery;
  }

  if (liveCatalog().some((offer) => offer.boutique?.id === boutiqueId && offer.productId === productId)) {
    throw new ApiError("Ce produit est déjà référencé dans cette boutique", 409);
  }

  const now = new Date().toISOString();
  const id = objectId();
  const db = readDb();
  db.offers.push({
    id,
    boutiqueId,
    productId,
    urlImages: files.map((file) => URL.createObjectURL(file)),
    price: values.price ?? 0,
    discountPrice: values.discountPrice ?? null,
    stock: values.stock ?? 0,
    delivery,
    createdAt: now,
    updatedAt: now,
  });
  writeDb(db);

  return ok(findLiveOffer(id)!, "Produit ajouté à la boutique avec succès", 201);
};

export const updateOffer = (id: string, body: unknown): ApiResponse<ProductBoutique> => {
  const user = requireSeller();
  const { fields, files } = readBody(body);
  const values = readOfferFields(fields, false);

  const offer = findLiveOffer(id);
  if (!offer) throw new ApiError("Produit en boutique non trouvé", 404);

  // Une offre dont la boutique a disparu ne relève plus que de l'administration.
  const allowed = offer.boutique ? canManage(user, offer.boutique) : user.role === EntityType.ADMIN;
  if (!allowed) throw new ApiError(OFFER_FORBIDDEN_MESSAGE, 403);

  // { useShopSettings: true } rend l'offre à l'héritage ; absent, rien ne change.
  let delivery: MockProductDelivery | undefined;
  if (values.delivery !== undefined) {
    const built = buildProductDelivery(values.delivery, offer.boutique ?? {});
    if ("error" in built) throw new ApiError(built.error, 400);
    delivery = built.delivery;
  }

  const raw = parseJson(fields.imagesToRemove);
  const imagesToRemove = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
  const urlImages = [
    ...offer.urlImages.filter((url) => !imagesToRemove.includes(url)),
    ...files.map((file) => URL.createObjectURL(file)),
  ];

  const now = new Date().toISOString();
  const db = readDb();
  const created = db.offers.find((candidate) => candidate.id === id);
  const changes = {
    ...(values.price !== undefined ? { price: values.price } : {}),
    ...(values.discountPrice !== undefined ? { discountPrice: values.discountPrice } : {}),
    ...(values.stock !== undefined ? { stock: values.stock } : {}),
    ...(delivery ? { delivery } : {}),
    urlImages,
    updatedAt: now,
  };

  if (created) Object.assign(created, changes);
  else db.offerPatches[id] = { ...db.offerPatches[id], ...changes };
  writeDb(db);

  return ok(findLiveOffer(id)!, "Produit en boutique mis à jour avec succès");
};
