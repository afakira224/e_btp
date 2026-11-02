import type { StatusTone } from "../../order";

// ─────────────────────────────────────────────
//  Support — miroir de SupportTicketDto, SupportMessageDto et SanctionDto
//  (Back/src/shared/interfaces/Support.interfaces.ts) et des règles de
//  Back/src/shared/helpers/support.workflow.ts.
//
//  Une demande attend toujours quelqu'un — la boutique, le demandeur ou
//  l'administration — avant une échéance. `availableActions` est calculé par
//  le serveur pour CE lecteur : l'écran n'affiche que ces boutons.
// ─────────────────────────────────────────────

export const SupportTicketType = {
  ORDER_PROBLEM: "order_problem",
  RETURN: "return",
  LISTING_REPORT: "listing_report",
  SHOP_REPORT: "shop_report",
  REVIEW_REPORT: "review_report",
  CUSTOMER_REPORT: "customer_report",
  GENERAL_QUESTION: "general_question",
  SANCTION_APPEAL: "sanction_appeal",
} as const;
export type SupportTicketType = (typeof SupportTicketType)[keyof typeof SupportTicketType];

export const SupportTicketStatus = {
  AWAITING_SHOP: "awaiting_shop",
  AWAITING_REQUESTER: "awaiting_requester",
  AWAITING_ADMIN: "awaiting_admin",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;
export type SupportTicketStatus = (typeof SupportTicketStatus)[keyof typeof SupportTicketStatus];

export const SupportParty = {
  REQUESTER: "requester",
  SHOP: "shop",
  ADMIN: "admin",
  SYSTEM: "system",
} as const;
export type SupportParty = (typeof SupportParty)[keyof typeof SupportParty];

export type SupportPriority = "urgent" | "normal" | "low";

export const SupportAction = {
  PROPOSE: "propose",
  ACCEPT: "accept",
  ESCALATE: "escalate",
  RESOLVE: "resolve",
  APPEAL: "appeal",
  CLOSE: "close",
  REOPEN: "reopen",
  ASSIGN: "assign",
  RATE: "rate",
} as const;
export type SupportAction = (typeof SupportAction)[keyof typeof SupportAction];

export type SupportOutcome = "upheld" | "rejected" | "answered" | "agreed" | "withdrawn" | "expired";

export const SUPPORT_TYPE_LABELS: Record<SupportTicketType, string> = {
  order_problem: "Problème de commande",
  return: "Retour",
  listing_report: "Signalement d'annonce",
  shop_report: "Signalement de boutique",
  review_report: "Signalement d'avis",
  customer_report: "Signalement de client",
  general_question: "Question",
  sanction_appeal: "Contestation d'une mesure",
};

export const SUPPORT_REASONS: Record<SupportTicketType, Readonly<Record<string, string>>> = {
  order_problem: {
    delay: "Retard",
    not_received: "Colis non reçu",
    shop_unreachable: "Boutique injoignable",
    refund_not_received: "Remboursement non reçu",
    other: "Autre",
  },
  return: {
    not_as_described: "Produit non conforme",
    damaged: "Produit abîmé",
    incomplete: "Commande incomplète",
    not_received: "Commande non reçue",
  },
  listing_report: {
    counterfeit: "Contrefaçon",
    prohibited: "Produit interdit ou dangereux",
    misleading: "Description trompeuse",
    abusive_price: "Prix abusif",
    stolen_photos: "Photos d'un autre vendeur",
    other: "Autre",
  },
  shop_report: {
    scam: "Arnaque",
    off_platform_payment: "Paiement demandé hors plateforme",
    insulting: "Propos insultants",
    fake_address: "Fausse adresse",
    other: "Autre",
  },
  review_report: {
    insulting: "Injure",
    fake: "Faux avis",
    off_topic: "Hors sujet",
    personal_data: "Données personnelles",
    other: "Autre",
  },
  customer_report: {
    repeated_absence: "Absences répétées",
    code_fraud: "Fraude au code de remise",
    threats: "Menaces",
    return_abuse: "Retours abusifs",
    other: "Autre",
  },
  general_question: {
    account: "Mon compte",
    payment: "Paiement",
    usage: "Utilisation du site",
    shop_opening: "Ouverture de boutique",
    other: "Autre",
  },
  sanction_appeal: { appeal: "Contestation d'une mesure" },
};

/** Ce que chaque type demande de préciser, et à qui il s'adresse. */
export const SUPPORT_TYPE_INTROS: Record<SupportTicketType, string> = {
  order_problem: "La boutique a 48 heures pour vous répondre. Sans réponse ou sans accord, l'administration tranche.",
  return: "Le retour se demande depuis la commande livrée, dans les 7 jours.",
  listing_report: "L'équipe examine l'annonce. La boutique ne saura pas qui l'a signalée.",
  shop_report: "L'équipe examine la boutique. Elle ne saura pas qui l'a signalée.",
  review_report: "L'équipe examine l'avis. Son auteur ne saura pas qui l'a signalé.",
  customer_report: "L'équipe examine le comportement du client. Il ne saura pas qui l'a signalé.",
  general_question: "L'équipe de la plateforme vous répond sous 24 heures.",
  sanction_appeal: "Un autre membre de l'équipe réexamine la mesure.",
};

export const PROPOSAL_KINDS = {
  new_date: "Nouvelle date de livraison",
  redelivery: "Nouvelle livraison",
  refund: "Remboursement",
  replacement: "Échange",
  explanation: "Explication",
} as const;
export type ProposalKind = keyof typeof PROPOSAL_KINDS;

export const RESOLVE_OUTCOMES: Record<"upheld" | "rejected" | "answered", { label: string; hint: string }> = {
  upheld: { label: "En faveur du demandeur", hint: "La demande est fondée." },
  rejected: { label: "Rejetée", hint: "La demande n'est pas fondée." },
  answered: { label: "Question traitée", hint: "Une réponse suffit, sans gagnant ni perdant." },
};

export const SUPPORT_STATUS_TONES: Record<SupportTicketStatus, StatusTone> = {
  awaiting_shop: "warning",
  awaiting_requester: "warning",
  awaiting_admin: "progress",
  resolved: "success",
  closed: "neutral",
};

export const PRIORITY_LABELS: Record<SupportPriority, string> = {
  urgent: "Urgente",
  normal: "Normale",
  low: "Basse",
};

/** Une demande ouvre-t-elle un échange avec une boutique ? */
export const shopIsParty = (type: SupportTicketType): boolean =>
  type === SupportTicketType.ORDER_PROBLEM || type === SupportTicketType.RETURN;

export const isOpenStatus = (status: SupportTicketStatus): boolean =>
  status !== SupportTicketStatus.RESOLVED && status !== SupportTicketStatus.CLOSED;

// ── Formes ──────────────────────────────────
export interface SupportAttachment {
  url: string;
  name: string;
  mimetype: string;
  size: number;
}

export interface SupportMessage {
  id: string;
  author: { party: SupportParty; name: string };
  visibility: "public" | "internal";
  kind: "message" | "proposal" | "decision" | "event";
  body: string;
  attachments: SupportAttachment[];
  containsContact: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  number: string;
  type: SupportTicketType;
  typeLabel: string;
  reason: string;
  reasonLabel: string;
  subject: string;
  status: SupportTicketStatus;
  statusLabel: string;
  priority: SupportPriority;
  viewer: SupportParty;
  waitingOn: SupportParty | null;
  requester: { name: string; accountType: string };
  target: { kind: string; id: string; label: string } | null;
  boutiqueId: string | null;
  requesterShopId: string | null;
  orderId: string | null;
  escalatedAt: string | null;
  proposal: { kind: string; kindLabel: string; details: string; status: "pending" | "accepted" | "declined"; at: string } | null;
  resolution: { outcome: SupportOutcome; outcomeLabel: string; note?: string | undefined; by: string; at: string } | null;
  appeal: { by: string; reason: string; at: string } | null;
  satisfaction: { rating: number; comment?: string | undefined } | null;
  assigneeId?: string | null | undefined;
  deadlineAt: string | null;
  availableActions: SupportAction[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  messages?: SupportMessage[] | undefined;
  /** Administration seulement : ce qui pèse déjà sur la cible. */
  dossier?: SupportDossier | undefined;
  /** Le message envoyé contenait des coordonnées. */
  warning?: string | undefined;
}

// ── Sanctions ───────────────────────────────
export const SanctionType = {
  HIDE: "hide",
  WARNING: "warning",
  SUSPENSION: "suspension",
  BLOCK: "block",
} as const;
export type SanctionType = (typeof SanctionType)[keyof typeof SanctionType];

export type SanctionTargetKind = "offer" | "review" | "shop" | "user";

export const SANCTION_LABELS: Record<SanctionType, string> = {
  hide: "Masquage",
  warning: "Avertissement",
  suspension: "Suspension",
  block: "Blocage",
};

/** Quelle mesure vise quoi. */
export const SANCTION_TARGETS: Record<SanctionType, readonly SanctionTargetKind[]> = {
  hide: ["offer", "review"],
  warning: ["shop", "user"],
  suspension: ["shop"],
  block: ["user"],
};

export const SANCTION_TARGET_LABELS: Record<SanctionTargetKind, string> = {
  offer: "Annonce",
  review: "Avis",
  shop: "Boutique",
  user: "Compte",
};

export const SUSPENSION_DAYS = [7, 15, 30] as const;

export interface Sanction {
  id: string;
  type: SanctionType;
  target: { kind: SanctionTargetKind; id: string; label: string };
  reason: string;
  ticketId: string | null;
  startsAt: string;
  endsAt: string | null;
  provisional: boolean;
  state: "active" | "ended" | "lifted";
  liftRequestedAt: string | null;
  liftedAt: string | null;
  liftReason: string | null;
  createdAt: string;
}

export interface SupportDossier {
  tickets: {
    id: string;
    number: string;
    type: SupportTicketType;
    reason: string;
    status: SupportTicketStatus;
    outcome: SupportOutcome | null;
    createdAt: string;
  }[];
  sanctions: Sanction[];
  suggestion: {
    shop?: { type: SanctionType; days?: number | undefined } | undefined;
    user?: { type: SanctionType; days?: number | undefined } | undefined;
  };
}

export type SupportScope = "mine" | "shop" | "admin";

export const SUPPORT_TABS: Record<SupportScope, Record<string, string>> = {
  mine: { open: "En cours", done: "Terminées" },
  shop: { todo: "À traiter", waiting: "Chez le client", admin: "Chez l'administration", done: "Terminées" },
  admin: { urgent: "Urgentes", todo: "À traiter", reports: "Signalements", waiting: "En attente", done: "Terminées" },
};
