import { apiClient } from "../../../../shared/api";
import type {
  DeliverySettingsInput,
  ProductDeliveryInput,
  ShopDeliveryOverview,
} from "../../../../entities/delivery";
import type { Product, ProductBoutique } from "../../../../entities/product";
import type { Shop } from "../../../../entities/shop";
import { EntityType, type User } from "../../../../entities/user";
import { fetchShop, fetchShops } from "../../../shops";

// ─────────────────────────────────────────────
//  Espace vendeur — routes du back utilisées :
//
//   GET  /shops?ownerId=                    boutiques du vendeur
//   PUT  /shops/:id                         multipart : informations + logo
//   GET  /shops/:id/delivery                réglages et portée
//   PUT  /shops/:id/delivery                { modes, flatRateFee }
//   GET  /product-boutiques?boutiqueId=     produits de la boutique
//   GET  /product-boutiques/:id             un produit, livraison effective comprise
//   POST /product-boutiques                 multipart : photos + champs + delivery (JSON)
//   PUT  /product-boutiques/:id             multipart, mêmes champs, tous facultatifs
//   GET  /products?search=                  fiches du catalogue
//
//  Le droit d'écrire est vérifié par le back (propriétaire ou admin) : le
//  front masque ce qu'il ne peut pas faire, il ne décide de rien.
// ─────────────────────────────────────────────

/** Boutiques que ce compte gère : les siennes, ou toutes pour un administrateur. */
export const fetchManagedShops = async (user: User, signal?: AbortSignal): Promise<Shop[]> => {
  const ownerId = user.role === EntityType.ADMIN ? undefined : user._id;
  const page = await fetchShops({ ownerId, page: 1, limit: 100 }, signal);
  return page.items;
};

/** Même règle que canManageShop côté back. */
export const canManageShop = (user: User | null, shop: Pick<Shop, "ownerId">): boolean =>
  user !== null &&
  (user.role === EntityType.ADMIN || (user.role === EntityType.SHOP && shop.ownerId === user._id));

// ── Informations de la boutique ─────────────
export interface ShopInfoSubmission {
  nom: string;
  description: string;
  email: string;
  adresse: string;
  /** Nouveau logo : remplace l'ancien. */
  logo?: File | null | undefined;
  /** Retire le logo sans le remplacer. */
  removeLogo?: boolean | undefined;
}

/**
 * Multipart : le logo l'impose. Le téléphone de la boutique n'est ni lu ni
 * envoyé (voir entities/shop). PUT /shops/:id renvoie le document brut : on
 * relit la boutique par fetchShop, qui la normalise comme partout ailleurs.
 */
export const updateShopInfo = async (shopId: string, submission: ShopInfoSubmission): Promise<Shop> => {
  const form = new FormData();
  form.append("nom", submission.nom);
  form.append("description", submission.description);
  form.append("email", submission.email);
  form.append("adresse", submission.adresse);
  if (submission.logo) form.append("logo", submission.logo);
  else if (submission.removeLogo) form.append("removeLogo", "true");

  await apiClient.put(`/shops/${encodeURIComponent(shopId)}`, form);
  return fetchShop(shopId);
};

// ── Livraison de la boutique ────────────────
const deliveryPath = (shopId: string) => `/shops/${encodeURIComponent(shopId)}/delivery`;

export const fetchShopDelivery = async (
  shopId: string,
  signal?: AbortSignal
): Promise<ShopDeliveryOverview> => {
  const response = await apiClient.get<ShopDeliveryOverview>(deliveryPath(shopId), signal);
  if (!response.data) throw new Error("Réglages de livraison introuvables.");
  return response.data;
};

export const saveShopDelivery = async (
  shopId: string,
  input: DeliverySettingsInput
): Promise<ShopDeliveryOverview> => {
  const response = await apiClient.put<ShopDeliveryOverview>(deliveryPath(shopId), input);
  if (!response.data) throw new Error("Réglages de livraison non enregistrés.");
  return response.data;
};

// ── Produits de la boutique ─────────────────
export interface OfferPage {
  items: ProductBoutique[];
  total: number;
  page: number;
  hasMore: boolean;
}

export const fetchShopOffers = async (
  shopId: string,
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<OfferPage> => {
  const params = new URLSearchParams({ boutiqueId: shopId, page: String(page), limit: String(limit) });
  const response = await apiClient.get<{
    items: ProductBoutique[];
    total: number;
    page: number;
    totalPages: number;
  }>(`/product-boutiques?${params.toString()}`, signal);
  const data = response.data;
  if (!data) return { items: [], total: 0, page, hasMore: false };
  return { items: data.items, total: data.total, page: data.page, hasMore: data.page < data.totalPages };
};

export const fetchOffer = async (id: string, signal?: AbortSignal): Promise<ProductBoutique> => {
  const response = await apiClient.get<ProductBoutique>(
    `/product-boutiques/${encodeURIComponent(id)}`,
    signal
  );
  if (!response.data) throw new Error("Produit introuvable.");
  return response.data;
};

/** Fiches du catalogue, sur lesquelles la boutique crée ses offres. */
export const searchCatalogProducts = async (
  search: string,
  signal?: AbortSignal
): Promise<Product[]> => {
  const params = new URLSearchParams({ limit: "20" });
  if (search.trim()) params.set("search", search.trim());
  const response = await apiClient.get<{ products: Product[] }>(`/products?${params.toString()}`, signal);
  return response.data?.products ?? [];
};

// ── Écriture d'une offre ────────────────────
export interface OfferSubmission {
  price: number;
  stock: number;
  delivery: ProductDeliveryInput;
  /** Nouvelles photos. */
  images: File[];
  /** Photos existantes à retirer (modification). */
  imagesToRemove?: string[];
}

/**
 * Multipart : les photos l'imposent. `delivery` part en JSON, que le back
 * relit (productDeliveryFields). Aucun frais n'est envoyé hors de cette
 * configuration : le serveur calcule tout le reste.
 */
const toFormData = (submission: OfferSubmission, extra: Record<string, string> = {}): FormData => {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  form.append("price", String(submission.price));
  form.append("stock", String(submission.stock));
  form.append("delivery", JSON.stringify(submission.delivery));
  if (submission.imagesToRemove?.length) {
    form.append("imagesToRemove", JSON.stringify(submission.imagesToRemove));
  }
  for (const image of submission.images) form.append("images", image);
  return form;
};

export const createOffer = async (
  shopId: string,
  productId: string,
  submission: OfferSubmission
): Promise<ProductBoutique> => {
  const response = await apiClient.post<ProductBoutique>(
    "/product-boutiques",
    toFormData(submission, { boutiqueId: shopId, productId })
  );
  if (!response.data) throw new Error("Le produit n'a pas été ajouté.");
  return response.data;
};

export const updateOffer = async (
  id: string,
  submission: OfferSubmission
): Promise<ProductBoutique> => {
  const response = await apiClient.put<ProductBoutique>(
    `/product-boutiques/${encodeURIComponent(id)}`,
    toFormData(submission)
  );
  if (!response.data) throw new Error("Le produit n'a pas été mis à jour.");
  return response.data;
};
