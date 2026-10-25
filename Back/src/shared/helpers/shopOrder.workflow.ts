import { randomInt } from "crypto";
import { DeliveryMethod } from "../../models/delivery.model.js";
import { OrderStatus } from "../../models/order.model.js";
import {
  SHOP_ORDER_TERMINAL,
  ShopOrderActor,
  ShopOrderStatus,
  type IShopOrder,
} from "../../models/shopOrder.model.js";

// ─────────────────────────────────────────────
//  Cycle de vie d'une sous-commande — les règles, sans accès à la base.
//
//  Chaque changement de statut est une ACTION nommée (confirmer, refuser,
//  expédier…), permise à certains acteurs depuis certains statuts. Il n'existe
//  pas de « changer le statut » libre : un saut incohérent (livrée → à
//  confirmer) est impossible par construction, et chaque route dit ce qu'elle
//  fait. shared/services/shopOrder.service.ts applique ces règles et leurs
//  effets (stock, remboursement, statut de la commande, délais).
// ─────────────────────────────────────────────

export enum ShopOrderAction {
  CONFIRM = "confirm",
  REFUSE = "refuse",
  SHIP = "ship",
  READY = "ready",
  DELIVER = "deliver",
  FAIL_DELIVERY = "delivery-failed",
  RETRY_DELIVERY = "retry",
  ABANDON_DELIVERY = "abandon",
  CANCEL = "cancel",
  ADMIN_CANCEL = "admin-cancel",
  REQUEST_RETURN = "return",
  ACCEPT_RETURN = "accept-return",
  REJECT_RETURN = "reject-return",
  RESOLVE_DISPUTE = "resolve-dispute",
  CONFIRM_REFUND = "confirm-refund",
  // Automatiques : seule la plateforme les déclenche, à l'échéance d'un délai.
  EXPIRE = "expire",
  COMPLETE = "complete",
  ESCALATE = "escalate",
}

// ── Motifs ──────────────────────────────────
// Une liste fermée plutôt qu'un texte libre : on peut compter les refus pour
// rupture, et le client lit un motif clair. « Autre » s'accompagne d'une note.

export const REFUSAL_REASONS = {
  out_of_stock: "Rupture de stock",
  wrong_price: "Prix erroné",
  area_not_served: "Zone non desservie",
  other: "Autre",
} as const;

export const CANCELLATION_REASONS = {
  changed_mind: "Changement d'avis",
  ordering_error: "Erreur de commande",
  too_slow: "Délai trop long",
  other: "Autre",
} as const;

export const DELIVERY_FAILURE_REASONS = {
  customer_absent: "Client absent ou injoignable",
  address_not_found: "Adresse introuvable",
  parcel_refused: "Colis refusé",
  other: "Autre",
} as const;

export const RETURN_REASONS = {
  not_as_described: "Produit non conforme",
  damaged: "Produit abîmé",
  incomplete: "Commande incomplète",
  not_received: "Commande non reçue",
} as const;

/** Échecs dont le client est la cause : ses frais de livraison ne lui sont pas rendus. */
export const CUSTOMER_CAUSED_FAILURES: readonly string[] = ["customer_absent", "parcel_refused"];

/** Un produit abîmé se prouve : la demande de retour exige au moins une photo. */
export const RETURN_REASONS_NEEDING_PHOTO: readonly string[] = ["damaged"];

export const MAX_DELIVERY_ATTEMPTS = 2;

// ── Règles des actions ──────────────────────
interface ActionRule {
  actors: readonly ShopOrderActor[];
  from: readonly ShopOrderStatus[];
  /** Statut d'arrivée ; null quand l'action ne change pas le statut. */
  to: ShopOrderStatus | null;
  /** Motifs acceptés ; absent = pas de motif. */
  reasons?: Readonly<Record<string, string>>;
  reasonRequired?: boolean;
}

const { CLIENT, SHOP, ADMIN, SYSTEM } = ShopOrderActor;
const S = ShopOrderStatus;

export const ACTION_RULES: Record<ShopOrderAction, ActionRule> = {
  [ShopOrderAction.CONFIRM]: { actors: [SHOP], from: [S.PENDING], to: S.CONFIRMED },
  [ShopOrderAction.REFUSE]: {
    actors: [SHOP],
    from: [S.PENDING, S.CONFIRMED],
    to: S.REFUSED,
    reasons: REFUSAL_REASONS,
    reasonRequired: true,
  },
  [ShopOrderAction.SHIP]: { actors: [SHOP], from: [S.CONFIRMED], to: S.SHIPPED },
  [ShopOrderAction.READY]: { actors: [SHOP], from: [S.CONFIRMED], to: S.READY_FOR_PICKUP },
  [ShopOrderAction.DELIVER]: { actors: [SHOP], from: [S.SHIPPED, S.READY_FOR_PICKUP], to: S.DELIVERED },
  [ShopOrderAction.FAIL_DELIVERY]: {
    actors: [SHOP],
    from: [S.SHIPPED],
    to: S.DELIVERY_FAILED,
    reasons: DELIVERY_FAILURE_REASONS,
    reasonRequired: true,
  },
  [ShopOrderAction.RETRY_DELIVERY]: { actors: [SHOP], from: [S.DELIVERY_FAILED], to: S.SHIPPED },
  [ShopOrderAction.ABANDON_DELIVERY]: { actors: [SHOP], from: [S.DELIVERY_FAILED], to: S.FAILED },
  [ShopOrderAction.CANCEL]: {
    actors: [CLIENT],
    from: [S.PENDING, S.CONFIRMED],
    to: S.CANCELLED,
    reasons: CANCELLATION_REASONS,
  },
  [ShopOrderAction.ADMIN_CANCEL]: {
    actors: [ADMIN],
    from: [S.PENDING, S.CONFIRMED, S.SHIPPED, S.READY_FOR_PICKUP, S.DELIVERY_FAILED],
    to: S.CANCELLED,
  },
  [ShopOrderAction.REQUEST_RETURN]: {
    actors: [CLIENT],
    from: [S.DELIVERED],
    to: S.RETURN_REQUESTED,
    reasons: RETURN_REASONS,
    reasonRequired: true,
  },
  [ShopOrderAction.ACCEPT_RETURN]: { actors: [SHOP], from: [S.RETURN_REQUESTED], to: S.RETURNED },
  [ShopOrderAction.REJECT_RETURN]: { actors: [SHOP], from: [S.RETURN_REQUESTED], to: S.DISPUTED },
  // Statut d'arrivée selon la décision : remboursement → retournée, rejet → terminée.
  [ShopOrderAction.RESOLVE_DISPUTE]: { actors: [ADMIN], from: [S.DISPUTED], to: null },
  [ShopOrderAction.CONFIRM_REFUND]: { actors: [SHOP, ADMIN], from: [S.RETURNED], to: null },
  [ShopOrderAction.EXPIRE]: { actors: [SYSTEM], from: [S.PENDING, S.READY_FOR_PICKUP], to: S.EXPIRED },
  [ShopOrderAction.COMPLETE]: { actors: [SYSTEM], from: [S.DELIVERED], to: S.COMPLETED },
  [ShopOrderAction.ESCALATE]: { actors: [SYSTEM], from: [S.RETURN_REQUESTED], to: S.DISPUTED },
};

/** Actions qu'une personne peut déclencher par l'API (les automatiques exclues). */
export const MANUAL_ACTIONS: readonly ShopOrderAction[] = (
  Object.keys(ACTION_RULES) as ShopOrderAction[]
).filter((action) => !ACTION_RULES[action].actors.includes(SYSTEM));

export const isManualAction = (value: unknown): value is ShopOrderAction =>
  typeof value === "string" && (MANUAL_ACTIONS as readonly string[]).includes(value);

export const isPickup = (part: Pick<IShopOrder, "delivery">): boolean =>
  part.delivery?.method === DeliveryMethod.PICKUP;

// ── Contrôle d'une action ───────────────────
export interface ActionInput {
  reason?: string | undefined;
  note?: string | undefined;
  /** Code de remise donné par le client (livraison). */
  code?: string | undefined;
  /** Litige : remboursement total, partiel ou rejet. */
  resolution?: "refund_full" | "refund_partial" | "rejected" | undefined;
  refundAmount?: number | undefined;
  /** Retour : photos déjà téléversées. */
  photos?: string[] | undefined;
}

type Part = Pick<
  IShopOrder,
  "status" | "delivery" | "deliveryAttempts" | "pickupCode" | "amount" | "payment" | "deadlineAt"
>;

const STATUS_LABELS: Record<ShopOrderStatus, string> = {
  [S.AWAITING_PAYMENT]: "en attente de paiement",
  [S.PENDING]: "à confirmer",
  [S.CONFIRMED]: "en préparation",
  [S.SHIPPED]: "en livraison",
  [S.READY_FOR_PICKUP]: "prête au retrait",
  [S.DELIVERY_FAILED]: "livraison échouée",
  [S.DELIVERED]: "livrée",
  [S.RETURN_REQUESTED]: "retour demandé",
  [S.DISPUTED]: "en litige",
  [S.COMPLETED]: "terminée",
  [S.CANCELLED]: "annulée",
  [S.REFUSED]: "refusée",
  [S.EXPIRED]: "expirée",
  [S.FAILED]: "échec de livraison",
  [S.RETURNED]: "retournée",
};

export const statusLabel = (status: ShopOrderStatus): string => STATUS_LABELS[status];

/**
 * Renvoie le message d'erreur qui interdit l'action, ou null si elle est
 * permise. `actors` = les rôles que la personne tient sur CETTE sous-commande
 * (un gérant peut aussi être client d'une autre boutique).
 */
export const checkAction = (
  action: ShopOrderAction,
  actors: readonly ShopOrderActor[],
  part: Part,
  input: ActionInput,
  now: Date
): string | null => {
  const rule = ACTION_RULES[action];

  if (!rule.actors.some((actor) => actors.includes(actor))) {
    return "Vous ne pouvez pas effectuer cette action sur cette commande.";
  }

  if (!rule.from.includes(part.status)) {
    return `Action impossible : la commande est ${statusLabel(part.status)}.`;
  }

  if (rule.reasons) {
    if (input.reason === undefined || input.reason === "") {
      if (rule.reasonRequired) return "Le motif est requis.";
    } else if (!(input.reason in rule.reasons)) {
      return `Motif invalide. Valeurs acceptées : ${Object.keys(rule.reasons).join(", ")}.`;
    }
    if (input.reason === "other" && !input.note?.trim()) {
      return "Précisez le motif « Autre ».";
    }
  }

  switch (action) {
    case ShopOrderAction.SHIP:
      if (isPickup(part)) return "Une commande à retirer en boutique ne s'expédie pas : mettez-la à disposition.";
      break;
    case ShopOrderAction.READY:
      if (!isPickup(part)) return "Seule une commande à retirer en boutique se met à disposition.";
      break;
    case ShopOrderAction.DELIVER:
      // Le code prouve que le client a bien reçu son colis.
      if (!input.code || input.code.trim() !== part.pickupCode) return "Code de remise incorrect.";
      break;
    case ShopOrderAction.RETRY_DELIVERY:
      if (part.deliveryAttempts >= MAX_DELIVERY_ATTEMPTS) {
        return `${MAX_DELIVERY_ATTEMPTS} tentatives de livraison au plus : abandonnez la livraison.`;
      }
      break;
    case ShopOrderAction.REQUEST_RETURN:
      if (part.deadlineAt && part.deadlineAt.getTime() <= now.getTime()) {
        return "Le délai de retour est dépassé.";
      }
      if (RETURN_REASONS_NEEDING_PHOTO.includes(input.reason ?? "") && !input.photos?.length) {
        return "Joignez au moins une photo du produit abîmé.";
      }
      break;
    case ShopOrderAction.REJECT_RETURN:
      if (!input.note?.trim()) return "Expliquez pourquoi vous refusez ce retour.";
      break;
    case ShopOrderAction.RESOLVE_DISPUTE: {
      if (!input.resolution) return "La décision est requise : refund_full, refund_partial ou rejected.";
      if (!input.note?.trim()) return "Motivez la décision : le client et la boutique la liront.";
      if (input.resolution === "refund_partial") {
        const amount = input.refundAmount;
        if (amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 || amount >= part.amount) {
          return `Le remboursement partiel doit être un entier entre 1 et ${part.amount - 1} GNF.`;
        }
      }
      break;
    }
    case ShopOrderAction.CONFIRM_REFUND:
      if (part.payment.status !== "refund_pending") return "Aucun remboursement n'est en attente.";
      break;
    default:
      break;
  }

  return null;
};

/**
 * Actions que ces rôles peuvent lancer maintenant sur cette sous-commande :
 * ce sont les boutons de l'écran. Les conditions qui dépendent de la saisie
 * (motif, code de remise, photos) sont vérifiées à l'envoi par checkAction.
 */
export const availableActions = (
  actors: readonly ShopOrderActor[],
  part: Part,
  now: Date
): ShopOrderAction[] =>
  MANUAL_ACTIONS.filter((action) => {
    const rule = ACTION_RULES[action];
    if (!rule.actors.some((actor) => actors.includes(actor)) || !rule.from.includes(part.status)) return false;
    switch (action) {
      case ShopOrderAction.SHIP:
        return !isPickup(part);
      case ShopOrderAction.READY:
        return isPickup(part);
      case ShopOrderAction.RETRY_DELIVERY:
        return part.deliveryAttempts < MAX_DELIVERY_ATTEMPTS;
      case ShopOrderAction.REQUEST_RETURN:
        return !part.deadlineAt || part.deadlineAt.getTime() > now.getTime();
      case ShopOrderAction.CONFIRM_REFUND:
        return part.payment.status === "refund_pending";
      default:
        return true;
    }
  });

/** Statut d'arrivée d'une action permise. */
export const targetStatus = (action: ShopOrderAction, input: ActionInput, part: Part): ShopOrderStatus => {
  if (action === ShopOrderAction.RESOLVE_DISPUTE) {
    return input.resolution === "rejected" ? S.COMPLETED : S.RETURNED;
  }
  return ACTION_RULES[action].to ?? part.status;
};

// ── Délais ──────────────────────────────────
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEADLINES = {
  /** Paiement en ligne non confirmé : échoue, stock rendu. */
  payment: 30 * MINUTE,
  /** À confirmer : la boutique a 48 h, rappel à 24 h. */
  confirm: 48 * HOUR,
  confirmReminder: 24 * HOUR,
  /** Prête au retrait : 7 jours pour venir, rappel au client à 3 jours. */
  pickup: 7 * DAY,
  pickupReminder: 3 * DAY,
  /** Livrée : 7 jours pour demander un retour, puis terminée. */
  returnWindow: 7 * DAY,
  /** Retour demandé : la boutique a 48 h, sinon litige. */
  returnResponse: 48 * HOUR,
  returnResponseReminder: 24 * HOUR,
  /** En livraison sans suite : alerte à l'administration. */
  shippingStall: 7 * DAY,
} as const;

export interface Schedule {
  deadlineAt: Date | null;
  reminderAt: Date | null;
}

/** Prochaine échéance (et son rappel) à l'entrée dans un statut. */
export const scheduleFor = (status: ShopOrderStatus, now: Date): Schedule => {
  const at = (ms: number) => new Date(now.getTime() + ms);
  switch (status) {
    case S.PENDING:
      return { deadlineAt: at(DEADLINES.confirm), reminderAt: at(DEADLINES.confirmReminder) };
    case S.READY_FOR_PICKUP:
      return { deadlineAt: at(DEADLINES.pickup), reminderAt: at(DEADLINES.pickupReminder) };
    case S.SHIPPED:
      return { deadlineAt: at(DEADLINES.shippingStall), reminderAt: null };
    case S.DELIVERED:
      return { deadlineAt: at(DEADLINES.returnWindow), reminderAt: null };
    case S.RETURN_REQUESTED:
      return { deadlineAt: at(DEADLINES.returnResponse), reminderAt: at(DEADLINES.returnResponseReminder) };
    default:
      return { deadlineAt: null, reminderAt: null };
  }
};

/** Ce que la plateforme fait à l'échéance ; null = une alerte, sans changement. */
export const AUTO_ACTIONS: Partial<Record<ShopOrderStatus, ShopOrderAction>> = {
  [S.PENDING]: ShopOrderAction.EXPIRE,
  [S.READY_FOR_PICKUP]: ShopOrderAction.EXPIRE,
  [S.DELIVERED]: ShopOrderAction.COMPLETE,
  [S.RETURN_REQUESTED]: ShopOrderAction.ESCALATE,
};

// ── Argent ──────────────────────────────────

/**
 * Montant à rendre au client quand une sous-commande finit mal.
 * Annulée, refusée, expirée : tout (articles − part du coupon + livraison).
 * Échec de livraison causé par le client : sans les frais de livraison.
 * Retour : tout, ou le montant décidé sur un litige.
 */
export const refundAmountFor = (
  part: Pick<IShopOrder, "amount" | "deliveryFee">,
  status: ShopOrderStatus,
  input: Pick<ActionInput, "reason" | "resolution" | "refundAmount">
): number => {
  switch (status) {
    case S.CANCELLED:
    case S.REFUSED:
    case S.EXPIRED:
      return part.amount;
    case S.FAILED:
      return CUSTOMER_CAUSED_FAILURES.includes(input.reason ?? "")
        ? Math.max(0, part.amount - part.deliveryFee)
        : part.amount;
    case S.RETURNED:
      return input.resolution === "refund_partial" && input.refundAmount !== undefined
        ? Math.min(part.amount, input.refundAmount)
        : part.amount;
    default:
      return 0;
  }
};

/**
 * Répartit une réduction entre les sous-commandes, au prorata de leur
 * sous-total, en GNF entiers. Méthode du plus fort reste : la somme des parts
 * est exactement la réduction, aucun franc n'est perdu ni créé.
 */
export const allocateDiscount = (subtotals: readonly number[], discount: number): number[] => {
  const total = subtotals.reduce((sum, value) => sum + value, 0);
  if (discount <= 0 || total <= 0) return subtotals.map(() => 0);

  const exact = subtotals.map((value) => (value * discount) / total);
  const shares = exact.map(Math.floor);
  let left = discount - shares.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
};

/** Code de remise à 6 chiffres. */
export const generatePickupCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, "0");

// ── Onglets de l'espace commandes ───────────
/**
 * Les statuts regroupés comme l'écran d'une boutique les présente : ce qui
 * attend une réponse, ce qui se prépare, ce qui est en route, ce qui pose
 * problème, ce qui est fini.
 */
export const SHOP_ORDER_GROUPS = {
  todo: [S.PENDING],
  preparing: [S.CONFIRMED],
  delivering: [S.SHIPPED, S.READY_FOR_PICKUP],
  delivered: [S.DELIVERED],
  issues: [S.DELIVERY_FAILED, S.RETURN_REQUESTED, S.DISPUTED],
  done: [S.COMPLETED, S.CANCELLED, S.REFUSED, S.EXPIRED, S.FAILED, S.RETURNED],
} as const satisfies Record<string, readonly ShopOrderStatus[]>;

export type ShopOrderGroup = keyof typeof SHOP_ORDER_GROUPS;

export const SHOP_ORDER_GROUP_KEYS = Object.keys(SHOP_ORDER_GROUPS) as ShopOrderGroup[];

export const groupOf = (status: ShopOrderStatus): ShopOrderGroup | null =>
  SHOP_ORDER_GROUP_KEYS.find((group) => (SHOP_ORDER_GROUPS[group] as readonly ShopOrderStatus[]).includes(status)) ??
  null;

// ── Statut de la commande ───────────────────

/**
 * Le statut de la commande se déduit de ses sous-commandes : personne ne le
 * choisit. Le paiement en ligne échoué est fixé à part (payment.service).
 */
export const orderStatusFrom = (statuses: readonly ShopOrderStatus[]): OrderStatus => {
  if (statuses.length === 0) return OrderStatus.CANCELLED;
  if (statuses.includes(S.AWAITING_PAYMENT)) return OrderStatus.AWAITING_PAYMENT;
  if (!statuses.every((status) => SHOP_ORDER_TERMINAL.includes(status))) return OrderStatus.IN_PROGRESS;

  const completed = statuses.filter((status) => status === S.COMPLETED).length;
  if (completed === statuses.length) return OrderStatus.COMPLETED;
  if (completed === 0) return OrderStatus.CANCELLED;
  return OrderStatus.PARTIALLY_COMPLETED;
};
