import {
  SupportOutcome,
  SupportParty,
  SupportPriority,
  SupportTicketStatus,
  SupportTicketType,
  type ISupportTicket,
} from "../../models/supportTicket.model.js";
import { SanctionType } from "../../models/sanction.model.js";

// ─────────────────────────────────────────────
//  Support — les règles, sans accès à la base.
//
//  Qui peut ouvrir quoi, avec quels motifs ; qui doit agir dans chaque statut
//  et avant quand ; quelles actions chacun peut lancer ; ce qui se passe à
//  l'échéance. shared/services/support.service.ts applique ces règles.
//  Le document de conception : « Gestion du support ».
// ─────────────────────────────────────────────

const S = SupportTicketStatus;
const T = SupportTicketType;
const { REQUESTER, SHOP, ADMIN, SYSTEM } = SupportParty;

// ── Motifs ──────────────────────────────────
export const SUPPORT_REASONS: Record<SupportTicketType, Readonly<Record<string, string>>> = {
  [T.ORDER_PROBLEM]: {
    delay: "Retard",
    not_received: "Colis non reçu",
    shop_unreachable: "Boutique injoignable",
    refund_not_received: "Remboursement non reçu",
    other: "Autre",
  },
  // Les motifs d'un retour sont ceux de la sous-commande (RETURN_REASONS).
  [T.RETURN]: {
    not_as_described: "Produit non conforme",
    damaged: "Produit abîmé",
    incomplete: "Commande incomplète",
    not_received: "Commande non reçue",
  },
  [T.LISTING_REPORT]: {
    counterfeit: "Contrefaçon",
    prohibited: "Produit interdit ou dangereux",
    misleading: "Description trompeuse",
    abusive_price: "Prix abusif",
    stolen_photos: "Photos d'un autre vendeur",
    other: "Autre",
  },
  [T.SHOP_REPORT]: {
    scam: "Arnaque",
    off_platform_payment: "Paiement demandé hors plateforme",
    insulting: "Propos insultants",
    fake_address: "Fausse adresse",
    other: "Autre",
  },
  [T.REVIEW_REPORT]: {
    insulting: "Injure",
    fake: "Faux avis",
    off_topic: "Hors sujet",
    personal_data: "Données personnelles",
    other: "Autre",
  },
  [T.CUSTOMER_REPORT]: {
    repeated_absence: "Absences répétées",
    code_fraud: "Fraude au code de remise",
    threats: "Menaces",
    return_abuse: "Retours abusifs",
    other: "Autre",
  },
  [T.GENERAL_QUESTION]: {
    account: "Mon compte",
    payment: "Paiement",
    usage: "Utilisation du site",
    shop_opening: "Ouverture de boutique",
    other: "Autre",
  },
  [T.SANCTION_APPEAL]: {
    appeal: "Contestation d'une mesure",
  },
};

export const SUPPORT_TYPE_LABELS: Record<SupportTicketType, string> = {
  [T.ORDER_PROBLEM]: "Problème de commande",
  [T.RETURN]: "Retour",
  [T.LISTING_REPORT]: "Signalement d'annonce",
  [T.SHOP_REPORT]: "Signalement de boutique",
  [T.REVIEW_REPORT]: "Signalement d'avis",
  [T.CUSTOMER_REPORT]: "Signalement de client",
  [T.GENERAL_QUESTION]: "Question",
  [T.SANCTION_APPEAL]: "Contestation d'une mesure",
};

export const reasonLabel = (type: SupportTicketType, reason: string): string =>
  SUPPORT_REASONS[type]?.[reason] ?? reason;

/** Types qu'une personne peut ouvrir directement (le retour naît de la sous-commande). */
export const OPENABLE_TYPES: readonly SupportTicketType[] = [
  T.ORDER_PROBLEM,
  T.LISTING_REPORT,
  T.SHOP_REPORT,
  T.REVIEW_REPORT,
  T.CUSTOMER_REPORT,
  T.GENERAL_QUESTION,
  T.SANCTION_APPEAL,
];

/** Signalements : adressés à l'administration, invisibles de la cible. */
export const REPORT_TYPES: readonly SupportTicketType[] = [
  T.LISTING_REPORT,
  T.SHOP_REPORT,
  T.REVIEW_REPORT,
  T.CUSTOMER_REPORT,
];

/** Demandes où la boutique est partie : elle lit et répond. */
export const SHOP_PARTY_TYPES: readonly SupportTicketType[] = [T.ORDER_PROBLEM, T.RETURN];

export const isReport = (type: SupportTicketType): boolean => REPORT_TYPES.includes(type);
export const shopIsParty = (type: SupportTicketType): boolean => SHOP_PARTY_TYPES.includes(type);

/** Sécurité ou fraude : traité avant tout le reste. */
export const URGENT_REASONS: readonly string[] = [
  "prohibited",
  "counterfeit",
  "scam",
  "off_platform_payment",
  "threats",
  "code_fraud",
];

/** Masquage provisoire automatique d'une annonce : motifs, seuil et fenêtre. */
export const AUTO_HIDE = {
  reasons: ["counterfeit", "prohibited"] as readonly string[],
  reporters: 3,
  windowMs: 7 * 24 * 60 * 60 * 1000,
} as const;

/** Un auteur dont 5 signalements sont classés sans suite en 30 jours passe en priorité basse. */
export const REPORT_ABUSE = { rejected: 5, windowMs: 30 * 24 * 60 * 60 * 1000 } as const;

/** Un problème de commande s'ouvre jusqu'à 30 jours après la livraison. */
export const ORDER_PROBLEM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const priorityFor = (reason: string, abusiveReporter: boolean): SupportPriority => {
  if (URGENT_REASONS.includes(reason)) return SupportPriority.URGENT;
  return abusiveReporter ? SupportPriority.LOW : SupportPriority.NORMAL;
};

/** Premier statut : la boutique d'abord pour une commande, l'administration sinon. */
export const initialStatus = (type: SupportTicketType): SupportTicketStatus =>
  shopIsParty(type) ? S.AWAITING_SHOP : S.AWAITING_ADMIN;

// ── Délais ──────────────────────────────────
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const SUPPORT_DEADLINES = {
  /** La boutique : première réponse sous 48 h, rappel à 24 h, puis escalade. */
  shop: 48 * HOUR,
  shopReminder: 24 * HOUR,
  /** Le demandeur : 7 jours, rappel à 3 jours, puis fermeture. */
  requester: 7 * DAY,
  requesterReminder: 3 * DAY,
  /** L'administration : 24 h pour répondre, 72 h pour trancher ; 4 h pour une urgence. */
  adminReply: 24 * HOUR,
  adminDecision: 72 * HOUR,
  urgentReply: 4 * HOUR,
  /** Après une décision : 7 jours pour un recours, puis fermeture. */
  appeal: 7 * DAY,
  /** Une demande fermée se rouvre 14 jours. */
  reopen: 14 * DAY,
} as const;

export interface SupportSchedule {
  deadlineAt: Date | null;
  reminderAt: Date | null;
}

/**
 * Échéance et rappel à l'entrée dans un statut. Un retour suit les délais de
 * sa sous-commande (48 h pour la boutique, puis litige) : pas de double horloge.
 */
export const supportScheduleFor = (
  ticket: Pick<ISupportTicket, "type" | "priority">,
  status: SupportTicketStatus,
  now: Date
): SupportSchedule => {
  const at = (ms: number) => new Date(now.getTime() + ms);
  if (ticket.type === T.RETURN && status !== S.RESOLVED) return { deadlineAt: null, reminderAt: null };
  switch (status) {
    case S.AWAITING_SHOP:
      return { deadlineAt: at(SUPPORT_DEADLINES.shop), reminderAt: at(SUPPORT_DEADLINES.shopReminder) };
    case S.AWAITING_REQUESTER:
      return { deadlineAt: at(SUPPORT_DEADLINES.requester), reminderAt: at(SUPPORT_DEADLINES.requesterReminder) };
    case S.AWAITING_ADMIN:
      return {
        deadlineAt: at(SUPPORT_DEADLINES.adminDecision),
        reminderAt: at(ticket.priority === SupportPriority.URGENT ? SUPPORT_DEADLINES.urgentReply : SUPPORT_DEADLINES.adminReply),
      };
    case S.RESOLVED:
      return { deadlineAt: at(SUPPORT_DEADLINES.appeal), reminderAt: null };
    default:
      return { deadlineAt: null, reminderAt: null };
  }
};

/** Ce que la plateforme fait à l'échéance d'un statut. */
export type SupportAutoStep = "escalate" | "back_to_admin" | "close_expired" | "close_final" | "alert";

export const autoStepFor = (ticket: Pick<ISupportTicket, "status" | "escalatedAt">): SupportAutoStep | null => {
  switch (ticket.status) {
    // Une demande déjà escaladée où l'administration attendait une pièce :
    // sans réponse, elle lui revient.
    case S.AWAITING_SHOP:
      return ticket.escalatedAt ? "back_to_admin" : "escalate";
    case S.AWAITING_REQUESTER:
      return ticket.escalatedAt ? "back_to_admin" : "close_expired";
    case S.AWAITING_ADMIN:
      return "alert";
    case S.RESOLVED:
      return "close_final";
    default:
      return null;
  }
};

// ── Actions ─────────────────────────────────
export enum SupportAction {
  PROPOSE = "propose",   // la boutique propose une solution
  ACCEPT = "accept",     // le demandeur l'accepte
  ESCALATE = "escalate", // l'une ou l'autre partie demande l'arbitrage
  RESOLVE = "resolve",   // l'administration tranche
  APPEAL = "appeal",     // recours, 7 jours après la décision
  CLOSE = "close",       // le demandeur retire sa demande ; l'administration la classe
  REOPEN = "reopen",     // le demandeur la rouvre, 14 jours après la fermeture
  ASSIGN = "assign",     // l'administration la prend en charge
  RATE = "rate",         // le demandeur note la réponse
}

export const SUPPORT_ACTIONS = Object.values(SupportAction);

export const isSupportAction = (value: unknown): value is SupportAction =>
  typeof value === "string" && (SUPPORT_ACTIONS as string[]).includes(value);

export const PROPOSAL_KINDS = {
  new_date: "Nouvelle date de livraison",
  redelivery: "Nouvelle livraison",
  refund: "Remboursement",
  replacement: "Échange",
  explanation: "Explication",
} as const;

export const RESOLVE_OUTCOMES: readonly SupportOutcome[] = [
  SupportOutcome.UPHELD,
  SupportOutcome.REJECTED,
  SupportOutcome.ANSWERED,
];

export const OUTCOME_LABELS: Record<SupportOutcome, string> = {
  [SupportOutcome.UPHELD]: "Donnée en faveur du demandeur",
  [SupportOutcome.REJECTED]: "Rejetée",
  [SupportOutcome.ANSWERED]: "Question traitée",
  [SupportOutcome.AGREED]: "Solution acceptée",
  [SupportOutcome.WITHDRAWN]: "Retirée par le demandeur",
  [SupportOutcome.EXPIRED]: "Fermée faute de réponse",
};

export interface SupportActionInput {
  kind?: string | undefined;
  details?: string | undefined;
  outcome?: SupportOutcome | undefined;
  note?: string | undefined;
  reason?: string | undefined;
  rating?: number | undefined;
  comment?: string | undefined;
  assignee?: string | undefined;
}

type Ticket = Pick<
  ISupportTicket,
  "type" | "status" | "escalatedAt" | "proposal" | "resolution" | "appeal" | "resolvedAt" | "closedAt" | "reopenedAt" | "satisfaction"
>;

const OPEN: readonly SupportTicketStatus[] = [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN];

const elapsed = (from: Date | null | undefined, now: Date) => (from ? now.getTime() - from.getTime() : Infinity);

/**
 * Message qui interdit l'action, ou null si elle est permise. `parties` =
 * les rôles de la personne sur CETTE demande.
 */
export const checkSupportAction = (
  action: SupportAction,
  parties: readonly SupportParty[],
  ticket: Ticket,
  input: SupportActionInput,
  now: Date
): string | null => {
  const is = (party: SupportParty) => parties.includes(party);
  const managedByOrder = ticket.type === T.RETURN;

  switch (action) {
    case SupportAction.PROPOSE:
      if (!is(SHOP)) return "Seule la boutique concernée propose une solution.";
      if (ticket.type !== T.ORDER_PROBLEM) return "Une solution se propose sur un problème de commande.";
      if (ticket.escalatedAt) return "L'administration a repris la demande : c'est elle qui tranche.";
      if (ticket.status !== S.AWAITING_SHOP && ticket.status !== S.AWAITING_REQUESTER) return "Cette demande n'attend plus de proposition.";
      if (!input.kind || !(input.kind in PROPOSAL_KINDS)) {
        return `Type de solution invalide. Valeurs acceptées : ${Object.keys(PROPOSAL_KINDS).join(", ")}.`;
      }
      if (!input.details?.trim()) return "Décrivez la solution proposée.";
      return null;
    case SupportAction.ACCEPT:
      if (!is(REQUESTER)) return "Seul le demandeur accepte une proposition.";
      if (ticket.status !== S.AWAITING_REQUESTER || ticket.proposal?.status !== "pending") {
        return "Aucune proposition n'attend votre réponse.";
      }
      return null;
    case SupportAction.ESCALATE:
      if (!is(REQUESTER) && !is(SHOP)) return "Seules les parties demandent l'arbitrage.";
      if (ticket.type !== T.ORDER_PROBLEM) {
        return managedByOrder
          ? "Un retour passe à l'administration quand la boutique le refuse ou ne répond pas."
          : "Cette demande est déjà traitée par l'administration.";
      }
      if (ticket.escalatedAt) return "L'administration examine déjà la demande.";
      if (!OPEN.includes(ticket.status)) return "Cette demande est terminée.";
      // Le demandeur laisse d'abord sa chance à la boutique : l'escalade
      // automatique s'en charge si elle ne répond pas.
      if (is(REQUESTER) && !is(SHOP) && ticket.status === S.AWAITING_SHOP) {
        return "La boutique a 48 heures pour répondre ; sans réponse, l'administration est saisie d'office.";
      }
      return null;
    case SupportAction.RESOLVE:
      if (!is(ADMIN)) return "Seule l'administration tranche une demande.";
      if (managedByOrder) return "Un retour se tranche depuis la commande : la décision rembourse le client.";
      if (!OPEN.includes(ticket.status)) return "Cette demande est déjà tranchée.";
      if (!input.outcome || !RESOLVE_OUTCOMES.includes(input.outcome)) {
        return `Décision invalide. Valeurs acceptées : ${RESOLVE_OUTCOMES.join(", ")}.`;
      }
      if (!input.note?.trim()) return "Motivez la décision : les parties la liront.";
      return null;
    case SupportAction.APPEAL:
      if (!is(REQUESTER) && !(is(SHOP) && shopIsParty(ticket.type))) return "Seules les parties forment un recours.";
      if (managedByOrder || ticket.type === T.GENERAL_QUESTION || ticket.type === T.SANCTION_APPEAL) {
        return "Cette demande n'ouvre pas de recours.";
      }
      if (ticket.status !== S.RESOLVED) return "Un recours suit une décision.";
      if (ticket.appeal) return "Un seul recours par demande.";
      if (elapsed(ticket.resolvedAt, now) > SUPPORT_DEADLINES.appeal) return "Le délai de recours de 7 jours est dépassé.";
      if (!input.reason?.trim()) return "Expliquez pourquoi vous contestez la décision.";
      return null;
    case SupportAction.CLOSE:
      if (!is(REQUESTER) && !is(ADMIN)) return "Seul le demandeur ou l'administration ferme une demande.";
      if (ticket.status === S.CLOSED) return "Cette demande est déjà fermée.";
      if (managedByOrder && !is(ADMIN) && ticket.status !== S.RESOLVED) {
        return "Un retour en cours se règle depuis la commande.";
      }
      return null;
    case SupportAction.REOPEN:
      if (!is(REQUESTER)) return "Seul le demandeur rouvre sa demande.";
      if (ticket.status !== S.CLOSED) return "Seule une demande fermée se rouvre.";
      if (ticket.reopenedAt) return "Une demande ne se rouvre qu'une fois.";
      if (managedByOrder) return "Un retour fermé ne se rouvre pas : ouvrez un problème de commande.";
      if (elapsed(ticket.closedAt, now) > SUPPORT_DEADLINES.reopen) return "Le délai de 14 jours pour rouvrir est dépassé.";
      if (!input.reason?.trim()) return "Dites ce qui ne va toujours pas.";
      return null;
    case SupportAction.ASSIGN:
      if (!is(ADMIN)) return "Seule l'administration prend en charge une demande.";
      if (ticket.status === S.CLOSED) return "Cette demande est fermée.";
      return null;
    case SupportAction.RATE:
      if (!is(REQUESTER)) return "Seul le demandeur note la réponse.";
      if (ticket.status !== S.RESOLVED && ticket.status !== S.CLOSED) return "Une demande se note une fois terminée.";
      if (ticket.satisfaction) return "Vous avez déjà noté cette demande.";
      if (!Number.isInteger(input.rating) || (input.rating ?? 0) < 1 || (input.rating ?? 0) > 5) {
        return "La note va de 1 à 5.";
      }
      return null;
    default:
      return "Action inconnue.";
  }
};

/** Actions que ces rôles peuvent lancer maintenant : les boutons de l'écran. */
export const availableSupportActions = (
  parties: readonly SupportParty[],
  ticket: Ticket,
  now: Date
): SupportAction[] => {
  // Les conditions qui dépendent de la saisie (motif, note) sont satisfaites
  // par un brouillon : l'écran les redemande, le serveur les revérifie.
  const draft: SupportActionInput = {
    kind: "explanation",
    details: "…",
    outcome: SupportOutcome.UPHELD,
    note: "…",
    reason: "…",
    rating: 5,
  };
  return SUPPORT_ACTIONS.filter((action) => checkSupportAction(action, parties, ticket, draft, now) === null);
};

// ── Messages ────────────────────────────────

/** Statut après un message public de cette partie : la balle change de camp. */
export const statusAfterMessage = (
  ticket: Pick<ISupportTicket, "type" | "status" | "escalatedAt">,
  author: SupportParty,
  waitFor?: SupportParty
): SupportTicketStatus => {
  if (ticket.status === S.RESOLVED || ticket.status === S.CLOSED) return ticket.status;
  // Le statut d'un retour suit sa sous-commande.
  if (ticket.type === T.RETURN) return ticket.status;

  if (author === ADMIN) {
    if (waitFor === REQUESTER) return S.AWAITING_REQUESTER;
    if (waitFor === SHOP && shopIsParty(ticket.type)) return S.AWAITING_SHOP;
    return ticket.status;
  }
  // L'administration a demandé une pièce : la réponse lui revient.
  if (ticket.escalatedAt || !shopIsParty(ticket.type)) {
    const waited = author === REQUESTER ? S.AWAITING_REQUESTER : S.AWAITING_SHOP;
    return ticket.status === waited ? S.AWAITING_ADMIN : ticket.status;
  }
  if (author === SHOP && ticket.status === S.AWAITING_SHOP) return S.AWAITING_REQUESTER;
  if (author === REQUESTER && ticket.status === S.AWAITING_REQUESTER) return S.AWAITING_SHOP;
  return ticket.status;
};

/** Qui peut écrire dans une demande, et quoi. */
export const checkMessage = (
  parties: readonly SupportParty[],
  ticket: Pick<ISupportTicket, "status">,
  internal: boolean
): string | null => {
  if (parties.length === 0) return "Vous ne participez pas à cette demande.";
  if (internal && !parties.includes(ADMIN)) return "Seule l'administration écrit des notes internes.";
  if (ticket.status === S.CLOSED) return "Cette demande est fermée : rouvrez-la pour écrire.";
  return null;
};

/** Un numéro de téléphone, un email ou WhatsApp : une porte vers le paiement hors plateforme. */
const CONTACT_PATTERNS = [
  /(?:\+?224[\s.-]?)?\b6\d(?:[\s.-]?\d){7}\b/,
  /\b\d{2}(?:[\s.-]?\d{2}){3,4}\b/,
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /whats\s?app/i,
];

export const containsContact = (text: string): boolean => CONTACT_PATTERNS.some((pattern) => pattern.test(text));

/** Libellé du statut, du point de vue de qui le lit. */
export const statusLabelFor = (status: SupportTicketStatus, viewer: SupportParty): string => {
  switch (status) {
    case S.AWAITING_SHOP:
      return viewer === SHOP ? "À vous de répondre" : "Chez la boutique";
    case S.AWAITING_REQUESTER:
      return viewer === REQUESTER ? "À vous de répondre" : viewer === SHOP ? "Chez le client" : "Chez le demandeur";
    case S.AWAITING_ADMIN:
      return viewer === ADMIN ? "À traiter" : "Chez l'administration";
    case S.RESOLVED:
      return "Résolue";
    case S.CLOSED:
      return "Fermée";
    default:
      return status;
  }
};

// ── Onglets ─────────────────────────────────
export const SUPPORT_TABS = {
  requester: {
    open: [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN],
    done: [S.RESOLVED, S.CLOSED],
  },
  shop: {
    todo: [S.AWAITING_SHOP],
    waiting: [S.AWAITING_REQUESTER],
    admin: [S.AWAITING_ADMIN],
    done: [S.RESOLVED, S.CLOSED],
  },
  admin: {
    todo: [S.AWAITING_ADMIN],
    waiting: [S.AWAITING_SHOP, S.AWAITING_REQUESTER],
    done: [S.RESOLVED, S.CLOSED],
  },
} as const;

export type SupportScope = keyof typeof SUPPORT_TABS;

// ── Sanctions : gradation ───────────────────
export const SANCTION_HISTORY_MS = 365 * 24 * 60 * 60 * 1000;
export const SUSPENSION_DAYS: readonly number[] = [7, 15, 30];

/**
 * Mesure suggérée pour un nouveau manquement, d'après les mesures des 12
 * derniers mois. Une boutique : avertissement, 7 jours, 30 jours. Un client :
 * avertissement, puis blocage. La fraude avérée va droit au blocage : c'est
 * l'administration qui en juge, la suggestion ne fait que rappeler le barème.
 */
export const suggestSanction = (
  kind: "shop" | "user",
  previous: readonly { type: SanctionType; startsAt: Date }[],
  now: Date
): { type: SanctionType; days?: number } => {
  const recent = previous.filter(
    (sanction) =>
      now.getTime() - sanction.startsAt.getTime() <= SANCTION_HISTORY_MS &&
      (sanction.type === SanctionType.WARNING || sanction.type === SanctionType.SUSPENSION)
  ).length;
  if (kind === "user") return recent === 0 ? { type: SanctionType.WARNING } : { type: SanctionType.BLOCK };
  if (recent === 0) return { type: SanctionType.WARNING };
  if (recent === 1) return { type: SanctionType.SUSPENSION, days: 7 };
  return { type: SanctionType.SUSPENSION, days: 30 };
};

export const SYSTEM_PARTY = SYSTEM;
