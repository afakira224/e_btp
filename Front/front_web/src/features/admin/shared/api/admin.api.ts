import { apiClient } from "../../../../shared/api";
import type {
  ShopRequest,
  ShopRequestCounts,
  ShopRequestStatus,
} from "../../../../entities/shop-request";

// ─────────────────────────────────────────────
//  Administration — examen des demandes d'ouverture de boutique :
//
//   GET   /shop-requests?status=&search=&page=&limit=   { requests, total, page, totalPages, counts }
//   GET   /shop-requests/:id
//   PATCH /shop-requests/:id/approve    crée la boutique, le compte devient gérant
//   PATCH /shop-requests/:id/reject     { reason }
//
//  Le back réserve ces routes à l'administration (requireRole) ; AdminGuard
//  ne fait qu'éviter d'afficher un écran voué au 403.
// ─────────────────────────────────────────────

export interface ShopRequestPage {
  items: ShopRequest[];
  total: number;
  page: number;
  totalPages: number;
  counts: ShopRequestCounts;
}

export const fetchShopRequests = async (
  {
    status,
    search,
    page,
    limit,
  }: { status?: ShopRequestStatus | undefined; search?: string | undefined; page: number; limit: number },
  signal?: AbortSignal
): Promise<ShopRequestPage> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set("status", status);
  if (search?.trim()) params.set("search", search.trim());

  const response = await apiClient.get<{
    requests: ShopRequest[];
    total: number;
    page: number;
    totalPages: number;
    counts: ShopRequestCounts;
  }>(`/shop-requests?${params.toString()}`, signal);

  const data = response.data;
  if (!data) throw new Error("Demandes introuvables.");
  return { items: data.requests, total: data.total, page: data.page, totalPages: data.totalPages, counts: data.counts };
};

const requestPath = (id: string) => `/shop-requests/${encodeURIComponent(id)}`;

export const fetchShopRequest = async (id: string, signal?: AbortSignal): Promise<ShopRequest> => {
  const response = await apiClient.get<ShopRequest>(requestPath(id), signal);
  if (!response.data) throw new Error("Demande introuvable.");
  return response.data;
};

export const approveShopRequest = async (id: string): Promise<ShopRequest> => {
  const response = await apiClient.patch<ShopRequest>(`${requestPath(id)}/approve`);
  if (!response.data) throw new Error("La demande n'a pas été approuvée.");
  return response.data;
};

export const rejectShopRequest = async (id: string, reason: string): Promise<ShopRequest> => {
  const response = await apiClient.patch<ShopRequest>(`${requestPath(id)}/reject`, { reason });
  if (!response.data) throw new Error("La demande n'a pas été refusée.");
  return response.data;
};
