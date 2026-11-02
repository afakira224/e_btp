import { describe, it, expect } from "vitest";
import {
  contactForm,
  createTicketForm,
  listTicketsForm,
  postMessageForm,
  ticketActionForm,
  ticketIdParam,
} from "../../../../src/shared/forms/support.form.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const validTicket = (over: Record<string, unknown> = {}) => ({
  type: "order_problem",
  reason: "delay",
  description: "Ma commande devait arriver lundi.",
  targetId: VALID_OBJECT_ID,
  ...over,
});

// ─────────────────────────────────────────────
describe("createTicketForm", () => {
  it("accepte une demande complète", async () => {
    const { isValid, errors } = await runValidation(createTicketForm, { body: validTicket({ subject: "Colis en retard" }) });

    expect(errors).toEqual([]);
    expect(isValid).toBe(true);
  });

  it("accepte une question sans cible", async () => {
    const { isValid } = await runValidation(createTicketForm, {
      body: { type: "general_question", reason: "account", description: "Comment changer mon email ?" },
    });

    expect(isValid).toBe(true);
  });

  it("refuse d'ouvrir un retour directement", async () => {
    const { isValid, errors } = await runValidation(createTicketForm, { body: validTicket({ type: "return" }) });

    expect(isValid).toBe(false);
    expect(errors[0]).toMatch(/^Type invalide\. Valeurs acceptées : order_problem, listing_report/);
  });

  it("exige un motif", async () => {
    const { errors } = await runValidation(createTicketForm, { body: validTicket({ reason: "   " }) });

    expect(errors).toEqual(["Le motif est requis."]);
  });

  it.each([
    ["trop courte", "Retard."],
    ["trop longue", "x".repeat(2001)],
  ])("refuse une description %s", async (_label, description) => {
    const { errors } = await runValidation(createTicketForm, { body: validTicket({ description }) });

    expect(errors).toEqual(["Décrivez la situation : 10 à 2 000 caractères."]);
  });

  it("nettoie la description avant de mesurer sa longueur", async () => {
    const { isValid, req } = await runValidation(createTicketForm, { body: validTicket({ description: "   Retard.    " }) });

    expect(isValid).toBe(false);
    expect(req.body.description).toBe("Retard.");
  });

  it("limite l'objet à 120 caractères", async () => {
    const { errors } = await runValidation(createTicketForm, { body: validTicket({ subject: "x".repeat(121) }) });

    expect(errors).toEqual(["Objet limité à 120 caractères."]);
  });

  it("refuse une cible ou une boutique mal formée", async () => {
    const { errors } = await runValidation(createTicketForm, { body: validTicket({ targetId: "42", shopId: "kaloum" }) });

    expect(errors).toEqual(["Cible invalide.", "Boutique invalide."]);
  });
});

// ─────────────────────────────────────────────
describe("contactForm", () => {
  const validContact = (over: Record<string, unknown> = {}) => ({
    name: "Fatou Camara",
    email: "Fatou.Camara@Example.com",
    message: "Je n'arrive pas à créer mon compte.",
    ...over,
  });

  it("accepte un message de visiteur et normalise son email", async () => {
    const { isValid, req } = await runValidation(contactForm, { body: validContact({ reason: "account" }) });

    expect(isValid).toBe(true);
    expect(req.body.email).toBe("fatou.camara@example.com");
  });

  it("refuse un nom, un email et un message invalides", async () => {
    const { errors } = await runValidation(contactForm, { body: { name: "F", email: "pas-un-email", message: "Aide" } });

    expect(errors).toEqual([
      "Votre nom : 2 à 80 caractères.",
      "Email invalide.",
      "Votre message : 10 à 2 000 caractères.",
    ]);
  });

  it("n'accepte que les motifs d'une question", async () => {
    const { errors } = await runValidation(contactForm, { body: validContact({ reason: "scam" }) });

    expect(errors).toEqual(["Motif invalide."]);
  });
});

// ─────────────────────────────────────────────
describe("listTicketsForm", () => {
  it("accepte une liste sans paramètre", async () => {
    const { isValid } = await runValidation(listTicketsForm);

    expect(isValid).toBe(true);
  });

  it.each(["open", "todo", "waiting", "admin", "done", "urgent", "reports"])("accepte l'onglet %s", async (tab) => {
    const { isValid } = await runValidation(listTicketsForm, { query: { tab } });

    expect(isValid).toBe(true);
  });

  it("refuse une portée, un onglet ou un type inconnus", async () => {
    const { errors } = await runValidation(listTicketsForm, { query: { scope: "all", tab: "archives", type: "complaint" } });

    expect(errors).toEqual([
      "Portée invalide : mine, shop ou admin.",
      "Onglet invalide. Valeurs acceptées : open, done, todo, waiting, admin, urgent, reports.",
      "Type invalide.",
    ]);
  });

  it("refuse une boutique mal formée, une recherche trop longue et une pagination invalide", async () => {
    const { errors } = await runValidation(listTicketsForm, {
      query: { boutiqueId: "kaloum", search: "x".repeat(61), page: "0", limit: "101" },
    });

    expect(errors).toEqual([
      "Boutique invalide.",
      "Recherche limitée à 60 caractères.",
      "La page doit être un entier positif.",
      "La limite doit être comprise entre 1 et 100.",
    ]);
  });
});

describe("ticketIdParam", () => {
  it("exige un identifiant de demande valide", async () => {
    expect((await runValidation(ticketIdParam, { params: { id: VALID_OBJECT_ID } })).isValid).toBe(true);
    expect((await runValidation(ticketIdParam, { params: { id: "SUP-000042" } })).errors).toEqual([
      "Identifiant de demande invalide.",
    ]);
  });
});

// ─────────────────────────────────────────────
describe("postMessageForm", () => {
  const params = { id: VALID_OBJECT_ID };

  it("accepte un message et convertit l'indicateur de note interne (multipart)", async () => {
    const { isValid, req } = await runValidation(postMessageForm, { params, body: { body: "Bonjour", internal: "true" } });

    expect(isValid).toBe(true);
    expect(req.body.internal).toBe(true);
  });

  it("refuse un message vide ou trop long", async () => {
    expect((await runValidation(postMessageForm, { params, body: { body: "   " } })).errors).toEqual([
      "Message : 1 à 2 000 caractères.",
    ]);
    expect((await runValidation(postMessageForm, { params, body: { body: "x".repeat(2001) } })).isValid).toBe(false);
  });

  it("refuse un indicateur de note interne qui n'est pas un booléen", async () => {
    const { errors } = await runValidation(postMessageForm, { params, body: { body: "Bonjour", internal: "peut-être" } });

    expect(errors).toEqual(["Note interne : vrai ou faux."]);
  });

  it("n'attend la réponse que du demandeur ou de la boutique, et ignore un champ vide", async () => {
    expect((await runValidation(postMessageForm, { params, body: { body: "Bonjour", waitFor: "shop" } })).isValid).toBe(true);
    expect((await runValidation(postMessageForm, { params, body: { body: "Bonjour", waitFor: "" } })).isValid).toBe(true);
    expect((await runValidation(postMessageForm, { params, body: { body: "Bonjour", waitFor: "admin" } })).errors).toEqual([
      "Réponse attendue de : requester ou shop.",
    ]);
  });
});

// ─────────────────────────────────────────────
describe("ticketActionForm", () => {
  const params = (action: string) => ({ id: VALID_OBJECT_ID, action });

  it.each(["propose", "accept", "escalate", "resolve", "appeal", "close", "reopen", "assign", "rate"])(
    "accepte l'action %s",
    async (action) => {
      const { isValid } = await runValidation(ticketActionForm, { params: params(action) });

      expect(isValid).toBe(true);
    }
  );

  it("refuse une action inconnue", async () => {
    const { errors } = await runValidation(ticketActionForm, { params: params("refund") });

    expect(errors).toEqual([
      "Action inconnue. Valeurs acceptées : propose, accept, escalate, resolve, appeal, close, reopen, assign, rate.",
    ]);
  });

  it("convertit la note en entier et la borne de 1 à 5", async () => {
    const { req } = await runValidation(ticketActionForm, { params: params("rate"), body: { rating: "4" } });
    expect(req.body.rating).toBe(4);

    const { errors } = await runValidation(ticketActionForm, { params: params("rate"), body: { rating: "6" } });
    expect(errors).toEqual(["La note va de 1 à 5."]);
  });

  it("n'accepte que les décisions de l'administration", async () => {
    const { errors } = await runValidation(ticketActionForm, { params: params("resolve"), body: { outcome: "agreed" } });

    expect(errors).toEqual(["Décision invalide. Valeurs acceptées : upheld, rejected, answered."]);
  });

  it("borne la longueur des textes", async () => {
    const { errors } = await runValidation(ticketActionForm, {
      params: params("propose"),
      body: { details: "x".repeat(1001), note: "x".repeat(1001), reason: "x".repeat(1001), comment: "x".repeat(501) },
    });

    expect(errors).toEqual([
      "Maximum 1 000 caractères.",
      "Maximum 1 000 caractères.",
      "Maximum 1 000 caractères.",
      "Maximum 500 caractères.",
    ]);
  });

  it("refuse un administrateur mal formé", async () => {
    const { errors } = await runValidation(ticketActionForm, { params: params("assign"), body: { assignee: "moi" } });

    expect(errors).toEqual(["Administrateur invalide."]);
  });
});
