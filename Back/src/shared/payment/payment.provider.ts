import { randomUUID } from "crypto";

// ─────────────────────────────────────────────
//  Prestataire de paiement en ligne.
//
//  Aucun prestataire réel n'est encore choisi (Orange Money, MTN Mobile
//  Money, un agrégateur…) : le paiement en ligne passe par un prestataire
//  SIMULÉ, « sandbox », qui renvoie vers une page de paiement factice du front
//  et rembourse instantanément. Brancher un vrai prestataire = écrire un objet
//  de plus qui respecte PaymentProvider, et une route de notification signée
//  qui appelle confirmOrderPayment / failOrderPayment (orderPayment.service).
//
//  PAYMENT_PROVIDER choisit le prestataire. Par défaut : « sandbox » hors
//  production, aucun en production — le paiement en ligne y est alors refusé
//  plutôt que simulé.
// ─────────────────────────────────────────────

export interface PaymentInitiation {
  /** Référence du paiement chez le prestataire. */
  providerRef: string;
  /** Page où le client paie. */
  redirectUrl: string;
}

export interface RefundResult {
  /** refunded : l'argent est rendu ; pending : le prestataire confirmera plus tard. */
  status: "refunded" | "pending";
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: { orderId: string; reference: string; amount: number }): Promise<PaymentInitiation>;
  refund(input: { providerRef: string | null; amount: number; reference: string }): Promise<RefundResult>;
}

const appUrl = () => process.env.APP_URL ?? "";

export const sandboxProvider: PaymentProvider = {
  name: "sandbox",
  initiate: async ({ orderId }) => ({
    providerRef: `SBX-${randomUUID()}`,
    redirectUrl: `${appUrl()}/paiement/${orderId}`,
  }),
  refund: async () => ({ status: "refunded" }),
};

export const getPaymentProvider = (): PaymentProvider | null => {
  const name =
    process.env.PAYMENT_PROVIDER ?? (process.env.NODE_ENV === "production" ? "" : sandboxProvider.name);
  return name === sandboxProvider.name ? sandboxProvider : null;
};

export const isSandboxPayment = (): boolean => getPaymentProvider()?.name === sandboxProvider.name;
