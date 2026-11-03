import { apiClient } from "../../../../shared/api";
import type { Boost, BoostSettings } from "../../../../entities/boost";
import type { Campaign } from "../../../../entities/promotion";

// Campagnes de la plateforme et réglages des boosts — réservés à l'administration.
// L'administration ne valide aucune promotion de boutique : elle crée les
// campagnes, règle les prix des boosts et traite les signalements.

export const fetchAllCampaigns = async (signal?: AbortSignal): Promise<Campaign[]> => {
  const response = await apiClient.get<Campaign[]>("/campaigns?all=true", signal);
  return response.data ?? [];
};

export interface CampaignInput {
  nom: string;
  description?: string | undefined;
  startDate: string;
  endDate: string;
  minDiscount: number;
  familleIds?: string[] | undefined;
}

export const createCampaign = async (input: CampaignInput) => (await apiClient.post<Campaign>("/campaigns", input)).message;

export const updateCampaign = async (id: string, input: Partial<CampaignInput> & { actif?: boolean }) =>
  (await apiClient.put<Campaign>(`/campaigns/${encodeURIComponent(id)}`, input)).message;

export const fetchBoostSettings = async (signal?: AbortSignal): Promise<BoostSettings> => {
  const response = await apiClient.get<BoostSettings>("/boosts/settings", signal);
  if (!response.data) throw new Error("Réglages introuvables.");
  return response.data;
};

export const saveBoostSettings = async (input: Partial<Omit<BoostSettings, "minDailyBudget" | "minAudience">>) =>
  (await apiClient.put<BoostSettings>("/boosts/settings", input)).message;

export const fetchActiveBoosts = async (signal?: AbortSignal): Promise<Boost[]> => {
  const response = await apiClient.get<{ boosts: Boost[] }>("/boosts", signal);
  return response.data?.boosts ?? [];
};
