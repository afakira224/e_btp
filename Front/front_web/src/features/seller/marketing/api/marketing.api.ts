import { apiClient } from "../../../../shared/api";
import type { Boost, BoostEstimate, BoostInput, Credits } from "../../../../entities/boost";
import type { ProductBoutique } from "../../../../entities/product";
import type { Campaign, PromotionAction, PromotionTab, ShopPromotion, ShopPromotionInput } from "../../../../entities/promotion";

// ─────────────────────────────────────────────
//  Promotions, boosts et crédits d'une boutique — les routes de
//  Back/src/routers/router/{marketing,boost,campaign}.route.ts.
//  Aucune validation : la boutique lance seule ; le serveur applique les
//  plafonds et répond par un message clair quand une règle bloque.
// ─────────────────────────────────────────────

const shop = (shopId: string) => `/shops/${encodeURIComponent(shopId)}`;

const required = <T>(data: T | null, message: string): T => {
  if (data === null || data === undefined) throw new Error(message);
  return data;
};

export interface PromotionList {
  promotions: ShopPromotion[];
  total: number;
  page: number;
  totalPages: number;
  counts: Record<PromotionTab, number>;
  /** Sanction de la modération : plus de promotion ni de boost jusqu'à cette date. */
  promotionsBlockedUntil: string | null;
}

export const fetchShopPromotions = async (shopId: string, tab: PromotionTab, signal?: AbortSignal): Promise<PromotionList> => {
  const response = await apiClient.get<PromotionList>(`${shop(shopId)}/promotions?tab=${tab}&limit=50`, signal);
  return required(response.data, "Promotions introuvables.");
};

export const fetchShopPromotion = async (shopId: string, promotionId: string, signal?: AbortSignal): Promise<ShopPromotion> => {
  const response = await apiClient.get<ShopPromotion>(`${shop(shopId)}/promotions/${encodeURIComponent(promotionId)}`, signal);
  return required(response.data, "Promotion introuvable.");
};

export const createShopPromotion = async (shopId: string, input: ShopPromotionInput) => {
  const response = await apiClient.post<ShopPromotion>(`${shop(shopId)}/promotions`, input);
  return { promotion: required(response.data, "La promotion n'a pas été créée."), message: response.message };
};

export const updateShopPromotion = async (shopId: string, promotionId: string, input: ShopPromotionInput) => {
  const response = await apiClient.put<ShopPromotion>(`${shop(shopId)}/promotions/${encodeURIComponent(promotionId)}`, input);
  return { promotion: required(response.data, "La promotion n'a pas été modifiée."), message: response.message };
};

export const runPromotionAction = async (promotionId: string, action: PromotionAction, body: { endDate?: string; now?: boolean } = {}) => {
  const response = await apiClient.patch<ShopPromotion>(`/promotions/${encodeURIComponent(promotionId)}/${action}`, body);
  return { promotion: required(response.data, "Action impossible."), message: response.message };
};

/** Produit phare n° 1 à 6, ou null pour le retirer. */
export const setFeaturedRank = async (offerId: string, rank: number | null) => {
  const response = await apiClient.patch<ProductBoutique>(`/product-boutiques/${encodeURIComponent(offerId)}/featured`, { rank });
  return response.message;
};

export const fetchFeatured = async (shopId: string, signal?: AbortSignal): Promise<ProductBoutique[]> => {
  const response = await apiClient.get<{ items: ProductBoutique[] }>(
    `/product-boutiques?boutiqueId=${encodeURIComponent(shopId)}&featured=true&page=1&limit=6`,
    signal
  );
  return response.data?.items ?? [];
};

// ── Campagnes de la plateforme ──────────────
export const fetchOpenCampaigns = async (signal?: AbortSignal): Promise<Campaign[]> => {
  const response = await apiClient.get<Campaign[]>("/campaigns", signal);
  return response.data ?? [];
};

export const joinCampaign = async (
  campaignId: string,
  input: { boutiqueId: string; productBoutiqueIds: string[]; discountValue: number; confirmHighDiscount?: boolean }
) => {
  const response = await apiClient.post<ShopPromotion>(`/campaigns/${encodeURIComponent(campaignId)}/entries`, input);
  return { promotion: required(response.data, "Inscription impossible."), message: response.message };
};

// ── Boosts ──────────────────────────────────
export interface BoostList {
  boosts: Boost[];
  total: number;
  counts: { active: number; ended: number };
}

export const fetchBoosts = async (shopId: string, tab: "active" | "ended", signal?: AbortSignal): Promise<BoostList> => {
  const response = await apiClient.get<BoostList>(`${shop(shopId)}/boosts?tab=${tab}`, signal);
  return required(response.data, "Boosts introuvables.");
};

export const fetchBoost = async (boostId: string, signal?: AbortSignal): Promise<Boost> => {
  const response = await apiClient.get<Boost>(`/boosts/${encodeURIComponent(boostId)}`, signal);
  return required(response.data, "Boost introuvable.");
};

export const estimateBoost = async (shopId: string, input: BoostInput): Promise<BoostEstimate> => {
  const response = await apiClient.post<BoostEstimate>(`${shop(shopId)}/boosts/estimate`, input);
  return required(response.data, "Estimation impossible.");
};

export const createBoost = async (shopId: string, input: BoostInput) => {
  const response = await apiClient.post<Boost>(`${shop(shopId)}/boosts`, input);
  return { boost: required(response.data, "Le boost n'a pas été lancé."), message: response.message };
};

export const runBoostAction = async (boostId: string, action: "pause" | "resume" | "stop") => {
  const response = await apiClient.patch<Boost>(`/boosts/${encodeURIComponent(boostId)}/${action}`);
  return { boost: required(response.data, "Action impossible."), message: response.message };
};

// ── Crédits ─────────────────────────────────
export const fetchCredits = async (shopId: string, signal?: AbortSignal): Promise<Credits> => {
  const response = await apiClient.get<Credits>(`${shop(shopId)}/credits`, signal);
  return required(response.data, "Crédits introuvables.");
};

export const rechargeCredits = async (shopId: string, amount: number) => {
  const response = await apiClient.post<{ purchaseId: string; amount: number; redirectUrl: string }>(`${shop(shopId)}/credits`, { amount });
  return required(response.data, "La recharge n'a pas été lancée.");
};

export const fetchCreditPurchase = async (shopId: string, purchaseId: string, signal?: AbortSignal) => {
  const response = await apiClient.get<{ purchaseId: string; amount: number; status: "pending" | "paid" | "failed" }>(
    `${shop(shopId)}/credits/${encodeURIComponent(purchaseId)}`,
    signal
  );
  return required(response.data, "Recharge introuvable.");
};

export const settleCreditPurchase = async (shopId: string, purchaseId: string, outcome: "paid" | "failed") => {
  const response = await apiClient.post<{ status: string; balance: number }>(
    `${shop(shopId)}/credits/${encodeURIComponent(purchaseId)}/sandbox`,
    { outcome }
  );
  return response.message;
};
