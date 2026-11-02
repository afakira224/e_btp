import {
  PROPOSAL_KINDS,
  SupportAction,
  SupportParty,
  SupportTicketStatus,
  SupportTicketType,
  SUPPORT_REASONS,
  type SanctionType,
  type SupportOutcome,
  type SupportPriority,
} from "../../../entities/support";

// ─────────────────────────────────────────────
//  Support — les règles, copie de Back/src/shared/helpers/support.workflow.ts
//  (mêmes actions, mêmes délais, mêmes messages), comme shopOrderRules.ts
//  l'est du cycle des commandes. Le mode simulé tient lieu de serveur.
// ─────────────────────────────────────────────

const S = SupportTicketStatus;
const T = SupportTicketType;
const { REQUESTER, SHOP, ADMIN } = SupportParty;

export const reasonLabel = (type: SupportTicketType, reason: string): string => {
  const reasons = SUPPORT_REASONS[type];
  // Object.hasOwn, comme le back : « toString » n'est pas un motif.
  return reasons && Object.hasOwn(reasons, reason) ? reasons[reason]! : reason;
};

export const OPENABLE_TYPES: readonly SupportTicketType[] = [
  T.ORDER_PROBLEM,
  T.LISTING_REPORT,
  T.SHOP_REPORT,
  T.REVIEW_REPORT,
  T.CUSTOMER_REPORT,
  T.GENERAL_QUESTION,
  T.SANCTION_APPEAL,
];
export const REPORT_TYPES: readonly SupportTicketType[] = [T.LISTING_REPORT, T.SHOP_REPORT, T.REVIEW_REPORT, T.CUSTOMER_REPORT];
export const SHOP_PARTY_TYPES: readonly SupportTicketType[] = [T.ORDER_PROBLEM, T.RETURN];
export const isReport = (type: SupportTicketType) => REPORT_TYPES.includes(type);
export const shopIsParty = (type: SupportTicketType) => SHOP_PARTY_TYPES.includes(type);

export const URGENT_REASONS: readonly string[] = ["prohibited", "counterfeit", "scam", "off_platform_payment", "threats", "code_fraud"];
export const AUTO_HIDE = { reasons: ["counterfeit", "prohibited"] as readonly string[], reporters: 3, windowMs: 7 * 24 * 3600 * 1000 };
export const REPORT_ABUSE = { rejected: 5, windowMs: 30 * 24 * 3600 * 1000 };
export const ORDER_PROBLEM_WINDOW_MS = 30 * 24 * 3600 * 1000;

export const priorityFor = (reason: string, abusive: boolean): SupportPriority =>
  URGENT_REASONS.includes(reason) ? "urgent" : abusive ? "low" : "normal";

export const initialStatus = (type: SupportTicketType): SupportTicketStatus =>
  shopIsParty(type) ? S.AWAITING_SHOP : S.AWAITING_ADMIN;

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const SUPPORT_DEADLINES = {
  shop: 48 * HOUR,
  shopReminder: 24 * HOUR,
  requester: 7 * DAY,
  requesterReminder: 3 * DAY,
  adminReply: 24 * HOUR,
  adminDecision: 72 * HOUR,
  urgentReply: 4 * HOUR,
  appeal: 7 * DAY,
  reopen: 14 * DAY,
} as const;

export const supportScheduleFor = (
  ticket: { type: SupportTicketType; priority: SupportPriority },
  status: SupportTicketStatus,
  now: Date
): { deadlineAt: string | null; reminderAt: string | null } => {
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
  if (ticket.type === T.RETURN && status !== S.RESOLVED) return { deadlineAt: null, reminderAt: null };
  switch (status) {
    case S.AWAITING_SHOP:
      return { deadlineAt: at(SUPPORT_DEADLINES.shop), reminderAt: at(SUPPORT_DEADLINES.shopReminder) };
    case S.AWAITING_REQUESTER:
      return { deadlineAt: at(SUPPORT_DEADLINES.requester), reminderAt: at(SUPPORT_DEADLINES.requesterReminder) };
    case S.AWAITING_ADMIN:
      return {
        deadlineAt: at(SUPPORT_DEADLINES.adminDecision),
        reminderAt: at(ticket.priority === "urgent" ? SUPPORT_DEADLINES.urgentReply : SUPPORT_DEADLINES.adminReply),
      };
    case S.RESOLVED:
      return { deadlineAt: at(SUPPORT_DEADLINES.appeal), reminderAt: null };
    default:
      return { deadlineAt: null, reminderAt: null };
  }
};

export type SupportAutoStep = "escalate" | "back_to_admin" | "close_expired" | "close_final" | "alert";

export const autoStepFor = (ticket: { status: SupportTicketStatus; escalatedAt: string | null }): SupportAutoStep | null => {
  switch (ticket.status) {
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

export const RESOLVE_OUTCOME_KEYS: readonly SupportOutcome[] = ["upheld", "rejected", "answered"];

export const OUTCOME_LABELS: Record<SupportOutcome, string> = {
  upheld: "Donnée en faveur du demandeur",
  rejected: "Rejetée",
  answered: "Question traitée",
  agreed: "Solution acceptée",
  withdrawn: "Retirée par le demandeur",
  expired: "Fermée faute de réponse",
};

export interface RuleTicket {
  type: SupportTicketType;
  status: SupportTicketStatus;
  escalatedAt: string | null;
  proposal: { status: "pending" | "accepted" | "declined" } | null;
  appeal: unknown;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  satisfaction: unknown;
}

export interface SupportRuleInput {
  kind?: string | undefined;
  details?: string | undefined;
  outcome?: string | undefined;
  note?: string | undefined;
  reason?: string | undefined;
  rating?: number | undefined;
  comment?: string | undefined;
  assignee?: string | undefined;
}

const OPEN: readonly SupportTicketStatus[] = [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN];
const elapsed = (from: string | null, now: Date) => (from ? now.getTime() - new Date(from).getTime() : Infinity);

export const checkSupportAction = (
  action: SupportAction,
  parties: readonly SupportParty[],
  ticket: RuleTicket,
  input: SupportRuleInput,
  now: Date
): string | null => {
  const is = (party: SupportParty) => parties.includes(party);
  const managedByOrder = ticket.type === T.RETURN;
  switch (action) {
    case "propose":
      if (!is(SHOP)) return "Seule la boutique concernée propose une solution.";
      if (ticket.type !== T.ORDER_PROBLEM) return "Une solution se propose sur un problème de commande.";
      if (ticket.escalatedAt) return "L'administration a repris la demande : c'est elle qui tranche.";
      if (ticket.status !== S.AWAITING_SHOP && ticket.status !== S.AWAITING_REQUESTER) return "Cette demande n'attend plus de proposition.";
      if (!input.kind || !Object.hasOwn(PROPOSAL_KINDS, input.kind)) {
        return `Type de solution invalide. Valeurs acceptées : ${Object.keys(PROPOSAL_KINDS).join(", ")}.`;
      }
      if (!input.details?.trim()) return "Décrivez la solution proposée.";
      return null;
    case "accept":
      if (!is(REQUESTER)) return "Seul le demandeur accepte une proposition.";
      if (ticket.status !== S.AWAITING_REQUESTER || ticket.proposal?.status !== "pending") return "Aucune proposition n'attend votre réponse.";
      return null;
    case "escalate":
      if (!is(REQUESTER) && !is(SHOP)) return "Seules les parties demandent l'arbitrage.";
      if (ticket.type !== T.ORDER_PROBLEM) {
        return managedByOrder
          ? "Un retour passe à l'administration quand la boutique le refuse ou ne répond pas."
          : "Cette demande est déjà traitée par l'administration.";
      }
      if (ticket.escalatedAt) return "L'administration examine déjà la demande.";
      if (!OPEN.includes(ticket.status)) return "Cette demande est terminée.";
      if (is(REQUESTER) && !is(SHOP) && ticket.status === S.AWAITING_SHOP) {
        return "La boutique a 48 heures pour répondre ; sans réponse, l'administration est saisie d'office.";
      }
      return null;
    case "resolve":
      if (!is(ADMIN)) return "Seule l'administration tranche une demande.";
      if (managedByOrder) return "Un retour se tranche depuis la commande : la décision rembourse le client.";
      if (!OPEN.includes(ticket.status)) return "Cette demande est déjà tranchée.";
      if (!input.outcome || !RESOLVE_OUTCOME_KEYS.includes(input.outcome as SupportOutcome)) {
        return `Décision invalide. Valeurs acceptées : ${RESOLVE_OUTCOME_KEYS.join(", ")}.`;
      }
      if (!input.note?.trim()) return "Motivez la décision : les parties la liront.";
      return null;
    case "appeal":
      if (!is(REQUESTER) && !(is(SHOP) && shopIsParty(ticket.type))) return "Seules les parties forment un recours.";
      if (managedByOrder || ticket.type === T.GENERAL_QUESTION || ticket.type === T.SANCTION_APPEAL) return "Cette demande n'ouvre pas de recours.";
      if (ticket.status !== S.RESOLVED) return "Un recours suit une décision.";
      if (ticket.appeal) return "Un seul recours par demande.";
      if (elapsed(ticket.resolvedAt, now) > SUPPORT_DEADLINES.appeal) return "Le délai de recours de 7 jours est dépassé.";
      if (!input.reason?.trim()) return "Expliquez pourquoi vous contestez la décision.";
      return null;
    case "close":
      if (!is(REQUESTER) && !is(ADMIN)) return "Seul le demandeur ou l'administration ferme une demande.";
      if (ticket.status === S.CLOSED) return "Cette demande est déjà fermée.";
      if (managedByOrder && !is(ADMIN) && ticket.status !== S.RESOLVED) return "Un retour en cours se règle depuis la commande.";
      return null;
    case "reopen":
      if (!is(REQUESTER)) return "Seul le demandeur rouvre sa demande.";
      if (ticket.status !== S.CLOSED) return "Seule une demande fermée se rouvre.";
      if (ticket.reopenedAt) return "Une demande ne se rouvre qu'une fois.";
      if (ticket.appeal) return "Cette demande a fait l'objet d'un recours : la décision est définitive.";
      if (managedByOrder) return "Un retour fermé ne se rouvre pas : ouvrez un problème de commande.";
      if (elapsed(ticket.closedAt, now) > SUPPORT_DEADLINES.reopen) return "Le délai de 14 jours pour rouvrir est dépassé.";
      if (!input.reason?.trim()) return "Dites ce qui ne va toujours pas.";
      return null;
    case "assign":
      if (!is(ADMIN)) return "Seule l'administration prend en charge une demande.";
      if (ticket.status === S.CLOSED) return "Cette demande est fermée.";
      return null;
    case "rate":
      if (!is(REQUESTER)) return "Seul le demandeur note la réponse.";
      if (ticket.status !== S.RESOLVED && ticket.status !== S.CLOSED) return "Une demande se note une fois terminée.";
      if (ticket.satisfaction) return "Vous avez déjà noté cette demande.";
      if (!Number.isInteger(input.rating) || (input.rating ?? 0) < 1 || (input.rating ?? 0) > 5) return "La note va de 1 à 5.";
      return null;
    default:
      return "Action inconnue.";
  }
};

export const SUPPORT_ACTIONS = Object.values(SupportAction);

export const availableSupportActions = (parties: readonly SupportParty[], ticket: RuleTicket, now: Date): SupportAction[] => {
  const draft: SupportRuleInput = { kind: "explanation", details: "…", outcome: "upheld", note: "…", reason: "…", rating: 5 };
  return SUPPORT_ACTIONS.filter((action) => checkSupportAction(action, parties, ticket, draft, now) === null);
};

export const statusAfterMessage = (
  ticket: { type: SupportTicketType; status: SupportTicketStatus; escalatedAt: string | null },
  author: SupportParty,
  waitFor?: SupportParty
): SupportTicketStatus => {
  if (ticket.status === S.RESOLVED || ticket.status === S.CLOSED) return ticket.status;
  if (ticket.type === T.RETURN) return ticket.status;
  if (author === ADMIN) {
    if (waitFor === REQUESTER) return S.AWAITING_REQUESTER;
    if (waitFor === SHOP && shopIsParty(ticket.type)) return S.AWAITING_SHOP;
    return ticket.status;
  }
  if (ticket.escalatedAt || !shopIsParty(ticket.type)) {
    const waited = author === REQUESTER ? S.AWAITING_REQUESTER : S.AWAITING_SHOP;
    return ticket.status === waited ? S.AWAITING_ADMIN : ticket.status;
  }
  if (author === SHOP && ticket.status === S.AWAITING_SHOP) return S.AWAITING_REQUESTER;
  if (author === REQUESTER && ticket.status === S.AWAITING_REQUESTER) return S.AWAITING_SHOP;
  return ticket.status;
};

export const checkMessage = (parties: readonly SupportParty[], ticket: { status: SupportTicketStatus }, internal: boolean): string | null => {
  if (parties.length === 0) return "Vous ne participez pas à cette demande.";
  if (internal && !parties.includes(ADMIN)) return "Seule l'administration écrit des notes internes.";
  if (ticket.status === S.CLOSED) return "Cette demande est fermée : rouvrez-la pour écrire.";
  return null;
};

const CONTACT_PATTERNS = [
  /(?:\+?224[\s.-]?)?\b6\d(?:[\s.-]?\d){7}\b/,
  /\b\d{2}(?:[\s.-]?\d{2}){3,4}\b/,
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /whats\s?app/i,
];
/** Une date ressemble à un numéro : on la retire avant de chercher. */
const DATES = /\b(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{4})\b/g;

export const containsContact = (text: string): boolean => {
  const withoutDates = text.replace(DATES, " ");
  return CONTACT_PATTERNS.some((pattern) => pattern.test(withoutDates));
};

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

export const SANCTION_HISTORY_MS = 365 * DAY;

export const suggestSanction = (
  kind: "shop" | "user",
  previous: readonly { type: SanctionType; startsAt: string }[],
  now: Date
): { type: SanctionType; days?: number } => {
  const recent = previous.filter(
    (sanction) =>
      now.getTime() - new Date(sanction.startsAt).getTime() <= SANCTION_HISTORY_MS &&
      (sanction.type === "warning" || sanction.type === "suspension")
  ).length;
  if (kind === "user") return recent === 0 ? { type: "warning" } : { type: "block" };
  if (recent === 0) return { type: "warning" };
  if (recent === 1) return { type: "suspension", days: 7 };
  return { type: "suspension", days: 30 };
};
