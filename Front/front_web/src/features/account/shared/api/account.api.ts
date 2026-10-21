import { apiClient } from "../../../../shared/api";
import type { User } from "../../../../entities/user";
import type { Address, AddressInput } from "../../../../entities/address";
import type { Order, OrderStatus } from "../../../../entities/order";

// ─────────────────────────────────────────────
//  Espace compte — appels réseau.
//  Regroupés ici plutôt que dans chaque sub-feature : le tableau de bord
//  lit les commandes et les adresses, qui ont aussi leurs propres pages.
//  Les routes et les formes de réponse suivent le back à la lettre.
// ─────────────────────────────────────────────

// ── Profil ────────────────────────────────────
export interface ProfileInput {
  nom: string;
  prenom: string;
  telephone: string;
}

/** PUT /auth/me — l'email ne se modifie pas : c'est l'identifiant de connexion. */
export const updateProfile = async (input: ProfileInput): Promise<User> => {
  const response = await apiClient.put<User>("/auth/me", input);
  if (!response.data) throw new Error("Profil introuvable.");
  return response.data;
};

export interface PasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/**
 * PUT /auth/change-password. Le back ferme au passage les sessions ouvertes
 * sur les autres appareils ; la session courante est conservée.
 */
export const changePassword = async (input: PasswordInput): Promise<string> => {
  const response = await apiClient.put("/auth/change-password", input);
  return response.message;
};

// ── Adresses ──────────────────────────────────
/** Par défaut en tête, puis les plus récentes — l'ordre du back. */
export const fetchAddresses = async (userId: string, signal?: AbortSignal): Promise<Address[]> => {
  const response = await apiClient.get<Address[]>(
    `/addresses?userId=${encodeURIComponent(userId)}`,
    signal
  );
  return response.data ?? [];
};

export const createAddress = async (userId: string, input: AddressInput): Promise<Address> => {
  const response = await apiClient.post<Address>("/addresses", { userId, ...input });
  if (!response.data) throw new Error("L'adresse n'a pas pu être créée.");
  return response.data;
};

export const updateAddress = async (id: string, input: AddressInput): Promise<Address> => {
  const response = await apiClient.put<Address>(`/addresses/${encodeURIComponent(id)}`, input);
  if (!response.data) throw new Error("Adresse introuvable.");
  return response.data;
};

export const setDefaultAddress = async (id: string): Promise<Address> => {
  const response = await apiClient.patch<Address>(`/addresses/${encodeURIComponent(id)}/default`);
  if (!response.data) throw new Error("Adresse introuvable.");
  return response.data;
};

export const deleteAddress = async (id: string): Promise<void> => {
  await apiClient.delete(`/addresses/${encodeURIComponent(id)}`);
};

// ── Commandes ─────────────────────────────────
export interface OrderPage {
  items: Order[];
  total: number;
  page: number;
  hasMore: boolean;
}

interface RawOrderPage {
  orders: Order[];
  total: number;
  page: number;
  totalPages: number;
}

export const fetchOrders = async (
  { userId, status, page, limit }: { userId: string; status?: OrderStatus | undefined; page: number; limit: number },
  signal?: AbortSignal
): Promise<OrderPage> => {
  const params = new URLSearchParams({ userId, page: String(page), limit: String(limit) });
  if (status) params.set("status", status);

  const response = await apiClient.get<RawOrderPage>(`/orders?${params.toString()}`, signal);
  const data = response.data;
  if (!data) return { items: [], total: 0, page, hasMore: false };
  return {
    items: data.orders,
    total: data.total,
    page: data.page,
    hasMore: data.page < data.totalPages,
  };
};

export const fetchOrder = async (id: string, signal?: AbortSignal): Promise<Order> => {
  const response = await apiClient.get<Order>(`/orders/${encodeURIComponent(id)}`, signal);
  if (!response.data) throw new Error("Commande introuvable.");
  return response.data;
};
