import { apiClient } from "../../../../shared/api";
import { EMPTY_WISHLIST, type Wishlist } from "../../../../entities/wishlist";

// ─────────────────────────────────────────────
//  Favoris — quatre routes, protégées par requireAuth + requireSelf.
//  L'ajout est idempotent côté back : un doublon n'est pas une erreur.
// ─────────────────────────────────────────────

const base = (userId: string) => `/wishlist/${encodeURIComponent(userId)}`;

export const fetchWishlist = async (
  userId: string,
  signal?: AbortSignal
): Promise<Wishlist> => {
  const response = await apiClient.get<Wishlist>(base(userId), signal);
  return response.data ?? EMPTY_WISHLIST;
};

export const addWishlistItem = async (
  userId: string,
  productBoutiqueId: string
): Promise<Wishlist> => {
  const response = await apiClient.post<Wishlist>(`${base(userId)}/items`, {
    productBoutiqueId,
  });
  return response.data ?? EMPTY_WISHLIST;
};

export const removeWishlistItem = async (
  userId: string,
  productBoutiqueId: string
): Promise<Wishlist> => {
  const response = await apiClient.delete<Wishlist>(
    `${base(userId)}/items/${encodeURIComponent(productBoutiqueId)}`
  );
  return response.data ?? EMPTY_WISHLIST;
};

export const clearWishlist = async (userId: string): Promise<Wishlist> => {
  const response = await apiClient.delete<Wishlist>(base(userId));
  return response.data ?? EMPTY_WISHLIST;
};
