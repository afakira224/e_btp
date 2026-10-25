import { describe, it, expect, vi } from "vitest";

// La file d'envoi est remplacée : on lit le message construit, rien ne part.
vi.mock("../../../../src/shared/mail/mail.queue.js", () => ({
  addToQueue: vi.fn(() => 1),
}));

import { addToQueue } from "../../../../src/shared/mail/mail.queue.js";
import {
  sendNoticeMail,
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

// ─────────────────────────────────────────────
//  Avis des sous-commandes. Motifs, notes et réponses de boutique sont saisis
//  par des personnes : tout ce qui entre dans le HTML est échappé.
// ─────────────────────────────────────────────
describe("sendNoticeMail", () => {
  const mail = {
    to: "client@example.com",
    subject: "Commande CMD-42-1 confirmée",
    title: "Commande confirmée",
    paragraphs: ["Boutique Kaloum a confirmé votre commande.", "Merci."],
  };

  it("met l'avis en file, un paragraphe par ligne", () => {
    const id = sendNoticeMail(mail);

    expect(id).toBe(1);
    expect(lastMail()).toMatchObject({ to: "client@example.com", subject: "Commande CMD-42-1 confirmée" });
    expect(lastMail().html).toContain("<h2>Commande confirmée</h2>");
    expect(lastMail().html).toContain("<p>Boutique Kaloum a confirmé votre commande.</p>");
    expect(lastMail().html).toContain("<p>Merci.</p>");
  });

  it("salue la personne quand son nom est connu, sinon pas de formule d'appel", () => {
    sendNoticeMail({ ...mail, username: "Aïssatou" });
    expect(lastMail().html).toContain("Bonjour <strong>Aïssatou</strong>");

    sendNoticeMail(mail);
    expect(lastMail().html).not.toContain("Bonjour");
  });

  it("ajoute le bouton vers la page concernée seulement s'il est fourni", () => {
    sendNoticeMail({ ...mail, cta: { path: "/compte/commandes/42", label: "Voir ma commande" } });
    expect(lastMail().html).toContain('/compte/commandes/42"');
    expect(lastMail().html).toContain("Voir ma commande</a>");

    sendNoticeMail(mail);
    expect(lastMail().html).not.toContain("<a ");
  });

  it("échappe le titre, le prénom, les paragraphes et le libellé du bouton", () => {
    sendNoticeMail({
      ...mail,
      title: "Litige <b>ouvert</b>",
      username: "O'Neil",
      paragraphs: ['La boutique refuse le retour : <img src=x onerror="alert(1)">'],
      cta: { path: "/admin/commandes/1", label: "Examiner & trancher" },
    });

    const { html } = lastMail();
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("Litige &lt;b&gt;ouvert&lt;/b&gt;");
    expect(html).toContain("O&#39;Neil");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("Examiner &amp; trancher");
  });
});
