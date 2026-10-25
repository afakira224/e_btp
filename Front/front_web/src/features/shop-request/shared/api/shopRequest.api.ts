import { apiClient } from "../../../../shared/api";
import type { ShopRequest, ShopRequestInput } from "../../../../entities/shop-request";

// ─────────────────────────────────────────────
//  Demandes d'ouverture de boutique, côté demandeur :
//
//   GET   /shop-requests/mine          ses demandes, la plus récente d'abord
//   POST  /shop-requests               le questionnaire ; le demandeur est la session
//   PATCH /shop-requests/:id/cancel    retrait avant examen
// ─────────────────────────────────────────────

export const fetchMyShopRequests = async (signal?: AbortSignal): Promise<ShopRequest[]> => {
  const response = await apiClient.get<ShopRequest[]>("/shop-requests/mine", signal);
  return response.data ?? [];
};

export const submitShopRequest = async (input: ShopRequestInput): Promise<ShopRequest> => {
  const response = await apiClient.post<ShopRequest>("/shop-requests", input);
  if (!response.data) throw new Error("La demande n'a pas été enregistrée.");
  return response.data;
};

export const cancelShopRequest = async (id: string): Promise<ShopRequest> => {
  const response = await apiClient.patch<ShopRequest>(
    `/shop-requests/${encodeURIComponent(id)}/cancel`
  );
  if (!response.data) throw new Error("Demande introuvable.");
  return response.data;
};
