// ─────────────────────────────────────────────
//  ORDER - RESPONSE DTO
// ─────────────────────────────────────────────

import type {
  DeliveryMethod,
  IOrder,
  IShippingAddress,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
} from "../../models/order.model.js";
import { ShopOrderActor, type IShopOrder } from "../../models/shopOrder.model.js";
import type { IProduct, IProductBoutique } from "../../models/product.model.js";
import type { IShop } from "../../models/boutique.model.js";
import type { IFamille } from "../../models/famille.model.js";
import type { ICategorie } from "../../models/categorie.model.js";
import type { ISousCategorie } from "../../models/sousCategorie.model.js";
import {
  toProductBoutiqueResponseDto,
  toProductResponseDto,
  type ProductBoutiqueResponseDto,
  type ProductResponseDto,
} from "./product.interfaces.js";
import { toShopResponseDto, type ShopResponseDto } from "./Shop.interfaces.js";
import { toOrderDeliveryDto, type OrderDeliveryDto } from "./Delivery.interfaces.js";
import { toShopOrderResponseDto, type ShopOrderResponseDto, type ShopOrderViewer } from "./ShopOrder.interfaces.js";

export interface OrderItemResponseDto {
  productBoutique: ProductBoutiqueResponseDto;
  boutique?: ShopResponseDto | undefined;
  product?: ProductResponseDto | undefined;
  price: number;
  quantity: number;
  lineTotal: number; // price * quantity
}

// Une étape de la vie de la commande.
export interface OrderStatusHistoryDto {
  status: OrderStatus;
  changedAt: Date;
  changedBy?: string | undefined;
  note?: string | undefined;
}

export interface OrderResponseDto {
  id: string;
  userId: string;
  reference: string;
  /** Se déduit des sous-commandes : en cours, terminée, partiellement terminée, annulée… */
  status: OrderStatus;
  statusHistory: OrderStatusHistoryDto[];
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
  paidAt: Date | null;
  /** Échéance d'un paiement en ligne pas encore confirmé. */
  paymentExpiresAt: Date | null;
  /** Une sous-commande par boutique, chacune avec son statut et ses actions. */
  parts: ShopOrderResponseDto[];
  items: OrderItemResponseDto[];
  totalItems: number; // somme des quantités
  subtotal: number; // total des articles avant réduction
  discountAmount: number; // réduction appliquée
  promotionCode?: string | null | undefined;
  shippingFee: number; // frais de livraison = somme des frais de `deliveries`
  amount: number; // à payer = subtotal - discountAmount + shippingFee
  deliveryMethod: DeliveryMethod; // mode commun, "mixed" s'ils diffèrent
  deliveries: OrderDeliveryDto[]; // une livraison par boutique (vide sur les anciennes commandes)
  addressId?: string | null | undefined;
  shippingAddress?: IShippingAddress | undefined;
  telephone?: string | undefined;
  adresse?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// Les commandes ne stockent que des IDs (snapshot). Pour exposer les DTOs complets
// (productBoutique, boutique, product), on passe les documents résolus par le contrôleur.
export const toOrderResponseDto = (
  order: IOrder,
  productBoutiques: IProductBoutique[] = [],
  shops: IShop[] = [],
  products: IProduct[] = [],
  familles: IFamille[] = [],
  categories: ICategorie[] = [],
  sousCategories: ISousCategorie[] = [],
  parts: IShopOrder[] = [],
  viewer: ShopOrderViewer = "client"
): OrderResponseDto => {
  const actors = viewer === "admin" ? [ShopOrderActor.ADMIN] : viewer === "client" ? [ShopOrderActor.CLIENT] : [];
  const items: OrderItemResponseDto[] = order.items.map((item) => {
    const pb = productBoutiques.find(
      (p) => p._id.toString() === item.productBoutiqueId.toString()
    );
    const shop = item.boutiqueId
      ? shops.find((s) => s._id.toString() === item.boutiqueId!.toString())
      : undefined;
    const product = item.productId
      ? products.find((pr) => pr._id.toString() === item.productId!.toString())
      : undefined;

    return {
      productBoutique: pb
        ? toProductBoutiqueResponseDto(pb, shop, product, familles, categories, sousCategories)
        : (undefined as unknown as ProductBoutiqueResponseDto),
      boutique: shop ? toShopResponseDto(shop) : undefined,
      product: product
        ? toProductResponseDto(product, familles, categories, sousCategories)
        : undefined,
      price: item.price,
      quantity: item.quantity,
      lineTotal: item.price * item.quantity,
    };
  });

  return {
    id: order._id.toString(),
    userId: order.userId.toString(),
    reference: order.reference,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paidAt: order.paidAt ?? null,
    paymentExpiresAt: order.paymentExpiresAt ?? null,
    parts: parts
      .filter((part) => part.orderId.toString() === order._id.toString())
      .sort((a, b) => a.reference.localeCompare(b.reference, "fr", { numeric: true }))
      .map((part) => toShopOrderResponseDto(part, viewer, actors)),
    statusHistory: (order.statusHistory ?? []).map((h) => ({
      status: h.status,
      changedAt: h.changedAt,
      changedBy: h.changedBy?.toString(),
      note: h.note,
    })),
    items,
    totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    promotionCode: order.promotionCode,
    shippingFee: order.shippingFee ?? 0,
    amount: order.amount,
    deliveryMethod: order.deliveryMethod,
    deliveries: (order.deliveries ?? []).map(toOrderDeliveryDto),
    addressId: order.addressId ? order.addressId.toString() : null,
    shippingAddress: order.shippingAddress,
    telephone: order.telephone,
    adresse: order.adresse,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};
