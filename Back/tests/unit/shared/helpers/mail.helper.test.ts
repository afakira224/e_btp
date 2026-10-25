import { describe, it, expect, vi } from "vitest";

// La file d'envoi est remplacée : on lit le message construit, rien ne part.
vi.mock("../../../../src/shared/mail/mail.queue.js", () => ({
  addToQueue: vi.fn(() => 1),
}));

import { addToQueue } from "../../../../src/shared/mail/mail.queue.js";
import {
  sendShopRequestApprovedMail,
  sendShopRequestReceivedMail,
  sendShopRequestRejectedMail,
} from "../../../../src/shared/helpers/mail.helper.js";

const user = { email: "ibrahima@example.com", nom: "Sow" };
const lastMail = () => vi.mocked(addToQueue).mock.calls.at(-1)![0];

// ─────────────────────────────────────────────
//  Emails des demandes de boutique. Le nom de la boutique et le motif de
//  refus sont saisis par des utilisateurs : ils n'entrent dans le HTML
//  qu'échappés.
// ─────────────────────────────────────────────
describe("emails des demandes de boutique", () => {
  it("accuse réception de la demande", () => {
    sendShopRequestReceivedMail(user, "Quincaillerie Kipé");

    expect(lastMail().to).toBe("ibrahima@example.com");
    expect(lastMail().html).toContain("Quincaillerie Kipé");
  });

  it("annonce l'ouverture avec un lien vers l'espace vendeur", () => {
    sendShopRequestApprovedMail(user, "Quincaillerie Kipé");

    expect(lastMail().subject).toContain("ouverte");
    expect(lastMail().html).toContain("/ma-boutique");
  });

  it("échappe le motif de refus et le nom de la boutique", () => {
    sendShopRequestRejectedMail(user, "Kipé & Fils", '<script>alert("x")</script>');

    const { html } = lastMail();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Kipé &amp; Fils");
  });
});
