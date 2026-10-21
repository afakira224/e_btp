import { apiClient } from "../../../../shared/api";
import { EMPTY_CART, type Cart } from "../../../../entities/cart";

// ─────────────────────────────────────────────
//  Panier — cinq routes, toutes portant l'identifiant utilisateur dans
//  l'URL et protégées par requireAuth + requireSelf côté back.
//  Chacune renvoie le panier complet : il n'y a pas d'état à reconstruire
//  côté client après une écriture.
// ─────────────────────────────────────────────

const base = (userId: string) => `/cart/${encodeURIComponent(userId)}`;

export const fetchCart = async (userId: string, signal?: AbortSignal): Promise<Cart> => {
  const response = await apiClient.get<Cart>(base(userId), signal);
  return response.data ?? EMPTY_CART;
};

export const addCartItem = async (
  userId: string,
  productBoutiqueId: string,
  quantity = 1
): Promise<Cart> => {
  const response = await apiClient.post<Cart>(`${base(userId)}/items`, {
    productBoutiqueId,
    quantity,
  });
  return response.data ?? EMPTY_CART;
};

/** `quantity: 0` retire l'article — c'est le contrat du back. */
export const updateCartItem = async (
  userId: string,
  productBoutiqueId: string,
  quantity: number
): Promise<Cart> => {
  const response = await apiClient.put<Cart>(
    `${base(userId)}/items/${encodeURIComponent(productBoutiqueId)}`,
    { quantity }
  );
  return response.data ?? EMPTY_CART;
};

export const removeCartItem = async (
  userId: string,
  productBoutiqueId: string
): Promise<Cart> => {
  const response = await apiClient.delete<Cart>(
    `${base(userId)}/items/${encodeURIComponent(productBoutiqueId)}`
  );
  return response.data ?? EMPTY_CART;
};

export const clearCart = async (userId: string): Promise<Cart> => {
  const response = await apiClient.delete<Cart>(base(userId));
  return response.data ?? EMPTY_CART;
};
