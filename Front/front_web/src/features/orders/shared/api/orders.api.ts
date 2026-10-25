import { apiClient } from "../../../../shared/api";
import type {
  Order,
  OrderPaymentStatus,
  OrderStatus,
  ShopOrder,
  ShopOrderAction,
  ShopOrderActionInput,
  ShopOrderCounts,
  ShopOrderGroup,
  ShopOrderStatus,
} from "../../../../entities/order";

// ─────────────────────────────────────────────
//  Cycle de vie des commandes — appels réseau.
//
//   GET   /orders/:id                     la commande et ses sous-commandes
//   GET   /shop-orders?boutiqueId=&group=&status=&search=&page=&limit=
//   GET   /shop-orders/:id
//   PATCH /shop-orders/:id/:action        JSON, ou multipart avec photos (retour)
//   POST  /payments/:orderId              relance le paiement en ligne
//   POST  /payments/sandbox/:orderId      { outcome } — prestataire simulé
// ─────────────────────────────────────────────

export const fetchOrder = async (id: string, signal?: AbortSignal): Promise<Order> => {
  const response = await apiClient.get<Order>(`/orders/${encodeURIComponent(id)}`, signal);
  if (!response.data) throw new Error("Commande introuvable.");
  return response.data;
};

export interface ShopOrderQuery {
  boutiqueId?: string | undefined;
  group?: ShopOrderGroup | undefined;
  status?: ShopOrderStatus | undefined;
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface ShopOrderPage {
  items: ShopOrder[];
  total: number;
  page: number;
  totalPages: number;
  counts: ShopOrderCounts;
}

interface RawShopOrderPage {
  shopOrders: ShopOrder[];
  total: number;
  page: number;
  totalPages: number;
  counts: ShopOrderCounts;
}

export const fetchShopOrders = async (query: ShopOrderQuery, signal?: AbortSignal): Promise<ShopOrderPage> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const response = await apiClient.get<RawShopOrderPage>(`/shop-orders?${params.toString()}`, signal);
  const data = response.data;
  if (!data) throw new Error("Commandes introuvables.");
  return {
    items: data.shopOrders,
    total: data.total,
    page: data.page,
    totalPages: data.totalPages,
    counts: data.counts,
  };
};

export const fetchShopOrder = async (id: string, signal?: AbortSignal): Promise<ShopOrder> => {
  const response = await apiClient.get<ShopOrder>(`/shop-orders/${encodeURIComponent(id)}`, signal);
  if (!response.data) throw new Error("Commande introuvable.");
  return response.data;
};

/**
 * Une action sur une sous-commande. Avec des photos (demande de retour), le
 * corps part en multipart comme multer l'attend ; sinon en JSON.
 */
export const performShopOrderAction = async (
  id: string,
  action: ShopOrderAction,
  input: ShopOrderActionInput = {}
): Promise<ShopOrder> => {
  const { photos = [], ...fields } = input;
  const defined = Object.entries(fields).filter(([, value]) => value !== undefined && value !== "");

  let body: unknown;
  if (photos.length > 0) {
    const form = new FormData();
    for (const [key, value] of defined) form.append(key, String(value));
    for (const photo of photos) form.append("photos", photo);
    body = form;
  } else {
    body = Object.fromEntries(defined);
  }

  const response = await apiClient.patch<ShopOrder>(
    `/shop-orders/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
    body
  );
  if (!response.data) throw new Error("La commande n'a pas pu être mise à jour.");
  return response.data;
};

// ── Paiement en ligne ───────────────────────
export interface PaymentSummary {
  orderId: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentExpiresAt: string | null;
  /** Page du prestataire où le client paie : renvoyée à la relance. */
  redirectUrl?: string | undefined;
}

export const restartPayment = async (orderId: string): Promise<PaymentSummary> => {
  const response = await apiClient.post<PaymentSummary>(`/payments/${encodeURIComponent(orderId)}`);
  if (!response.data) throw new Error("Le paiement n'a pas pu être relancé.");
  return response.data;
};

export const settleSandboxPayment = async (
  orderId: string,
  outcome: "paid" | "failed"
): Promise<{ summary: PaymentSummary; message: string }> => {
  const response = await apiClient.post<PaymentSummary>(`/payments/sandbox/${encodeURIComponent(orderId)}`, {
    outcome,
  });
  if (!response.data) throw new Error("Le paiement n'a pas pu être enregistré.");
  return { summary: response.data, message: response.message };
};

/**
 * Le prestataire renvoie une adresse absolue. Celle du site s'ouvre sans
 * recharger l'application ; une autre (vrai prestataire) quitte le site.
 */
export const paymentDestination = (redirectUrl: string): { internal: string } | { external: string } => {
  const url = new URL(redirectUrl, window.location.origin);
  return url.origin === window.location.origin
    ? { internal: `${url.pathname}${url.search}` }
    : { external: url.href };
};
