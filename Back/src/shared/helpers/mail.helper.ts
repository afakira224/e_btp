 

// ─────────────────────────────────────────────
//  TEMPLATES

import type { IUser } from "../../models/user.model.js";
import { addToQueue } from "../mail/mail.queue.js";

// ─────────────────────────────────────────────
const welcomeTemplate = ({ username, appName, loginUrl }: { username: string; appName: string; loginUrl: string }) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2>Bienvenue ${username} 🎉</h2>
  <p>Ton compte sur <strong>${appName}</strong> a bien été créé.</p>
  <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none">
    Se connecter
  </a>
</div>`;

const verifyEmailTemplate = ({ username, appName, verifyUrl }: { username: string; appName: string; verifyUrl: string }) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2>Vérification de ton email</h2>
  <p>Bonjour <strong>${username}</strong>, clique ci-dessous pour vérifier ton adresse.</p>
  <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none">
    Vérifier mon email
  </a>
  <p style="color:#999;font-size:12px">Ce lien expire dans 24h — ${appName}</p>
</div>`;

const forgotPasswordTemplate = ({
  username, appName, resetUrl, expiresIn,
}: { username: string; appName: string; resetUrl: string; expiresIn: string }) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2>Réinitialisation de mot de passe</h2>
  <p>Bonjour <strong>${username}</strong>, clique ci-dessous pour définir un nouveau mot de passe.</p>
  <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none">
    Réinitialiser mon mot de passe
  </a>
  <p style="color:#999;font-size:12px">Ce lien expire dans ${expiresIn} — ${appName}</p>
</div>`;

const passwordChangedTemplate = ({ username, appName, supportUrl }: { username: string; appName: string; supportUrl: string }) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2>Mot de passe modifié</h2>
  <p>Bonjour <strong>${username}</strong>, ton mot de passe a bien été modifié.</p>
  <p>Si tu n'es pas à l'origine de cette action, contacte le <a href="${supportUrl}">support</a>.</p>
  <p style="color:#999;font-size:12px">${appName}</p>
</div>`;

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
const APP_NAME = process.env.APP_NAME ?? "App";
const APP_URL  = process.env.APP_URL  ?? "";

export const sendWelcomeMail = (user: Pick<IUser, "email" | "nom">): number =>
  addToQueue({
    to:      user.email,
    subject: "Bienvenue 🎉",
    html:    welcomeTemplate({ username: user.nom, appName: APP_NAME, loginUrl: `${APP_URL}/login` }),
  });

export const sendVerifyEmailMail = (user: Pick<IUser, "email" | "nom">, token: string): number =>
  addToQueue({
    to:      user.email,
    subject: "Vérifiez votre adresse email",
    html:    verifyEmailTemplate({
      username:  user.email,
      appName:   APP_NAME,
      verifyUrl: `${APP_URL}/auth/verify-email/${token}`,
    }),
  });

export const sendForgotPasswordMail = (user: Pick<IUser, "email" | "nom">, token: string): number =>
  addToQueue({
    to:      user.email,
    subject: "Réinitialisation de votre mot de passe",
    html:    forgotPasswordTemplate({
      username:  user.nom,
      appName:   APP_NAME,
      resetUrl:  `${APP_URL}/auth/reset-password/${token}`,
      expiresIn: "1 heure",
    }),
  });

export const sendPasswordChangedMail = (user: Pick<IUser, "email" | "nom">): number =>
  addToQueue({
    to:      user.email,
    subject: "Mot de passe modifié",
    html:    passwordChangedTemplate({
      username:   user.nom,
      appName:    APP_NAME,
      supportUrl: `${APP_URL}/support`,
    }),
  });

export const sendCustomMail = (opts: { to: string; subject: string; html: string }): number =>
  addToQueue(opts);

// ─────────────────────────────────────────────
//  COMMANDES
// ─────────────────────────────────────────────

// Montants formatés en francs guinéens.
const money = (value: number): string => `${new Intl.NumberFormat("fr-FR").format(value)} GNF`;

export interface OrderMailLine {
  productName: string;
  quantity: number;
  price: number;
}

export interface OrderMailData {
  reference: string;
  items: OrderMailLine[];
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  amount: number;
  adresse?: string;
}

const orderLinesTable = (items: OrderMailLine[]): string => `
<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <thead>
    <tr style="background:#F3F4F6;text-align:left">
      <th style="padding:8px;border-bottom:1px solid #E5E7EB">Article</th>
      <th style="padding:8px;border-bottom:1px solid #E5E7EB">Qté</th>
      <th style="padding:8px;border-bottom:1px solid #E5E7EB;text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    ${items
      .map(
        (i) => `<tr>
      <td style="padding:8px;border-bottom:1px solid #F3F4F6">${i.productName}</td>
      <td style="padding:8px;border-bottom:1px solid #F3F4F6">${i.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #F3F4F6;text-align:right">${money(i.price * i.quantity)}</td>
    </tr>`
      )
      .join("")}
  </tbody>
</table>`;

const orderConfirmationTemplate = (username: string, order: OrderMailData): string => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2>Merci pour votre commande, ${username} 🎉</h2>
  <p>Votre commande <strong>${order.reference}</strong> a bien été enregistrée.</p>
  ${orderLinesTable(order.items)}
  <table style="width:100%;font-size:14px">
    <tr><td>Sous-total</td><td style="text-align:right">${money(order.subtotal)}</td></tr>
    ${order.discountAmount > 0 ? `<tr><td>Réduction</td><td style="text-align:right;color:#059669">-${money(order.discountAmount)}</td></tr>` : ""}
    <tr><td>Livraison</td><td style="text-align:right">${order.shippingFee > 0 ? money(order.shippingFee) : "Offerte"}</td></tr>
    <tr style="font-weight:bold;font-size:16px">
      <td style="padding-top:8px;border-top:1px solid #E5E7EB">Total à payer</td>
      <td style="padding-top:8px;border-top:1px solid #E5E7EB;text-align:right">${money(order.amount)}</td>
    </tr>
  </table>
  ${order.adresse ? `<p style="color:#6B7280;font-size:13px">Livraison à : ${order.adresse}</p>` : ""}
  <p style="color:#999;font-size:12px">${APP_NAME}</p>
</div>`;

// Message affiché au client selon le nouveau statut de sa commande.
const STATUS_MESSAGES: Record<string, { subject: string; title: string; body: string }> = {
  confirmed: {
    subject: "Votre commande est confirmée",
    title: "Commande confirmée ✅",
    body: "Votre commande a été confirmée et sera préparée sous peu.",
  },
  shipped: {
    subject: "Votre commande est en route",
    title: "Commande expédiée 🚚",
    body: "Votre commande a quitté nos entrepôts et arrive bientôt.",
  },
  delivered: {
    subject: "Votre commande a été livrée",
    title: "Commande livrée 📦",
    body: "Votre commande a bien été livrée. Merci de votre confiance !",
  },
  cancelled: {
    subject: "Votre commande a été annulée",
    title: "Commande annulée ❌",
    body: "Votre commande a été annulée. Le stock a été restitué et aucun montant ne sera prélevé.",
  },
  pending: {
    subject: "Votre commande est en attente",
    title: "Commande en attente ⏳",
    body: "Votre commande est en attente de traitement.",
  },
};

const orderStatusTemplate = (username: string, reference: string, status: string): string => {
  const info = STATUS_MESSAGES[status] ?? {
    title: "Mise à jour de votre commande",
    body: `Le statut de votre commande est désormais : ${status}.`,
  };

  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2>${info.title}</h2>
  <p>Bonjour <strong>${username}</strong>,</p>
  <p>${info.body}</p>
  <p>Référence : <strong>${reference}</strong></p>
  <p style="color:#999;font-size:12px">${APP_NAME}</p>
</div>`;
};

export const sendOrderConfirmationMail = (
  user: Pick<IUser, "email" | "nom">,
  order: OrderMailData
): number =>
  addToQueue({
    to: user.email,
    subject: `Confirmation de votre commande ${order.reference}`,
    html: orderConfirmationTemplate(user.nom, order),
  });

export const sendOrderStatusMail = (
  user: Pick<IUser, "email" | "nom">,
  reference: string,
  status: string
): number =>
  addToQueue({
    to: user.email,
    subject: STATUS_MESSAGES[status]?.subject ?? "Mise à jour de votre commande",
    html: orderStatusTemplate(user.nom, reference, status),
  });
