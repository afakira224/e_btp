import { DeliveryMode } from "../../../entities/delivery";
import {
  CANCELLATION_REASONS,
  DELIVERY_FAILURE_REASONS,
  OrderStatus,
  REFUSAL_REASONS,
  RETURN_REASONS,
  SHOP_ORDER_TERMINAL,
  ShopOrderAction,
  ShopOrderActor,
  ShopOrderStatus,
  type OrderDelivery,
  type Resolution,
  type ShopOrderPaymentStatus,
} from "../../../entities/order";

// ─────────────────────────────────────────────
//  Cycle de vie d'une sous-commande — les règles.
//
//  Copie de Back/src/shared/helpers/shopOrder.workflow.ts, comme
//  deliveryRules.ts l'est des règles de livraison : mêmes actions, mêmes
//  acteurs, mêmes délais et mêmes messages. Le mode simulé tient lieu de
//  serveur : c'est lui, pas l'écran, qui décide si une action est permise.
// ─────────────────────────────────────────────

/** Actions que seule la plateforme déclenche, à l'échéance d'un délai. */
export type AutoAction = "expire" | "complete" | "escalate";
export type AnyAction = ShopOrderAction | AutoAction;

const ALL_REASONS: Record<string, string> = {
  ...CANCELLATION_REASONS,
  ...REFUSAL_REASONS,
  ...DELIVERY_FAILURE_REASONS,
  ...RETURN_REASONS,
};

export const reasonLabel = (reason: string | undefined): string | undefined =>
  reason ? (ALL_REASONS[reason] ?? reason) : undefined;

/** Échecs dont le client est la cause : ses frais de livraison ne lui sont pas rendus. */
export const CUSTOMER_CAUSED_FAILURES: readonly string[] = ["customer_absent", "parcel_refused"];
export const RETURN_REASONS_NEEDING_PHOTO: readonly string[] = ["damaged"];
export const MAX_DELIVERY_ATTEMPTS = 2;

interface ActionRule {
  actors: readonly ShopOrderActor[];
  from: readonly ShopOrderStatus[];
  to: ShopOrderStatus | null;
  reasons?: Readonly<Record<string, string>>;
  reasonRequired?: boolean;
}

const { CLIENT, SHOP, ADMIN, SYSTEM } = ShopOrderActor;
const S = ShopOrderStatus;

export const ACTION_RULES: Record<AnyAction, ActionRule> = {
  confirm: { actors: [SHOP], from: [S.PENDING], to: S.CONFIRMED },
  refuse: {
    actors: [SHOP],
    from: [S.PENDING, S.CONFIRMED],
    to: S.REFUSED,
    reasons: REFUSAL_REASONS,
    reasonRequired: true,
  },
  ship: { actors: [SHOP], from: [S.CONFIRMED], to: S.SHIPPED },
  ready: { actors: [SHOP], from: [S.CONFIRMED], to: S.READY_FOR_PICKUP },
  deliver: { actors: [SHOP], from: [S.SHIPPED, S.READY_FOR_PICKUP], to: S.DELIVERED },
  "delivery-failed": {
    actors: [SHOP],
    from: [S.SHIPPED],
    to: S.DELIVERY_FAILED,
    reasons: DELIVERY_FAILURE_REASONS,
    reasonRequired: true,
  },
  retry: { actors: [SHOP], from: [S.DELIVERY_FAILED], to: S.SHIPPED },
  abandon: { actors: [SHOP], from: [S.DELIVERY_FAILED], to: S.FAILED },
  cancel: { actors: [CLIENT], from: [S.PENDING, S.CONFIRMED], to: S.CANCELLED, reasons: CANCELLATION_REASONS },
  "admin-cancel": {
    actors: [ADMIN],
    from: [S.PENDING, S.CONFIRMED, S.SHIPPED, S.READY_FOR_PICKUP, S.DELIVERY_FAILED],
    to: S.CANCELLED,
  },
  return: { actors: [CLIENT], from: [S.DELIVERED], to: S.RETURN_REQUESTED, reasons: RETURN_REASONS, reasonRequired: true },
  "accept-return": { actors: [SHOP], from: [S.RETURN_REQUESTED], to: S.RETURNED },
  "reject-return": { actors: [SHOP], from: [S.RETURN_REQUESTED], to: S.DISPUTED },
  "resolve-dispute": { actors: [ADMIN], from: [S.DISPUTED], to: null },
  "confirm-refund": { actors: [SHOP, ADMIN], from: [S.RETURNED], to: null },
  expire: { actors: [SYSTEM], from: [S.PENDING, S.READY_FOR_PICKUP], to: S.EXPIRED },
  complete: { actors: [SYSTEM], from: [S.DELIVERED], to: S.COMPLETED },
  escalate: { actors: [SYSTEM], from: [S.RETURN_REQUESTED], to: S.DISPUTED },
};

export const MANUAL_ACTIONS = (Object.keys(ACTION_RULES) as AnyAction[]).filter(
  (action): action is ShopOrderAction => !ACTION_RULES[action].actors.includes(SYSTEM)
);

export const isManualAction = (value: unknown): value is ShopOrderAction =>
  typeof value === "string" && (MANUAL_ACTIONS as readonly string[]).includes(value);

export interface RuleInput {
  reason?: string | undefined;
  note?: string | undefined;
  code?: string | undefined;
  resolution?: Resolution | undefined;
  refundAmount?: number | undefined;
  photos?: string[] | undefined;
}

export interface RulePart {
  status: ShopOrderStatus;
  delivery: OrderDelivery;
  deliveryAttempts: number;
  pickupCode: string;
  amount: number;
  payment: { status: ShopOrderPaymentStatus };
  deadlineAt: string | null;
}

const STATUS_LABELS: Record<ShopOrderStatus, string> = {
  awaiting_payment: "en attente de paiement",
  pending: "à confirmer",
  confirmed: "en préparation",
  shipped: "en livraison",
  ready_for_pickup: "prête au retrait",
  delivery_failed: "livraison échouée",
  delivered: "livrée",
  return_requested: "retour demandé",
  disputed: "en litige",
  completed: "terminée",
  cancelled: "annulée",
  refused: "refusée",
  expired: "expirée",
  failed: "échec de livraison",
  returned: "retournée",
};

export const isPickup = (part: Pick<RulePart, "delivery">): boolean => part.delivery.method === DeliveryMode.PICKUP;

const passed = (deadline: string | null, now: Date) =>
  deadline !== null && new Date(deadline).getTime() <= now.getTime();

/** Message qui interdit l'action, ou null si elle est permise. */
export const checkAction = (
  action: AnyAction,
  actors: readonly ShopOrderActor[],
  part: RulePart,
  input: RuleInput,
  now: Date
): string | null => {
  const rule = ACTION_RULES[action];
  if (!rule.actors.some((actor) => actors.includes(actor))) {
    return "Vous ne pouvez pas effectuer cette action sur cette commande.";
  }
  if (!rule.from.includes(part.status)) return `Action impossible : la commande est ${STATUS_LABELS[part.status]}.`;

  if (rule.reasons) {
    if (input.reason === undefined || input.reason === "") {
      if (rule.reasonRequired) return "Le motif est requis.";
    } else if (!(input.reason in rule.reasons)) {
      return `Motif invalide. Valeurs acceptées : ${Object.keys(rule.reasons).join(", ")}.`;
    }
    if (input.reason === "other" && !input.note?.trim()) return "Précisez le motif « Autre ».";
  }

  switch (action) {
    case "ship":
      if (isPickup(part)) return "Une commande à retirer en boutique ne s'expédie pas : mettez-la à disposition.";
      break;
    case "ready":
      if (!isPickup(part)) return "Seule une commande à retirer en boutique se met à disposition.";
      break;
    case "deliver":
      if (!input.code || input.code.trim() !== part.pickupCode) return "Code de remise incorrect.";
      break;
    case "retry":
      if (part.deliveryAttempts >= MAX_DELIVERY_ATTEMPTS) {
        return `${MAX_DELIVERY_ATTEMPTS} tentatives de livraison au plus : abandonnez la livraison.`;
      }
      break;
    case "return":
      if (passed(part.deadlineAt, now)) return "Le délai de retour est dépassé.";
      if (RETURN_REASONS_NEEDING_PHOTO.includes(input.reason ?? "") && !input.photos?.length) {
        return "Joignez au moins une photo du produit abîmé.";
      }
      break;
    case "reject-return":
      if (!input.note?.trim()) return "Expliquez pourquoi vous refusez ce retour.";
      break;
    case "resolve-dispute":
      if (!input.resolution) return "La décision est requise : refund_full, refund_partial ou rejected.";
      if (!input.note?.trim()) return "Motivez la décision : le client et la boutique la liront.";
      if (input.resolution === "refund_partial") {
        const amount = input.refundAmount;
        if (amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 || amount >= part.amount) {
          return `Le remboursement partiel doit être un entier entre 1 et ${part.amount - 1} GNF.`;
        }
      }
      break;
    case "confirm-refund":
      if (part.payment.status !== "refund_pending") return "Aucun remboursement n'est en attente.";
      break;
    default:
      break;
  }
  return null;
};

export const availableActions = (
  actors: readonly ShopOrderActor[],
  part: RulePart,
  now: Date
): ShopOrderAction[] =>
  MANUAL_ACTIONS.filter((action) => {
    const rule = ACTION_RULES[action];
    if (!rule.actors.some((actor) => actors.includes(actor)) || !rule.from.includes(part.status)) return false;
    switch (action) {
      case "ship":
        return !isPickup(part);
      case "ready":
        return isPickup(part);
      case "retry":
        return part.deliveryAttempts < MAX_DELIVERY_ATTEMPTS;
      case "return":
        return !passed(part.deadlineAt, now);
      case "confirm-refund":
        return part.payment.status === "refund_pending";
      default:
        return true;
    }
  });

export const targetStatus = (action: AnyAction, input: RuleInput, part: Pick<RulePart, "status">): ShopOrderStatus => {
  if (action === "resolve-dispute") return input.resolution === "rejected" ? S.COMPLETED : S.RETURNED;
  return ACTION_RULES[action].to ?? part.status;
};

// ── Délais ──────────────────────────────────
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEADLINES = {
  payment: 30 * MINUTE,
  confirm: 48 * HOUR,
  confirmReminder: 24 * HOUR,
  pickup: 7 * DAY,
  pickupReminder: 3 * DAY,
  returnWindow: 7 * DAY,
  returnResponse: 48 * HOUR,
  returnResponseReminder: 24 * HOUR,
  shippingStall: 7 * DAY,
} as const;

export interface Schedule {
  deadlineAt: string | null;
  reminderAt: string | null;
}

export const scheduleFor = (status: ShopOrderStatus, now: Date): Schedule => {
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
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

export const AUTO_ACTIONS: Partial<Record<ShopOrderStatus, AutoAction>> = {
  pending: "expire",
  ready_for_pickup: "expire",
  delivered: "complete",
  return_requested: "escalate",
};

// ── Argent ──────────────────────────────────
export const refundAmountFor = (
  part: { amount: number; deliveryFee: number },
  status: ShopOrderStatus,
  input: Pick<RuleInput, "reason" | "resolution" | "refundAmount">
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

/** Réduction répartie au prorata des sous-totaux, méthode du plus fort reste. */
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

export const generatePickupCode = (): string =>
  Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");

export const orderStatusFrom = (statuses: readonly ShopOrderStatus[]): OrderStatus => {
  if (statuses.length === 0) return OrderStatus.CANCELLED;
  if (statuses.includes(S.AWAITING_PAYMENT)) return OrderStatus.AWAITING_PAYMENT;
  if (!statuses.every((status) => SHOP_ORDER_TERMINAL.includes(status))) return OrderStatus.IN_PROGRESS;
  const completed = statuses.filter((status) => status === S.COMPLETED).length;
  if (completed === statuses.length) return OrderStatus.COMPLETED;
  if (completed === 0) return OrderStatus.CANCELLED;
  return OrderStatus.PARTIALLY_COMPLETED;
};
