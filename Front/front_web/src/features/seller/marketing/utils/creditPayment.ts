/** `credits-<boutique>-<recharge>` : l'identifiant que le prestataire de paiement reçoit pour une recharge de crédits. */
export const parseCreditPaymentId = (id: string): { shopId: string; purchaseId: string } | null => {
  const match = /^credits-(.+)-([^-]+)$/.exec(id);
  return match ? { shopId: match[1]!, purchaseId: match[2]! } : null;
};
