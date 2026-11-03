import { describe, it, expect } from "vitest";
import {
  SupportOutcome,
  SupportParty,
  SupportPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "../../../../src/models/supportTicket.model.js";
import { SanctionType } from "../../../../src/models/sanction.model.js";
import { RETURN_REASONS } from "../../../../src/shared/helpers/shopOrder.workflow.js";
import {
  AUTO_HIDE,
  autoStepFor,
  availableSupportActions,
  checkMessage,
  checkSupportAction,
  containsContact,
  initialStatus,
  isReport,
  isSupportAction,
  OPENABLE_TYPES,
  priorityFor,
  reasonLabel,
  REPORT_ABUSE,
  shopIsParty,
  statusAfterMessage,
  statusLabelFor,
  suggestSanction,
  SUPPORT_ACTIONS,
  SUPPORT_DEADLINES,
  SUPPORT_REASONS,
  SUPPORT_TYPE_LABELS,
  SupportAction,
  supportScheduleFor,
  URGENT_REASONS,
  type SupportActionInput,
} from "../../../../src/shared/helpers/support.workflow.js";

const { REQUESTER, SHOP, ADMIN } = SupportParty;
const S = SupportTicketStatus;
const T = SupportTicketType;
const A = SupportAction;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const later = (ms: number) => new Date(NOW.getTime() + ms);

/** Demande minimale : seuls les champs que les règles lisent. */
const ticket = (over: Record<string, unknown> = {}) =>
  ({
    type: T.ORDER_PROBLEM,
    status: S.AWAITING_SHOP,
    priority: SupportPriority.NORMAL,
    escalatedAt: null,
    proposal: null,
    resolution: null,
    appeal: null,
    resolvedAt: null,
    closedAt: null,
    reopenedAt: null,
    satisfaction: null,
    ...over,
  }) as any;

const check = (
  action: SupportAction,
  parties: SupportParty[],
  over: Record<string, unknown> = {},
  input: SupportActionInput = {}
) => checkSupportAction(action, parties, ticket(over), input, NOW);

// ─────────────────────────────────────────────
describe("motifs et types", () => {
  it("propose des motifs pour chaque type de demande", () => {
    for (const type of Object.values(T)) {
      expect(Object.keys(SUPPORT_REASONS[type]).length).toBeGreaterThan(0);
      expect(SUPPORT_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("permet de signaler un faux prix barré sur une annonce", () => {
    expect(SUPPORT_REASONS[T.LISTING_REPORT]).toMatchObject({ fake_discount: "Faux prix barré" });
  });

  it("reprend pour un retour exactement les motifs de la sous-commande", () => {
    expect(SUPPORT_REASONS[T.RETURN]).toEqual(RETURN_REASONS);
  });

  it("traduit un motif connu et rend tel quel un motif inconnu", () => {
    expect(reasonLabel(T.LISTING_REPORT, "counterfeit")).toBe("Contrefaçon");
    expect(reasonLabel(T.SHOP_REPORT, "inconnu")).toBe("inconnu");
  });

  it("ne prend pas une clé héritée d'Object pour un motif", () => {
    expect(reasonLabel(T.LISTING_REPORT, "toString")).toBe("toString");
    expect(reasonLabel(T.LISTING_REPORT, "constructor")).toBe("constructor");
  });

  it("n'ouvre jamais directement un retour : il naît de la sous-commande", () => {
    expect(OPENABLE_TYPES).not.toContain(T.RETURN);
    expect(OPENABLE_TYPES).toHaveLength(Object.values(T).length - 1);
  });

  it("distingue les signalements des demandes où la boutique est partie", () => {
    expect([T.LISTING_REPORT, T.SHOP_REPORT, T.REVIEW_REPORT, T.CUSTOMER_REPORT].every(isReport)).toBe(true);
    expect(isReport(T.ORDER_PROBLEM)).toBe(false);
    expect(shopIsParty(T.ORDER_PROBLEM)).toBe(true);
    expect(shopIsParty(T.RETURN)).toBe(true);
    expect(shopIsParty(T.LISTING_REPORT)).toBe(false);
    expect(shopIsParty(T.GENERAL_QUESTION)).toBe(false);
  });

  it("masque provisoirement une annonce après 3 signalements graves en 7 jours", () => {
    expect(AUTO_HIDE).toEqual({ reasons: ["counterfeit", "prohibited"], reporters: 3, windowMs: 7 * DAY });
    expect(REPORT_ABUSE).toEqual({ rejected: 5, windowMs: 30 * DAY });
  });

  it("reconnaît les actions de support", () => {
    expect(isSupportAction("propose")).toBe(true);
    expect(isSupportAction("refund")).toBe(false);
    expect(isSupportAction(42)).toBe(false);
    expect(SUPPORT_ACTIONS).toEqual(Object.values(A));
  });
});

// ─────────────────────────────────────────────
describe("priorityFor", () => {
  it.each(URGENT_REASONS)("passe en urgence un motif de sécurité ou de fraude (%s)", (reason) => {
    expect(priorityFor(reason, false)).toBe(SupportPriority.URGENT);
  });

  it("garde l'urgence même pour un auteur de signalements abusifs", () => {
    expect(priorityFor("counterfeit", true)).toBe(SupportPriority.URGENT);
  });

  it("met en priorité basse un auteur abusif, normale sinon", () => {
    expect(priorityFor("misleading", true)).toBe(SupportPriority.LOW);
    expect(priorityFor("misleading", false)).toBe(SupportPriority.NORMAL);
  });
});

describe("initialStatus", () => {
  it("donne d'abord la main à la boutique pour une commande ou un retour", () => {
    expect(initialStatus(T.ORDER_PROBLEM)).toBe(S.AWAITING_SHOP);
    expect(initialStatus(T.RETURN)).toBe(S.AWAITING_SHOP);
  });

  it.each([T.LISTING_REPORT, T.SHOP_REPORT, T.REVIEW_REPORT, T.CUSTOMER_REPORT, T.GENERAL_QUESTION, T.SANCTION_APPEAL])(
    "adresse le reste à l'administration (%s)",
    (type) => {
      expect(initialStatus(type)).toBe(S.AWAITING_ADMIN);
    }
  );
});

// ─────────────────────────────────────────────
describe("supportScheduleFor", () => {
  const schedule = (status: SupportTicketStatus, over: Record<string, unknown> = {}) =>
    supportScheduleFor(ticket(over), status, NOW);

  it("laisse 48 heures à la boutique, rappel à 24 heures", () => {
    expect(schedule(S.AWAITING_SHOP)).toEqual({ deadlineAt: later(48 * HOUR), reminderAt: later(24 * HOUR) });
  });

  it("laisse 7 jours au demandeur, rappel à 3 jours", () => {
    expect(schedule(S.AWAITING_REQUESTER)).toEqual({ deadlineAt: later(7 * DAY), reminderAt: later(3 * DAY) });
  });

  it("laisse 72 heures à l'administration pour trancher, 24 heures pour répondre", () => {
    expect(schedule(S.AWAITING_ADMIN)).toEqual({ deadlineAt: later(72 * HOUR), reminderAt: later(24 * HOUR) });
  });

  it("ramène la première réponse à 4 heures pour une urgence", () => {
    expect(schedule(S.AWAITING_ADMIN, { priority: SupportPriority.URGENT }).reminderAt).toEqual(later(4 * HOUR));
  });

  it("ouvre 7 jours de recours après une décision, sans rappel", () => {
    expect(schedule(S.RESOLVED)).toEqual({ deadlineAt: later(SUPPORT_DEADLINES.appeal), reminderAt: null });
  });

  it("n'arme aucune échéance sur une demande fermée", () => {
    expect(schedule(S.CLOSED)).toEqual({ deadlineAt: null, reminderAt: null });
  });

  it("ne double pas les délais d'un retour : la sous-commande a les siens", () => {
    for (const status of [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN, S.CLOSED]) {
      expect(schedule(status, { type: T.RETURN })).toEqual({ deadlineAt: null, reminderAt: null });
    }
  });

  it("garde le délai de recours d'un retour tranché", () => {
    expect(schedule(S.RESOLVED, { type: T.RETURN }).deadlineAt).toEqual(later(7 * DAY));
  });
});

describe("autoStepFor", () => {
  it("escalade une demande que la boutique laisse sans réponse", () => {
    expect(autoStepFor(ticket({ status: S.AWAITING_SHOP }))).toBe("escalate");
  });

  it("rend à l'administration une demande escaladée où la pièce attendue n'arrive pas", () => {
    expect(autoStepFor(ticket({ status: S.AWAITING_SHOP, escalatedAt: ago(DAY) }))).toBe("back_to_admin");
    expect(autoStepFor(ticket({ status: S.AWAITING_REQUESTER, escalatedAt: ago(DAY) }))).toBe("back_to_admin");
  });

  it("ferme une demande dont le demandeur ne répond plus", () => {
    expect(autoStepFor(ticket({ status: S.AWAITING_REQUESTER }))).toBe("close_expired");
  });

  it("alerte quand l'administration dépasse son délai", () => {
    expect(autoStepFor(ticket({ status: S.AWAITING_ADMIN }))).toBe("alert");
  });

  it("ferme définitivement une décision sans recours", () => {
    expect(autoStepFor(ticket({ status: S.RESOLVED }))).toBe("close_final");
  });

  it("ne fait rien sur une demande fermée", () => {
    expect(autoStepFor(ticket({ status: S.CLOSED }))).toBeNull();
  });
});

// ─────────────────────────────────────────────
describe("checkSupportAction — proposer une solution", () => {
  const input = { kind: "refund", details: "Je vous rembourse la livraison." };

  it("réserve la proposition à la boutique", () => {
    expect(check(A.PROPOSE, [REQUESTER], {}, input)).toBe("Seule la boutique concernée propose une solution.");
    expect(check(A.PROPOSE, [SHOP], {}, input)).toBeNull();
  });

  it("ne propose que sur un problème de commande", () => {
    expect(check(A.PROPOSE, [SHOP], { type: T.RETURN }, input)).toBe(
      "Une solution se propose sur un problème de commande."
    );
  });

  it("refuse une proposition une fois l'administration saisie", () => {
    expect(check(A.PROPOSE, [SHOP], { escalatedAt: ago(HOUR) }, input)).toBe(
      "L'administration a repris la demande : c'est elle qui tranche."
    );
  });

  it("accepte une nouvelle proposition tant que le client n'a pas répondu", () => {
    expect(check(A.PROPOSE, [SHOP], { status: S.AWAITING_REQUESTER }, input)).toBeNull();
  });

  it("refuse une proposition sur une demande terminée", () => {
    expect(check(A.PROPOSE, [SHOP], { status: S.RESOLVED }, input)).toBe("Cette demande n'attend plus de proposition.");
  });

  it("exige un type de solution connu", () => {
    expect(check(A.PROPOSE, [SHOP], {}, { details: "x" })).toMatch(/^Type de solution invalide\. Valeurs acceptées : new_date/);
    expect(check(A.PROPOSE, [SHOP], {}, { kind: "cadeau", details: "x" })).toMatch(/^Type de solution invalide/);
    expect(check(A.PROPOSE, [SHOP], {}, { kind: "constructor", details: "x" })).toMatch(/^Type de solution invalide/);
    expect(check(A.PROPOSE, [SHOP], {}, { kind: "toString", details: "x" })).toMatch(/^Type de solution invalide/);
  });

  it("exige une description de la solution", () => {
    expect(check(A.PROPOSE, [SHOP], {}, { kind: "refund", details: "   " })).toBe("Décrivez la solution proposée.");
  });
});

describe("checkSupportAction — accepter", () => {
  const waiting = { status: S.AWAITING_REQUESTER, proposal: { status: "pending" } };

  it("réserve l'acceptation au demandeur", () => {
    expect(check(A.ACCEPT, [SHOP], waiting)).toBe("Seul le demandeur accepte une proposition.");
    expect(check(A.ACCEPT, [REQUESTER], waiting)).toBeNull();
  });

  it("exige une proposition en attente", () => {
    expect(check(A.ACCEPT, [REQUESTER], { status: S.AWAITING_REQUESTER })).toBe("Aucune proposition n'attend votre réponse.");
    expect(check(A.ACCEPT, [REQUESTER], { ...waiting, proposal: { status: "declined" } })).toBe(
      "Aucune proposition n'attend votre réponse."
    );
    expect(check(A.ACCEPT, [REQUESTER], { ...waiting, status: S.AWAITING_ADMIN })).toBe(
      "Aucune proposition n'attend votre réponse."
    );
  });
});

describe("checkSupportAction — demander l'arbitrage", () => {
  it("réserve l'arbitrage aux parties", () => {
    expect(check(A.ESCALATE, [ADMIN])).toBe("Seules les parties demandent l'arbitrage.");
  });

  it("laisse d'abord 48 heures à la boutique avant que le client ne saisisse l'administration", () => {
    expect(check(A.ESCALATE, [REQUESTER])).toBe(
      "La boutique a 48 heures pour répondre ; sans réponse, l'administration est saisie d'office."
    );
    expect(check(A.ESCALATE, [REQUESTER], { status: S.AWAITING_REQUESTER })).toBeNull();
  });

  it("permet à la boutique de demander l'arbitrage dès le départ", () => {
    expect(check(A.ESCALATE, [SHOP])).toBeNull();
  });

  it("renvoie un retour vers les actions de la commande", () => {
    expect(check(A.ESCALATE, [SHOP], { type: T.RETURN })).toBe(
      "Un retour passe à l'administration quand la boutique le refuse ou ne répond pas."
    );
  });

  it("refuse l'arbitrage d'une demande déjà traitée par l'administration", () => {
    expect(check(A.ESCALATE, [REQUESTER], { type: T.GENERAL_QUESTION, status: S.AWAITING_REQUESTER })).toBe(
      "Cette demande est déjà traitée par l'administration."
    );
  });

  it("refuse une seconde escalade et une demande terminée", () => {
    expect(check(A.ESCALATE, [SHOP], { escalatedAt: ago(HOUR) })).toBe("L'administration examine déjà la demande.");
    expect(check(A.ESCALATE, [SHOP], { status: S.RESOLVED })).toBe("Cette demande est terminée.");
  });
});

describe("checkSupportAction — trancher", () => {
  const decision = { outcome: SupportOutcome.UPHELD, note: "La boutique rembourse." };

  it("réserve la décision à l'administration", () => {
    expect(check(A.RESOLVE, [REQUESTER], { status: S.AWAITING_ADMIN }, decision)).toBe(
      "Seule l'administration tranche une demande."
    );
    expect(check(A.RESOLVE, [ADMIN], { status: S.AWAITING_ADMIN }, decision)).toBeNull();
  });

  it("tranche un retour depuis la commande, jamais depuis la demande", () => {
    expect(check(A.RESOLVE, [ADMIN], { type: T.RETURN, status: S.AWAITING_ADMIN }, decision)).toBe(
      "Un retour se tranche depuis la commande : la décision rembourse le client."
    );
  });

  it("refuse de trancher deux fois", () => {
    expect(check(A.RESOLVE, [ADMIN], { status: S.RESOLVED }, decision)).toBe("Cette demande est déjà tranchée.");
  });

  it("n'accepte que les décisions de l'administration", () => {
    expect(check(A.RESOLVE, [ADMIN], { status: S.AWAITING_ADMIN }, { ...decision, outcome: SupportOutcome.AGREED })).toBe(
      "Décision invalide. Valeurs acceptées : upheld, rejected, answered."
    );
  });

  it("exige une motivation", () => {
    expect(check(A.RESOLVE, [ADMIN], { status: S.AWAITING_ADMIN }, { outcome: SupportOutcome.REJECTED, note: " " })).toBe(
      "Motivez la décision : les parties la liront."
    );
  });
});

describe("checkSupportAction — recours", () => {
  const decided = { status: S.RESOLVED, resolvedAt: ago(2 * DAY) };
  const reason = { reason: "La boutique n'a jamais remboursé." };

  it("ouvre le recours au demandeur et à la boutique partie", () => {
    expect(check(A.APPEAL, [REQUESTER], decided, reason)).toBeNull();
    expect(check(A.APPEAL, [SHOP], decided, reason)).toBeNull();
    expect(check(A.APPEAL, [ADMIN], decided, reason)).toBe("Seules les parties forment un recours.");
  });

  it("refuse le recours de la boutique sur une demande où elle n'est pas partie", () => {
    expect(check(A.APPEAL, [SHOP], { ...decided, type: T.SHOP_REPORT }, reason)).toBe("Seules les parties forment un recours.");
  });

  it.each([T.RETURN, T.GENERAL_QUESTION, T.SANCTION_APPEAL])("n'ouvre pas de recours sur %s", (type) => {
    expect(check(A.APPEAL, [REQUESTER], { ...decided, type }, reason)).toBe("Cette demande n'ouvre pas de recours.");
  });

  it("exige une décision, un seul recours et le respect des 7 jours", () => {
    expect(check(A.APPEAL, [REQUESTER], { status: S.AWAITING_ADMIN }, reason)).toBe("Un recours suit une décision.");
    expect(check(A.APPEAL, [REQUESTER], { ...decided, appeal: { reason: "déjà" } }, reason)).toBe("Un seul recours par demande.");
    expect(check(A.APPEAL, [REQUESTER], { ...decided, resolvedAt: ago(7 * DAY + HOUR) }, reason)).toBe(
      "Le délai de recours de 7 jours est dépassé."
    );
    expect(check(A.APPEAL, [REQUESTER], { ...decided, resolvedAt: ago(7 * DAY) }, reason)).toBeNull();
  });

  it("exige un motif", () => {
    expect(check(A.APPEAL, [REQUESTER], decided, { reason: "" })).toBe("Expliquez pourquoi vous contestez la décision.");
  });
});

describe("checkSupportAction — fermer et rouvrir", () => {
  it("laisse fermer le demandeur et l'administration, pas la boutique", () => {
    expect(check(A.CLOSE, [REQUESTER])).toBeNull();
    expect(check(A.CLOSE, [ADMIN])).toBeNull();
    expect(check(A.CLOSE, [SHOP])).toBe("Seul le demandeur ou l'administration ferme une demande.");
  });

  it("refuse de fermer deux fois", () => {
    expect(check(A.CLOSE, [REQUESTER], { status: S.CLOSED })).toBe("Cette demande est déjà fermée.");
  });

  it("règle un retour en cours depuis la commande, sauf pour l'administration", () => {
    expect(check(A.CLOSE, [REQUESTER], { type: T.RETURN, status: S.AWAITING_SHOP })).toBe(
      "Un retour en cours se règle depuis la commande."
    );
    expect(check(A.CLOSE, [REQUESTER], { type: T.RETURN, status: S.RESOLVED })).toBeNull();
    expect(check(A.CLOSE, [ADMIN], { type: T.RETURN, status: S.AWAITING_ADMIN })).toBeNull();
  });

  const closed = { status: S.CLOSED, closedAt: ago(3 * DAY) };
  const why = { reason: "Le colis n'est toujours pas là." };

  it("laisse le demandeur rouvrir une fois, sous 14 jours, motif à l'appui", () => {
    expect(check(A.REOPEN, [REQUESTER], closed, why)).toBeNull();
    expect(check(A.REOPEN, [ADMIN], closed, why)).toBe("Seul le demandeur rouvre sa demande.");
    expect(check(A.REOPEN, [REQUESTER], { status: S.RESOLVED }, why)).toBe("Seule une demande fermée se rouvre.");
    expect(check(A.REOPEN, [REQUESTER], { ...closed, reopenedAt: ago(5 * DAY) }, why)).toBe(
      "Une demande ne se rouvre qu'une fois."
    );
    expect(check(A.REOPEN, [REQUESTER], { ...closed, closedAt: ago(15 * DAY) }, why)).toBe(
      "Le délai de 14 jours pour rouvrir est dépassé."
    );
    expect(check(A.REOPEN, [REQUESTER], closed, { reason: " " })).toBe("Dites ce qui ne va toujours pas.");
  });

  it("ne rouvre pas une demande dont le recours a été tranché", () => {
    expect(check(A.REOPEN, [REQUESTER], { ...closed, appeal: { reason: "Je conteste.", at: ago(DAY) } }, why)).toBe(
      "Cette demande a fait l'objet d'un recours : la décision est définitive."
    );
  });

  it("ne rouvre pas un retour fermé", () => {
    expect(check(A.REOPEN, [REQUESTER], { ...closed, type: T.RETURN }, why)).toBe(
      "Un retour fermé ne se rouvre pas : ouvrez un problème de commande."
    );
  });
});

describe("checkSupportAction — prise en charge et note", () => {
  it("réserve la prise en charge à l'administration, tant que la demande est ouverte", () => {
    expect(check(A.ASSIGN, [ADMIN])).toBeNull();
    expect(check(A.ASSIGN, [SHOP])).toBe("Seule l'administration prend en charge une demande.");
    expect(check(A.ASSIGN, [ADMIN], { status: S.CLOSED })).toBe("Cette demande est fermée.");
  });

  it("laisse le demandeur noter une fois une demande terminée", () => {
    expect(check(A.RATE, [REQUESTER], { status: S.RESOLVED }, { rating: 4 })).toBeNull();
    expect(check(A.RATE, [REQUESTER], { status: S.CLOSED }, { rating: 1 })).toBeNull();
    expect(check(A.RATE, [SHOP], { status: S.RESOLVED }, { rating: 4 })).toBe("Seul le demandeur note la réponse.");
    expect(check(A.RATE, [REQUESTER], { status: S.AWAITING_ADMIN }, { rating: 4 })).toBe(
      "Une demande se note une fois terminée."
    );
    expect(check(A.RATE, [REQUESTER], { status: S.RESOLVED, satisfaction: { rating: 5 } }, { rating: 4 })).toBe(
      "Vous avez déjà noté cette demande."
    );
  });

  it.each([0, 6, 3.5, undefined])("refuse la note %s", (rating) => {
    expect(check(A.RATE, [REQUESTER], { status: S.RESOLVED }, { rating })).toBe("La note va de 1 à 5.");
  });

  it("refuse une action inconnue", () => {
    expect(check("refund" as SupportAction, [ADMIN])).toBe("Action inconnue.");
  });
});

// ─────────────────────────────────────────────
describe("availableSupportActions — les boutons de l'écran", () => {
  const buttons = (parties: SupportParty[], over: Record<string, unknown> = {}) =>
    availableSupportActions(parties, ticket(over), NOW);

  it("propose à la boutique de répondre par une solution ou de demander l'arbitrage", () => {
    expect(buttons([SHOP])).toEqual([A.PROPOSE, A.ESCALATE]);
  });

  it("ne laisse au client que le retrait tant que la boutique a la main", () => {
    expect(buttons([REQUESTER])).toEqual([A.CLOSE]);
  });

  it("laisse le client accepter la proposition ou demander l'arbitrage", () => {
    expect(buttons([REQUESTER], { status: S.AWAITING_REQUESTER, proposal: { status: "pending" } })).toEqual([
      A.ACCEPT,
      A.ESCALATE,
      A.CLOSE,
    ]);
  });

  it("donne à l'administration de quoi trancher, classer et prendre en charge", () => {
    expect(buttons([ADMIN], { status: S.AWAITING_ADMIN, escalatedAt: ago(HOUR) })).toEqual([A.RESOLVE, A.CLOSE, A.ASSIGN]);
  });

  it("offre recours, fermeture et note après une décision", () => {
    expect(buttons([REQUESTER], { status: S.RESOLVED, resolvedAt: ago(DAY) })).toEqual([A.APPEAL, A.CLOSE, A.RATE]);
  });

  it("offre la réouverture et la note sur une demande fermée", () => {
    expect(buttons([REQUESTER], { status: S.CLOSED, closedAt: ago(DAY) })).toEqual([A.REOPEN, A.RATE]);
  });

  it("n'offre rien à la boutique sur un retour : il se règle depuis la commande", () => {
    expect(buttons([SHOP], { type: T.RETURN })).toEqual([]);
  });

  it("n'offre rien à qui ne participe pas", () => {
    expect(buttons([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────
describe("statusAfterMessage — la balle change de camp", () => {
  const after = (over: Record<string, unknown>, author: SupportParty, waitFor?: SupportParty) =>
    statusAfterMessage(ticket(over), author, waitFor);

  it("passe la main au client quand la boutique répond, et inversement", () => {
    expect(after({ status: S.AWAITING_SHOP }, SHOP)).toBe(S.AWAITING_REQUESTER);
    expect(after({ status: S.AWAITING_REQUESTER }, REQUESTER)).toBe(S.AWAITING_SHOP);
  });

  it("ne change rien quand la partie écrit hors de son tour", () => {
    expect(after({ status: S.AWAITING_SHOP }, REQUESTER)).toBe(S.AWAITING_SHOP);
    expect(after({ status: S.AWAITING_REQUESTER }, SHOP)).toBe(S.AWAITING_REQUESTER);
  });

  it("rend la main à l'administration quand la pièce qu'elle attendait arrive", () => {
    const escalated = { escalatedAt: ago(DAY) };
    expect(after({ ...escalated, status: S.AWAITING_REQUESTER }, REQUESTER)).toBe(S.AWAITING_ADMIN);
    expect(after({ ...escalated, status: S.AWAITING_SHOP }, SHOP)).toBe(S.AWAITING_ADMIN);
    expect(after({ ...escalated, status: S.AWAITING_SHOP }, REQUESTER)).toBe(S.AWAITING_SHOP);
  });

  it("fait de même pour une demande traitée par l'administration dès le départ", () => {
    expect(after({ type: T.GENERAL_QUESTION, status: S.AWAITING_REQUESTER }, REQUESTER)).toBe(S.AWAITING_ADMIN);
    expect(after({ type: T.GENERAL_QUESTION, status: S.AWAITING_ADMIN }, REQUESTER)).toBe(S.AWAITING_ADMIN);
  });

  it("laisse l'administration désigner qui doit répondre", () => {
    expect(after({ status: S.AWAITING_ADMIN }, ADMIN, REQUESTER)).toBe(S.AWAITING_REQUESTER);
    expect(after({ status: S.AWAITING_ADMIN }, ADMIN, SHOP)).toBe(S.AWAITING_SHOP);
    expect(after({ status: S.AWAITING_ADMIN }, ADMIN)).toBe(S.AWAITING_ADMIN);
  });

  it("n'attend jamais une boutique qui n'est pas partie", () => {
    expect(after({ type: T.SHOP_REPORT, status: S.AWAITING_ADMIN }, ADMIN, SHOP)).toBe(S.AWAITING_ADMIN);
  });

  it("ne bouge ni un retour, qui suit sa sous-commande, ni une demande terminée", () => {
    expect(after({ type: T.RETURN, status: S.AWAITING_SHOP }, SHOP)).toBe(S.AWAITING_SHOP);
    expect(after({ status: S.RESOLVED }, ADMIN, REQUESTER)).toBe(S.RESOLVED);
    expect(after({ status: S.CLOSED }, REQUESTER)).toBe(S.CLOSED);
  });
});

describe("checkMessage", () => {
  it("refuse qui ne participe pas", () => {
    expect(checkMessage([], ticket(), false)).toBe("Vous ne participez pas à cette demande.");
  });

  it("réserve les notes internes à l'administration", () => {
    expect(checkMessage([SHOP], ticket(), true)).toBe("Seule l'administration écrit des notes internes.");
    expect(checkMessage([ADMIN], ticket(), true)).toBeNull();
  });

  it("refuse d'écrire dans une demande fermée, même en note interne", () => {
    expect(checkMessage([REQUESTER], ticket({ status: S.CLOSED }), false)).toBe(
      "Cette demande est fermée : rouvrez-la pour écrire."
    );
    expect(checkMessage([ADMIN], ticket({ status: S.CLOSED }), true)).toBe(
      "Cette demande est fermée : rouvrez-la pour écrire."
    );
  });

  it("accepte le message d'une partie sur une demande ouverte ou résolue", () => {
    expect(checkMessage([REQUESTER], ticket(), false)).toBeNull();
    expect(checkMessage([SHOP], ticket({ status: S.RESOLVED }), false)).toBeNull();
  });
});

describe("containsContact", () => {
  it.each([
    "Appelez-moi au 622 12 34 56",
    "Mon numéro : +224 622123456",
    "Contact : 621.00.00.00",
    "Écrivez à vendeur.kaloum@gmail.com",
    "On se parle sur WhatsApp",
    "par whats app plutôt",
    "Le 25/10/2026, appelez le 622 12 34 56",
  ])("repère un moyen de contact : %s", (text) => {
    expect(containsContact(text)).toBe(true);
  });

  it.each([
    "Ma commande CMD-1767261600000-123456-1 n'est pas arrivée",
    "J'ai reçu 3 articles sur 4",
    "Demande SUP-000042",
    "Livré le 25/10/2026",
    "Livraison prévue le 2026-10-25",
    "Rendez-vous le 25.10.2026 à 9 h",
    "Commandé le 25-10-2026, reçu le 2026/10/28",
  ])("laisse passer un message ordinaire : %s", (text) => {
    expect(containsContact(text)).toBe(false);
  });
});

describe("statusLabelFor", () => {
  it("dit à chacun si c'est à lui de répondre", () => {
    expect(statusLabelFor(S.AWAITING_SHOP, SHOP)).toBe("À vous de répondre");
    expect(statusLabelFor(S.AWAITING_SHOP, REQUESTER)).toBe("Chez la boutique");
    expect(statusLabelFor(S.AWAITING_REQUESTER, REQUESTER)).toBe("À vous de répondre");
    expect(statusLabelFor(S.AWAITING_REQUESTER, SHOP)).toBe("Chez le client");
    expect(statusLabelFor(S.AWAITING_REQUESTER, ADMIN)).toBe("Chez le demandeur");
    expect(statusLabelFor(S.AWAITING_ADMIN, ADMIN)).toBe("À traiter");
    expect(statusLabelFor(S.AWAITING_ADMIN, REQUESTER)).toBe("Chez l'administration");
  });

  it("donne le même libellé à tous pour une demande terminée", () => {
    for (const viewer of [REQUESTER, SHOP, ADMIN]) {
      expect(statusLabelFor(S.RESOLVED, viewer)).toBe("Résolue");
      expect(statusLabelFor(S.CLOSED, viewer)).toBe("Fermée");
    }
  });

  it("rend tel quel un statut inconnu", () => {
    expect(statusLabelFor("archived" as SupportTicketStatus, ADMIN)).toBe("archived");
  });
});

// ─────────────────────────────────────────────
describe("suggestSanction — le barème", () => {
  const past = (type: SanctionType, daysAgo: number) => ({ type, startsAt: ago(daysAgo * DAY) });

  it("commence par un avertissement, pour une boutique comme pour un client", () => {
    expect(suggestSanction("shop", [], NOW)).toEqual({ type: SanctionType.WARNING });
    expect(suggestSanction("user", [], NOW)).toEqual({ type: SanctionType.WARNING });
  });

  it("suspend une boutique 7 jours au deuxième manquement, 30 jours ensuite", () => {
    expect(suggestSanction("shop", [past(SanctionType.WARNING, 30)], NOW)).toEqual({ type: SanctionType.SUSPENSION, days: 7 });
    expect(
      suggestSanction("shop", [past(SanctionType.WARNING, 90), past(SanctionType.SUSPENSION, 30)], NOW)
    ).toEqual({ type: SanctionType.SUSPENSION, days: 30 });
  });

  it("bloque un client déjà averti", () => {
    expect(suggestSanction("user", [past(SanctionType.WARNING, 10)], NOW)).toEqual({ type: SanctionType.BLOCK });
  });

  it("oublie les mesures de plus de 12 mois", () => {
    expect(suggestSanction("shop", [past(SanctionType.WARNING, 366)], NOW)).toEqual({ type: SanctionType.WARNING });
    expect(suggestSanction("shop", [past(SanctionType.WARNING, 365)], NOW)).toEqual({ type: SanctionType.SUSPENSION, days: 7 });
  });

  it("ne compte ni les masquages d'annonce ni les blocages", () => {
    expect(
      suggestSanction("shop", [past(SanctionType.HIDE, 5), past(SanctionType.BLOCK, 5)], NOW)
    ).toEqual({ type: SanctionType.WARNING });
  });
});
