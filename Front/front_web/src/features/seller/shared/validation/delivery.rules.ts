import { z } from "zod";
import { DELIVERY_MODES, DeliveryMode, type DeliverySettingsInput } from "../../../../entities/delivery";

// ─────────────────────────────────────────────
//  Règles d'une configuration de livraison — reprises de
//  validateDeliverySettings (Back/src/shared/helpers/delivery.helper.ts),
//  mêmes conditions, mêmes messages. Elles évitent un aller-retour pour une
//  erreur évidente ; le serveur revalide tout et reste seul juge.
// ─────────────────────────────────────────────

/**
 * Valeurs du formulaire : le tarif est saisi en texte, converti à l'envoi.
 * Un alias plutôt qu'une interface : useForm exige un Record<string, unknown>.
 */
export type DeliveryDraft = {
  modes: DeliveryMode[];
  flatRateFee: string;
};

/** Chiffres seuls : le GNF n'a pas de décimales, les espaces de saisie sont tolérés. */
export const parseFee = (value: string): number | null => {
  const digits = value.replace(/[\s  ]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const fee = Number(digits);
  return Number.isSafeInteger(fee) ? fee : null;
};

export const MESSAGES = {
  noMode: "Activez au moins un mode de livraison : sans mode, le produit ne peut être ni livré ni retiré.",
  feeRequired: "Le tarif de la livraison à prix fixe est requis quand ce mode est activé.",
  feeInvalid:
    "Le tarif de la livraison à prix fixe doit être un nombre entier de GNF supérieur à 0 (pour une livraison sans frais, activez la livraison gratuite).",
  pickupAddress:
    "Le retrait en boutique nécessite l'adresse de la boutique : renseignez-la avant d'activer ce mode.",
} as const;

/** Erreurs par champ d'une configuration, ou objet vide si elle est cohérente. */
export const deliveryIssues = (
  draft: DeliveryDraft,
  shopAddress: string | undefined
): Partial<Record<keyof DeliveryDraft, string>> => {
  if (draft.modes.length === 0) return { modes: MESSAGES.noMode };

  const issues: Partial<Record<keyof DeliveryDraft, string>> = {};
  if (draft.modes.includes(DeliveryMode.FLAT_RATE)) {
    const fee = parseFee(draft.flatRateFee);
    if (!draft.flatRateFee.trim()) issues.flatRateFee = MESSAGES.feeRequired;
    else if (fee === null || fee <= 0) issues.flatRateFee = MESSAGES.feeInvalid;
  }
  if (draft.modes.includes(DeliveryMode.PICKUP) && !shopAddress?.trim()) {
    issues.modes = MESSAGES.pickupAddress;
  }
  return issues;
};

/** Ajoute les erreurs de livraison à un schéma zod, champ par champ. */
export const refineDelivery = (
  draft: DeliveryDraft,
  shopAddress: string | undefined,
  ctx: z.RefinementCtx
): void => {
  for (const [field, message] of Object.entries(deliveryIssues(draft, shopAddress))) {
    ctx.addIssue({ code: "custom", path: [field], message });
  }
};

export const deliveryModesSchema = z.array(z.enum(DELIVERY_MODES as [DeliveryMode, ...DeliveryMode[]]));

/** Ce que le back reçoit : modes triés, tarif seulement si le prix fixe est actif. */
export const toSettingsInput = (draft: DeliveryDraft): DeliverySettingsInput => {
  const modes = DELIVERY_MODES.filter((mode) => draft.modes.includes(mode));
  return {
    modes,
    flatRateFee: modes.includes(DeliveryMode.FLAT_RATE) ? parseFee(draft.flatRateFee) : null,
  };
};

/** Brouillon de départ à partir de réglages enregistrés. */
export const toDraft = (settings: {
  modes: readonly DeliveryMode[];
  flatRateFee: number | null;
}): DeliveryDraft => ({
  modes: [...settings.modes],
  flatRateFee: settings.flatRateFee != null ? String(settings.flatRateFee) : "",
});
