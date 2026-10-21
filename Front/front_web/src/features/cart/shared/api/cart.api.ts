import { apiClient } from "../../../../shared/api";
import { EMPTY_CART, type Cart } from "../../../../entities/cart";
import type { Address } from "../../../../entities/address";
import type { DeliveryQuote, DeliverySelection } from "../../../../entities/delivery";
import type { Order } from "../../../../entities/order";

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

// ─────────────────────────────────────────────
//  POST /cart/:userId/delivery-quote
//  Le corps ne porte que les modes choisis, jamais un montant : les frais
//  sont calculés par le serveur, avec la même règle qu'au checkout.
// ─────────────────────────────────────────────
export const fetchDeliveryQuote = async (
  userId: string,
  selection: DeliverySelection
): Promise<DeliveryQuote> => {
  const response = await apiClient.post<DeliveryQuote>(`${base(userId)}/delivery-quote`, {
    deliveries: toDeliveries(selection),
  });
  if (!response.data) throw new Error("Devis de livraison indisponible.");
  return response.data;
};

const toDeliveries = (selection: DeliverySelection) =>
  Object.entries(selection).map(([boutiqueId, method]) => ({ boutiqueId, method }));

// ─────────────────────────────────────────────
//  POST /orders/:userId — checkout depuis le panier.
//  Le serveur recalcule tout dans sa transaction : stock, prix figés,
//  livraisons et frais. Il refuse (400) un mode qui n'est plus proposé, un
//  stock devenu insuffisant ou une livraison sans adresse ; il fige ensuite
//  la commande et vide le panier.
// ─────────────────────────────────────────────
/**
 * GET /addresses?userId= — le carnet, par défaut en tête. Lu ici plutôt
 * qu'importé de l'espace compte, qui dépend déjà du panier.
 */
export const fetchCheckoutAddresses = async (
  userId: string,
  signal?: AbortSignal
): Promise<Address[]> => {
  const response = await apiClient.get<Address[]>(
    `/addresses?userId=${encodeURIComponent(userId)}`,
    signal
  );
  return response.data ?? [];
};

export interface CheckoutInput {
  /** Un mode par boutique du panier. */
  deliveries: DeliverySelection;
  /** Adresse du carnet ; requise dès qu'une boutique livre. */
  addressId?: string | undefined;
  /** Téléphone de contact, utile quand tout est retiré en boutique. */
  telephone?: string | undefined;
}

export const placeOrder = async (userId: string, input: CheckoutInput): Promise<Order> => {
  const response = await apiClient.post<Order>(`/orders/${encodeURIComponent(userId)}`, {
    deliveries: toDeliveries(input.deliveries),
    ...(input.addressId ? { addressId: input.addressId } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
  });
  if (!response.data) throw new Error("La commande n'a pas été créée.");
  return response.data;
};
