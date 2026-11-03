// ─────────────────────────────────────────────
//  Boosts — miroir de BoostDto (Back/src/shared/interfaces/Boost.interfaces.ts).
//  Comme « Booster la publication » : la boutique paie un budget pour que
//  sa promotion ou ses produits soient montrés à plus de clients.
// ─────────────────────────────────────────────
import type { PromotionOffer } from "../../promotion/model/shopPromotion.types";

export type BoostKind = "promotion" | "product";
export type BoostGoal = "visits" | "views";
export type BoostStatus = "active" | "paused" | "ended" | "stopped";
export type BoostRelation = "all" | "new" | "returning";

export const BOOST_KIND_LABELS: Record<BoostKind, string> = { promotion: "Boost de promotion", product: "Boost de produit" };
export const BOOST_GOAL_LABELS: Record<BoostGoal, string> = { visits: "Plus de visites", views: "Plus de vues" };
export const BOOST_GOAL_HINTS: Record<BoostGoal, string> = {
  visits: "Vous payez quand un client ouvre la fiche du produit.",
  views: "Vous payez aux 1 000 affichages.",
};
export const BOOST_STATUS_LABELS: Record<BoostStatus, string> = { active: "En cours", paused: "En pause", ended: "Terminé", stopped: "Arrêté" };
export const BOOST_STATUS_TONES: Record<BoostStatus, "success" | "warning" | "neutral" | "danger"> = {
  active: "success",
  paused: "warning",
  ended: "neutral",
  stopped: "danger",
};
export const BOOST_RELATION_LABELS: Record<BoostRelation, string> = { all: "Tous les clients", new: "Nouveaux clients", returning: "Anciens clients" };

/** Communes de Conakry et villes de l'intérieur proposées au ciblage. */
export const CONAKRY_COMMUNES = ["Kaloum", "Dixinn", "Matam", "Ratoma", "Matoto"] as const;
export const INLAND_CITIES = ["Kindia", "Boké", "Labé", "Kankan", "Nzérékoré", "Mamou", "Siguiri"] as const;
export const CUSTOMER_TYPE_LABELS: Record<"user" | "user_societe", string> = { user: "Particuliers", user_societe: "Sociétés" };

export interface BoostAudience {
  mode: "auto" | "custom";
  communes: string[];
  villes: string[];
  customerTypes: string[];
  interestFamilleIds: string[];
  relation: BoostRelation;
}

export interface BoostTotals {
  impressions: number;
  reach: number;
  visits: number;
  carts: number;
  orders: number;
  revenue: number;
  spent: number;
}

export interface Boost {
  id: string;
  boutiqueId: string;
  kind: BoostKind;
  kindLabel: string;
  promotion?: { id: string; nom: string; endDate: string } | undefined;
  productBoutiqueIds: string[];
  offers: PromotionOffer[];
  goal: BoostGoal;
  audience: BoostAudience;
  dailyBudget: number;
  reserved: number;
  spent: number;
  remaining: number;
  refunded: number;
  costPerVisit: number;
  costPerThousandViews: number;
  startDate: string;
  endDate: string;
  status: BoostStatus;
  statusLabel: string;
  stopReason?: string | null | undefined;
  endedAt?: string | null | undefined;
  totals: BoostTotals & { visitRate: number; costPerSale: number | null };
  daily?: ({ day: string } & BoostTotals)[] | undefined;
  availableActions: ("pause" | "resume" | "stop")[];
  createdAt: string;
}

export interface BoostInput {
  kind: BoostKind;
  promotionId?: string | undefined;
  productBoutiqueIds?: string[] | undefined;
  goal: BoostGoal;
  audience: Partial<BoostAudience>;
  dailyBudget: number;
  days: number;
}

export interface BoostEstimate {
  audienceSize: number;
  minAudience: number;
  audienceOk: boolean;
  days: number;
  maxDays: number;
  totalBudget: number;
  minDailyBudget: number;
  dailyViews: [number, number];
  dailyVisits: [number, number];
  costPerVisit: number;
  costPerThousandViews: number;
  credits: number;
}

export interface CreditEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: "recharge" | "monthly_grant" | "boost_reserve" | "boost_refund";
  label: string;
  createdAt: string;
}

export interface Credits {
  balance: number;
  settings: { costPerVisit: number; costPerThousandViews: number; monthlyCredits: number; minDailyBudget: number; minAudience: number };
  ledger: CreditEntry[];
}

export interface BoostSettings {
  costPerVisit: number;
  costPerThousandViews: number;
  monthlyCredits: number;
  minVisitsPerDay: number;
  minAudience: number;
  minDailyBudget: number;
}
