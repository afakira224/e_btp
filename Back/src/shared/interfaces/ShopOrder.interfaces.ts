// ─────────────────────────────────────────────
//  SHOP ORDER (sous-commande) - RESPONSE DTO
//
//  Une même sous-commande se lit de trois places, et chacune voit ce qui la
//  concerne :
//   • le client voit son code de remise, jamais les coordonnées d'autrui ;
//   • la boutique voit l'adresse et le téléphone du client pour livrer, mais
//     jamais le code de remise — c'est le client qui le lui donne ;
//   • l'administration voit tout sauf le code.
//  `availableActions` = les boutons que CE lecteur peut actionner maintenant.
// ─────────────────────────────────────────────

import type { IShippingAddress } from "../../models/order.model.js";
import type {
  IShopOrder,
  IShopOrderCustomer,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
} from "../../models/shopOrder.model.js";
import type { PaymentMethod } from "../../models/order.model.js";
import {
  availableActions,
  CANCELLATION_REASONS,
  DELIVERY_FAILURE_REASONS,
  REFUSAL_REASONS,
  RETURN_REASONS,
  type ShopOrderAction,
} from "../helpers/shopOrder.workflow.js";
import { toOrderDeliveryDto, type OrderDeliveryDto } from "./Delivery.interfaces.js";

export type ShopOrderViewer = "client" | "shop" | "admin";

export interface ShopOrderItemDto {
  productBoutiqueId: string;
  productId?: string | undefined;
  productName?: string | undefined;
  urlImages: string[];
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface ShopOrderHistoryDto {
  status: ShopOrderStatus;
  changedAt: Date;
  actor: ShopOrderActor;
  reason?: string | undefined;
  /** Libellé du motif, prêt à afficher. */
  reasonLabel?: string | undefined;
  note?: string | undefined;
}

export interface ShopOrderResponseDto {
  id: string;
  orderId: string;
  reference: string;
  boutique: { id: string; nom?: string | undefined };
  items: ShopOrderItemDto[];
  totalItems: number;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  amount: number;
  delivery: OrderDeliveryDto;
  shippingAddress?: IShippingAddress | undefined;
  customer?: IShopOrderCustomer | undefined;
  payment: {
    method: PaymentMethod;
    status: ShopOrderPaymentStatus;
    paidAt: Date | null;
    refundedAmount: number;
    refundedAt: Date | null;
  };
  status: ShopOrderStatus;
  statusHistory: ShopOrderHistoryDto[];
  /** Client seulement. */
  pickupCode?: string | undefined;
  deliveryAttempts: number;
  return: {
    reason: string;
    reasonLabel: string;
    details?: string | undefined;
    photos: string[];
    requestedAt: Date;
    shopResponse?: string | undefined;
    respondedAt: Date | null;
    resolution?: string | undefined;
    resolutionNote?: string | undefined;
    resolvedAt: Date | null;
  } | null;
  /** Prochaine action automatique (expiration, clôture, litige). */
  deadlineAt: Date | null;
  availableActions: ShopOrderAction[];
  createdAt: Date;
  updatedAt: Date;
}

const ALL_REASONS: Record<string, string> = {
  ...CANCELLATION_REASONS,
  ...REFUSAL_REASONS,
  ...DELIVERY_FAILURE_REASONS,
  ...RETURN_REASONS,
};

export const reasonLabel = (reason: string | undefined): string | undefined =>
  reason ? ALL_REASONS[reason] ?? reason : undefined;

export const toShopOrderResponseDto = (
  part: IShopOrder,
  viewer: ShopOrderViewer,
  actors: readonly ShopOrderActor[],
  now = new Date()
): ShopOrderResponseDto => {
  const items = part.items.map((item) => ({
    productBoutiqueId: item.productBoutiqueId.toString(),
    productId: item.productId?.toString(),
    productName: item.productName,
    urlImages: item.urlImages ?? [],
    price: item.price,
    quantity: item.quantity,
    lineTotal: item.price * item.quantity,
  }));

  return {
    id: part._id.toString(),
    orderId: part.orderId.toString(),
    reference: part.reference,
    boutique: { id: part.boutiqueId.toString(), nom: part.boutiqueNom },
    items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: part.subtotal,
    discountAmount: part.discountAmount,
    deliveryFee: part.deliveryFee,
    amount: part.amount,
    delivery: toOrderDeliveryDto(part.delivery),
    shippingAddress: part.shippingAddress,
    customer: viewer === "client" ? undefined : part.customer,
    payment: {
      method: part.payment.method,
      status: part.payment.status,
      paidAt: part.payment.paidAt ?? null,
      refundedAmount: part.payment.refundedAmount ?? 0,
      refundedAt: part.payment.refundedAt ?? null,
    },
    status: part.status,
    statusHistory: (part.statusHistory ?? []).map((entry) => ({
      status: entry.status,
      changedAt: entry.changedAt,
      actor: entry.actor,
      reason: entry.reason,
      reasonLabel: reasonLabel(entry.reason),
      note: entry.note,
    })),
    pickupCode: viewer === "client" ? part.pickupCode : undefined,
    deliveryAttempts: part.deliveryAttempts ?? 0,
    return: part.return
      ? {
          reason: part.return.reason,
          reasonLabel: reasonLabel(part.return.reason) ?? part.return.reason,
          details: part.return.details,
          photos: part.return.photos ?? [],
          requestedAt: part.return.requestedAt,
          shopResponse: part.return.shopResponse,
          respondedAt: part.return.respondedAt ?? null,
          resolution: part.return.resolution,
          resolutionNote: part.return.resolutionNote,
          resolvedAt: part.return.resolvedAt ?? null,
        }
      : null,
    deadlineAt: part.deadlineAt ?? null,
    availableActions: availableActions(actors, part, now),
    createdAt: part.createdAt,
    updatedAt: part.updatedAt,
  };
};
