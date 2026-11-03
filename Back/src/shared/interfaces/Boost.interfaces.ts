// ─────────────────────────────────────────────
//  BOOST - RESPONSE DTO
// ─────────────────────────────────────────────
import { BoostKind, BoostStatus, type IBoost } from "../../models/boost.model.js";
import type { BoostTotals } from "../services/boost.service.js";
import type { PromotionOfferDto } from "./ShopPromotion.interfaces.js";

export const BOOST_KIND_LABELS: Record<BoostKind, string> = {
  [BoostKind.PROMOTION]: "Boost de promotion",
  [BoostKind.PRODUCT]: "Boost de produit",
};

export const BOOST_STATUS_LABELS: Record<BoostStatus, string> = {
  [BoostStatus.ACTIVE]: "En cours",
  [BoostStatus.PAUSED]: "En pause",
  [BoostStatus.ENDED]: "Terminé",
  [BoostStatus.STOPPED]: "Arrêté",
};

export interface BoostDto {
  id: string;
  boutiqueId: string;
  kind: BoostKind;
  kindLabel: string;
  promotion?: { id: string; nom: string; endDate: Date } | undefined;
  productBoutiqueIds: string[];
  offers: PromotionOfferDto[];
  goal: string;
  audience: { mode: string; communes: string[]; villes: string[]; customerTypes: string[]; interestFamilleIds: string[]; relation: string };
  dailyBudget: number;
  reserved: number;
  spent: number;
  remaining: number;
  refunded: number;
  costPerVisit: number;
  costPerThousandViews: number;
  startDate: Date;
  endDate: Date;
  status: BoostStatus;
  statusLabel: string;
  stopReason?: string | null | undefined;
  endedAt?: Date | null | undefined;
  totals: BoostTotals & { visitRate: number; costPerSale: number | null };
  daily?: ({ day: string } & BoostTotals)[] | undefined;
  availableActions: ("pause" | "resume" | "stop")[];
  createdAt: Date;
}

export const toBoostDto = (
  boost: IBoost,
  totals: BoostTotals,
  extra: { offers?: PromotionOfferDto[]; promotion?: { id: string; nom: string; endDate: Date } | undefined; daily?: ({ day: string } & BoostTotals)[] } = {}
): BoostDto => {
  const spent = Math.round(boost.spent);
  const live = boost.status === BoostStatus.ACTIVE || boost.status === BoostStatus.PAUSED;
  return {
    id: String(boost._id),
    boutiqueId: String(boost.boutiqueId),
    kind: boost.kind,
    kindLabel: BOOST_KIND_LABELS[boost.kind],
    ...(extra.promotion ? { promotion: extra.promotion } : {}),
    productBoutiqueIds: boost.productBoutiqueIds.map(String),
    offers: extra.offers ?? [],
    goal: boost.goal,
    audience: {
      mode: boost.audience.mode,
      communes: boost.audience.communes,
      villes: boost.audience.villes,
      customerTypes: boost.audience.customerTypes,
      interestFamilleIds: boost.audience.interestFamilleIds.map(String),
      relation: boost.audience.relation,
    },
    dailyBudget: boost.dailyBudget,
    reserved: boost.reserved,
    spent,
    remaining: live ? Math.max(0, boost.reserved - spent) : 0,
    refunded: boost.refunded,
    costPerVisit: boost.costPerVisit,
    costPerThousandViews: boost.costPerThousandViews,
    startDate: boost.startDate,
    endDate: boost.endDate,
    status: boost.status,
    statusLabel: BOOST_STATUS_LABELS[boost.status],
    stopReason: boost.stopReason,
    endedAt: boost.endedAt,
    totals: {
      ...totals,
      spent: Math.round(totals.spent),
      visitRate: totals.impressions > 0 ? Math.round((totals.visits / totals.impressions) * 1000) / 10 : 0,
      costPerSale: totals.orders > 0 ? Math.round(totals.spent / totals.orders) : null,
    },
    ...(extra.daily ? { daily: extra.daily.map((row) => ({ ...row, spent: Math.round(row.spent) })) } : {}),
    availableActions:
      boost.status === BoostStatus.ACTIVE ? ["pause", "stop"] : boost.status === BoostStatus.PAUSED ? ["resume", "stop"] : [],
    createdAt: boost.createdAt,
  };
};
