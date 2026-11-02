import { describe, it, expect } from "vitest";
import { SanctionTargetKind, SanctionType } from "../../../../src/models/sanction.model.js";
import { SupportMessageKind, SupportVisibility } from "../../../../src/models/supportMessage.model.js";
import {
  SupportOutcome,
  SupportParty,
  SupportPriority,
  SupportTargetKind,
  SupportTicketStatus,
  SupportTicketType,
} from "../../../../src/models/supportTicket.model.js";
import { SupportAction } from "../../../../src/shared/helpers/support.workflow.js";
import {
  toSanctionDto,
  toSupportMessageDto,
  toSupportTicketDto,
} from "../../../../src/shared/interfaces/Support.interfaces.js";
import { makeSanction, makeSupportMessage, makeSupportTicket, oid } from "../../../helpers/factories.js";

const { REQUESTER, SHOP, ADMIN } = SupportParty;
const S = SupportTicketStatus;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────
describe("toSupportMessageDto", () => {
  it("expose l'auteur par son rôle et son nom, jamais son compte", () => {
    const message = makeSupportMessage({
      author: { userId: oid(), party: SHOP, name: "Boutique Kaloum" },
      body: "Le colis part demain.",
    });

    const dto = toSupportMessageDto(message);

    expect(dto).toEqual({
      id: message._id.toString(),
      author: { party: SHOP, name: "Boutique Kaloum" },
      visibility: SupportVisibility.PUBLIC,
      kind: SupportMessageKind.MESSAGE,
      body: "Le colis part demain.",
      attachments: [],
      containsContact: false,
      createdAt: message.createdAt,
    });
  });

  it("recopie les pièces jointes sans champ superflu", () => {
    const file = { url: "/uploads/files/photo.jpg", name: "photo.jpg", mimetype: "image/jpeg", size: 2048, _id: oid() };
    const dto = toSupportMessageDto(makeSupportMessage({ attachments: [file] }));

    expect(dto.attachments).toEqual([{ url: file.url, name: "photo.jpg", mimetype: "image/jpeg", size: 2048 }]);
  });

  it("tolère un ancien message sans pièces jointes ni indicateur de contact", () => {
    const dto = toSupportMessageDto(makeSupportMessage({ attachments: undefined, containsContact: undefined }));

    expect(dto.attachments).toEqual([]);
    expect(dto.containsContact).toBe(false);
  });
});

// ─────────────────────────────────────────────
describe("toSupportTicketDto", () => {
  const boutiqueId = oid();
  const orderId = oid();
  const partId = oid();
  const ticket = makeSupportTicket({
    number: "SUP-000042",
    reason: "delay",
    target: { kind: SupportTargetKind.SHOP_ORDER, id: partId, label: "CMD-42-1" },
    boutiqueId,
    orderId,
    assignee: oid(),
    deadlineAt: new Date(NOW.getTime() + 2 * DAY),
  });

  it("traduit le type, le motif et le statut pour celui qui lit", () => {
    const dto = toSupportTicketDto(ticket, SHOP, [SHOP], { now: NOW });

    expect(dto).toMatchObject({
      id: ticket._id.toString(),
      number: "SUP-000042",
      type: SupportTicketType.ORDER_PROBLEM,
      typeLabel: "Problème de commande",
      reason: "delay",
      reasonLabel: "Retard",
      status: S.AWAITING_SHOP,
      statusLabel: "À vous de répondre",
      priority: SupportPriority.NORMAL,
      viewer: SHOP,
      waitingOn: SHOP,
    });
    expect(toSupportTicketDto(ticket, REQUESTER, [REQUESTER], { now: NOW }).statusLabel).toBe("Chez la boutique");
  });

  it("donne les identifiants en texte et la cible lisible", () => {
    const dto = toSupportTicketDto(ticket, REQUESTER, [REQUESTER], { now: NOW });

    expect(dto.target).toEqual({ kind: SupportTargetKind.SHOP_ORDER, id: partId.toString(), label: "CMD-42-1" });
    expect(dto.boutiqueId).toBe(boutiqueId.toString());
    expect(dto.orderId).toBe(orderId.toString());
    expect(dto.requesterShopId).toBeNull();
    expect(dto.deadlineAt).toEqual(ticket.deadlineAt);
  });

  it("ne montre que le nom et le type de compte du demandeur, jamais son email", () => {
    const dto = toSupportTicketDto(ticket, SHOP, [SHOP], { now: NOW });

    expect(dto.requester).toEqual({ name: "Mamadou Diallo", accountType: "user" });
  });

  it("ne dit plus qui doit agir une fois la demande terminée", () => {
    expect(toSupportTicketDto(makeSupportTicket({ status: S.AWAITING_REQUESTER }), REQUESTER, [], { now: NOW }).waitingOn).toBe(REQUESTER);
    expect(toSupportTicketDto(makeSupportTicket({ status: S.AWAITING_ADMIN }), REQUESTER, [], { now: NOW }).waitingOn).toBe(ADMIN);
    expect(toSupportTicketDto(makeSupportTicket({ status: S.RESOLVED }), REQUESTER, [], { now: NOW }).waitingOn).toBeNull();
    expect(toSupportTicketDto(makeSupportTicket({ status: S.CLOSED }), REQUESTER, [], { now: NOW }).waitingOn).toBeNull();
  });

  it("met les valeurs absentes à null", () => {
    const dto = toSupportTicketDto(makeSupportTicket(), REQUESTER, [REQUESTER], { now: NOW });

    expect(dto).toMatchObject({
      target: null,
      boutiqueId: null,
      orderId: null,
      escalatedAt: null,
      proposal: null,
      resolution: null,
      appeal: null,
      satisfaction: null,
      deadlineAt: null,
      lastMessageAt: null,
      resolvedAt: null,
      closedAt: null,
    });
  });

  it("traduit la proposition, la décision, le recours et la note", () => {
    const at = new Date(NOW.getTime() - DAY);
    const decided = makeSupportTicket({
      status: S.RESOLVED,
      proposal: { kind: "refund", details: "Remboursement de 50 000 GNF", status: "declined", at, by: oid() },
      resolution: { outcome: SupportOutcome.UPHELD, note: "La boutique rembourse.", by: ADMIN, decidedBy: oid(), at },
      appeal: { by: SHOP, userId: oid(), reason: "Le client a reçu le colis.", at },
      satisfaction: { rating: 4, comment: "Rapide", at },
      resolvedAt: at,
    });

    const dto = toSupportTicketDto(decided, REQUESTER, [REQUESTER], { now: NOW });

    expect(dto.proposal).toEqual({ kind: "refund", kindLabel: "Remboursement", details: "Remboursement de 50 000 GNF", status: "declined", at });
    expect(dto.resolution).toEqual({ outcome: SupportOutcome.UPHELD, outcomeLabel: "Donnée en faveur du demandeur", note: "La boutique rembourse.", by: ADMIN, at });
    expect(dto.appeal).toEqual({ by: SHOP, reason: "Le client a reçu le colis.", at });
    expect(dto.satisfaction).toEqual({ rating: 4, comment: "Rapide" });
    expect(dto.resolvedAt).toEqual(at);
  });

  it("rend tel quel un type de proposition inconnu", () => {
    const dto = toSupportTicketDto(
      makeSupportTicket({ proposal: { kind: "bon_achat", details: "Bon de 10 000 GNF", status: "pending", at: NOW, by: oid() } }),
      REQUESTER,
      [REQUESTER],
      { now: NOW }
    );

    expect(dto.proposal?.kindLabel).toBe("bon_achat");
  });

  it("ne montre la prise en charge qu'à l'administration", () => {
    expect(toSupportTicketDto(ticket, ADMIN, [ADMIN], { now: NOW }).assigneeId).toBe(ticket.assignee!.toString());
    expect(toSupportTicketDto(makeSupportTicket(), ADMIN, [ADMIN], { now: NOW }).assigneeId).toBeNull();
    expect(toSupportTicketDto(ticket, SHOP, [SHOP], { now: NOW })).not.toHaveProperty("assigneeId");
    expect(toSupportTicketDto(ticket, REQUESTER, [REQUESTER], { now: NOW })).not.toHaveProperty("assigneeId");
  });

  it("donne les boutons des rôles de la personne sur cette demande", () => {
    expect(toSupportTicketDto(ticket, SHOP, [SHOP], { now: NOW }).availableActions).toEqual([SupportAction.PROPOSE, SupportAction.ESCALATE]);
    expect(toSupportTicketDto(ticket, REQUESTER, [REQUESTER], { now: NOW }).availableActions).toEqual([SupportAction.CLOSE]);
    expect(toSupportTicketDto(ticket, SHOP, [], { now: NOW }).availableActions).toEqual([]);
  });

  describe("messages", () => {
    const publicMessage = makeSupportMessage({ body: "Où est mon colis ?" });
    const internalNote = makeSupportMessage({
      author: { userId: oid(), party: ADMIN, name: "Équipe de la plateforme" },
      visibility: SupportVisibility.INTERNAL,
      body: "Troisième plainte contre cette boutique ce mois-ci.",
    });
    const messages = [publicMessage, internalNote];

    it("cache les notes internes aux parties", () => {
      for (const viewer of [REQUESTER, SHOP]) {
        const dto = toSupportTicketDto(ticket, viewer, [viewer], { now: NOW, messages });

        expect(dto.messages?.map((m) => m.body)).toEqual(["Où est mon colis ?"]);
      }
    });

    it("montre les notes internes à l'administration", () => {
      const dto = toSupportTicketDto(ticket, ADMIN, [ADMIN], { now: NOW, messages });

      expect(dto.messages?.map((m) => m.visibility)).toEqual([SupportVisibility.PUBLIC, SupportVisibility.INTERNAL]);
    });

    it("n'ajoute pas de fil quand la liste ne le demande pas", () => {
      expect(toSupportTicketDto(ticket, ADMIN, [ADMIN], { now: NOW })).not.toHaveProperty("messages");
    });
  });
});

// ─────────────────────────────────────────────
describe("toSanctionDto", () => {
  it("expose la mesure, sa cible et sa demande", () => {
    const ticketId = oid();
    const sanction = makeSanction({ ticketId, liftRequestedAt: NOW });

    const dto = toSanctionDto(sanction, NOW);

    expect(dto).toEqual({
      id: sanction._id.toString(),
      type: SanctionType.WARNING,
      target: { kind: SanctionTargetKind.SHOP, id: sanction.target.id.toString(), label: "Boutique Kaloum" },
      reason: "Paiement demandé hors plateforme.",
      ticketId: ticketId.toString(),
      startsAt: sanction.startsAt,
      endsAt: null,
      provisional: false,
      state: "active",
      liftRequestedAt: NOW,
      liftedAt: null,
      liftReason: null,
      createdAt: sanction.createdAt,
    });
  });

  it("ne révèle jamais qui a été prévenu ni quel administrateur a agi", () => {
    const dto = toSanctionDto(makeSanction({ createdBy: oid(), liftedBy: oid() }), NOW);

    expect(dto).not.toHaveProperty("notifiedUserId");
    expect(dto).not.toHaveProperty("createdBy");
    expect(dto).not.toHaveProperty("liftedBy");
  });

  it("dit une suspension terminée à son échéance, active avant", () => {
    const suspension = (endsAt: Date) => makeSanction({ type: SanctionType.SUSPENSION, endsAt });

    expect(toSanctionDto(suspension(new Date(NOW.getTime() + DAY)), NOW).state).toBe("active");
    expect(toSanctionDto(suspension(NOW), NOW).state).toBe("ended");
    expect(toSanctionDto(suspension(new Date(NOW.getTime() - DAY)), NOW).state).toBe("ended");
  });

  it("dit une mesure levée, quelle que soit son échéance", () => {
    const lifted = makeSanction({
      type: SanctionType.SUSPENSION,
      endsAt: new Date(NOW.getTime() + DAY),
      liftedAt: NOW,
      liftReason: "Erreur de modération.",
    });

    expect(toSanctionDto(lifted, NOW)).toMatchObject({ state: "lifted", liftedAt: NOW, liftReason: "Erreur de modération." });
  });

  it("garde un masquage ou un blocage actif tant qu'il n'est pas levé", () => {
    expect(toSanctionDto(makeSanction({ type: SanctionType.HIDE, provisional: true }), NOW)).toMatchObject({ state: "active", provisional: true });
    expect(toSanctionDto(makeSanction({ type: SanctionType.BLOCK }), NOW).state).toBe("active");
  });
});
