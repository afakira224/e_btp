import type { ProductBoutique } from "../../../entities/product";
import { DeliveryMode, isDeliveryMode } from "../../../entities/delivery";
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  SHOP_ORDER_NEGATIVE_END,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
  type DeliveryMethod,
  type OrderDelivery,
  type Resolution,
  type ShippingAddress,
} from "../../../entities/order";
import { OFFERS } from "./catalogSeed";
import {
  quoteDelivery,
  resolveEffective,
  seedOfferDelivery,
  seedShopDelivery,
  summaryMethod,
  toOrderDeliveries,
  toSettingsDto,
} from "./deliveryRules";
import { allocateDiscount, generatePickupCode, orderStatusFrom, scheduleFor } from "./shopOrderRules";

// ─────────────────────────────────────────────
//  Données de compte simulées : adresses et commandes.
//
//  Documents stockés tels que le back les garde (Back/src/models/
//  address.model.ts et order.model.ts) : les commandes ne portent que des
//  identifiants d'offre et un prix figé ; l'enrichissement en DTO se fait
//  à la lecture, comme dans le contrôleur.
// ─────────────────────────────────────────────

export interface MockAddress {
  id: string;
  userId: string;
  label?: string | undefined;
  destinataire?: string | undefined;
  telephone: string;
  adresse: string;
  ville: string;
  commune?: string | undefined;
  pays: string;
  isDefault: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockOrderItem {
  productBoutiqueId: string;
  price: number;
  quantity: number;
}

export interface MockOrder {
  id: string;
  userId: string;
  reference: string;
  items: MockOrderItem[];
  subtotal: number;
  discountAmount: number;
  promotionCode: string | null;
  shippingFee: number;
  amount: number;
  /** Se déduit des sous-commandes (orderStatusFrom). */
  status: OrderStatus;
  statusHistory: { status: OrderStatus; changedAt: string; note?: string }[];
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
  paidAt: string | null;
  paymentExpiresAt: string | null;
  paymentRef?: string | undefined;
  deliveryMethod: DeliveryMethod;
  /** Une livraison par boutique, figée ; vide sur les commandes d'avant les modes par boutique. */
  deliveries: OrderDelivery[];
  addressId: string | null;
  shippingAddress?: ShippingAddress;
  createdAt: string;
  updatedAt: string;
}

/** Sous-commande telle que Back/src/models/shopOrder.model.ts la stocke. */
export interface MockShopOrder {
  id: string;
  orderId: string;
  userId: string;
  boutiqueId: string;
  boutiqueNom?: string | undefined;
  reference: string;
  items: MockOrderItem[];
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  amount: number;
  delivery: OrderDelivery;
  shippingAddress?: ShippingAddress | undefined;
  customer: { nom: string; prenom: string; telephone?: string | undefined };
  payment: {
    method: PaymentMethod;
    status: ShopOrderPaymentStatus;
    paidAt: string | null;
    refundedAmount: number;
    refundedAt: string | null;
  };
  status: ShopOrderStatus;
  statusHistory: {
    status: ShopOrderStatus;
    changedAt: string;
    actor: ShopOrderActor;
    changedBy?: string | undefined;
    reason?: string | undefined;
    note?: string | undefined;
  }[];
  pickupCode: string;
  deliveryAttempts: number;
  return: {
    reason: string;
    details?: string | undefined;
    photos: string[];
    requestedAt: string;
    shopResponse?: string | undefined;
    respondedAt: string | null;
    resolution?: Resolution | undefined;
    resolutionNote?: string | undefined;
    resolvedAt: string | null;
  } | null;
  deadlineAt: string | null;
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo: number, hours = 0): string =>
  new Date(Date.now() - daysAgo * DAY + hours * 60 * 60 * 1000).toISOString();

// Frais des anciens modes, comme LEGACY_DELIVERY_FEES côté back.
const LEGACY_FEES: Partial<Record<DeliveryMethod, number>> = { standard: 25_000, express: 50_000 };

/** Offre de départ avec sa livraison de départ : la base n'existe pas encore au seed. */
const seededOffer = (offer: ProductBoutique): ProductBoutique => {
  const shopId = offer.boutique?.id ?? "";
  const shop = seedShopDelivery(shopId);
  return {
    ...offer,
    ...(offer.boutique ? { boutique: { ...offer.boutique, delivery: toSettingsDto(shop) } } : {}),
    delivery: resolveEffective(seedOfferDelivery(offer.id), shop),
  };
};

/**
 * Instantané comme au checkout : le mode demandé pour chaque boutique, ou
 * le premier qu'elle propose quand elle ne le connaît pas.
 */
const snapshot = (items: MockOrderItem[], method: DeliveryMethod): OrderDelivery[] => {
  if (!isDeliveryMode(method)) return [];
  const lines = items.flatMap((item) => {
    const offer = OFFERS.find((candidate) => candidate.id === item.productBoutiqueId);
    return offer ? [{ offer: seededOffer(offer), quantity: item.quantity }] : [];
  });
  const quote = quoteDelivery(lines, { all: method });
  const byShop = Object.fromEntries(
    quote.groups.map((g) => [g.boutiqueId, g.selectedMethod ?? g.options[0]?.method ?? method])
  );
  return toOrderDeliveries(quoteDelivery(lines, { byShop }));
};

const unitPrice = (offer: ProductBoutique): number =>
  offer.discountPrice != null && offer.discountPrice < offer.price
    ? offer.discountPrice
    : offer.price;

const line = (index: number, quantity: number): MockOrderItem => {
  const offer = OFFERS[index % OFFERS.length];
  if (!offer) throw new Error("Catalogue simulé vide.");
  return { productBoutiqueId: offer.id, price: unitPrice(offer), quantity };
};

const DEFAULT_ACTORS: Record<ShopOrderStatus, ShopOrderActor> = {
  awaiting_payment: ShopOrderActor.CLIENT,
  pending: ShopOrderActor.CLIENT,
  confirmed: ShopOrderActor.SHOP,
  shipped: ShopOrderActor.SHOP,
  ready_for_pickup: ShopOrderActor.SHOP,
  delivery_failed: ShopOrderActor.SHOP,
  delivered: ShopOrderActor.SHOP,
  return_requested: ShopOrderActor.CLIENT,
  disputed: ShopOrderActor.SHOP,
  completed: ShopOrderActor.SYSTEM,
  cancelled: ShopOrderActor.CLIENT,
  refused: ShopOrderActor.SHOP,
  expired: ShopOrderActor.SYSTEM,
  failed: ShopOrderActor.SHOP,
  returned: ShopOrderActor.SHOP,
};

const shopOfOffer = (offerId: string): string | undefined =>
  OFFERS.find((candidate) => candidate.id === offerId)?.boutique?.id;

export interface SeedCustomer {
  nom: string;
  prenom: string;
  telephone?: string | undefined;
}

export const seedAccountFor = (
  userId: string,
  customer: SeedCustomer = { nom: "Diallo", prenom: "Mamadou", telephone: "620000000" }
) => {
  const maison: MockAddress = {
    id: `adr-${userId}-maison`,
    userId,
    label: "Maison",
    destinataire: "Mamadou Diallo",
    telephone: "620000000",
    adresse: "Quartier Kipé, rue KA-028, villa 12",
    ville: "Conakry",
    commune: "Ratoma",
    pays: "Guinée",
    isDefault: true,
    deletedAt: null,
    createdAt: at(90),
    updatedAt: at(90),
  };
  const chantier: MockAddress = {
    id: `adr-${userId}-chantier`,
    userId,
    label: "Chantier Lambanyi",
    destinataire: "Chef de chantier — Ibrahima Sow",
    telephone: "621234567",
    adresse: "Lambanyi, derrière la station, parcelle 45",
    ville: "Conakry",
    commune: "Ratoma",
    pays: "Guinée",
    isDefault: false,
    deletedAt: null,
    createdAt: at(40),
    updatedAt: at(40),
  };

  const shippingOf = (address: MockAddress): ShippingAddress => ({
    destinataire: address.destinataire,
    telephone: address.telephone,
    adresse: address.adresse,
    ville: address.ville,
    commune: address.commune,
    pays: address.pays,
  });

  // Une étape : [statut, il y a combien de jours, précisions].
  type Step = [ShopOrderStatus, number, { reason?: string; note?: string }?];

  const order = (spec: {
    n: number;
    daysAgo: number;
    items: MockOrderItem[];
    method: DeliveryMethod;
    address?: MockAddress;
    payment?: PaymentMethod;
    /** Parcours de chaque boutique, par nom ; « à confirmer » par défaut. */
    flows: Record<string, Step[]>;
    discount?: number;
    code?: string;
  }): { order: MockOrder; parts: MockShopOrder[] } => {
    const subtotal = spec.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discountAmount = spec.discount ?? 0;
    const deliveries = snapshot(spec.items, spec.method);
    const deliveryMethod = isDeliveryMode(spec.method)
      ? summaryMethod(deliveries.map((d) => d.method))
      : spec.method;
    const shippingFee = isDeliveryMode(spec.method)
      ? deliveries.reduce((sum, d) => sum + d.fee, 0)
      : (LEGACY_FEES[spec.method] ?? 0);
    const paymentMethod = spec.payment ?? PaymentMethod.ON_DELIVERY;
    const id = `cmd-${userId}-${spec.n}`;
    const reference = `CMD-${Date.parse(at(spec.daysAgo)).toString()}-${100000 + spec.n * 7919}`;

    const groups = deliveries.map((delivery) => ({
      delivery,
      items: spec.items.filter((item) => shopOfOffer(item.productBoutiqueId) === delivery.boutiqueId),
    }));
    const subtotals = groups.map((group) => group.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const shares = allocateDiscount(subtotals, discountAmount);

    const parts = groups.map((group, index): MockShopOrder => {
      const steps: Step[] = spec.flows[group.delivery.boutiqueNom ?? ""] ?? [[ShopOrderStatus.PENDING, spec.daysAgo]];
      const history = steps.map(([status, daysAgo, extra]) => ({
        status,
        changedAt: at(daysAgo, 1),
        actor: DEFAULT_ACTORS[status],
        ...(extra?.reason ? { reason: extra.reason } : {}),
        note: extra?.note ?? (status === ShopOrderStatus.PENDING ? "Commande passée" : undefined),
      }));
      const last = history[history.length - 1]!;
      const timeOf = (status: ShopOrderStatus) => history.find((entry) => entry.status === status)?.changedAt;
      const delivered = timeOf(ShopOrderStatus.DELIVERED) ?? null;
      const negative = SHOP_ORDER_NEGATIVE_END.includes(last.status);
      const partSubtotal = subtotals[index] ?? 0;
      const partDiscount = shares[index] ?? 0;
      const amount = Math.max(0, partSubtotal - partDiscount) + group.delivery.fee;
      const online = paymentMethod === PaymentMethod.ONLINE;
      const paidAt = online ? at(spec.daysAgo) : delivered;
      const returnStep = history.find((entry) => entry.status === ShopOrderStatus.RETURN_REQUESTED);
      const answer = history.find((entry) => entry.status === ShopOrderStatus.DISPUTED);
      const schedule = scheduleFor(last.status, new Date(last.changedAt));

      return {
        id: `so-${userId}-${spec.n}-${index + 1}`,
        orderId: id,
        userId,
        boutiqueId: group.delivery.boutiqueId,
        boutiqueNom: group.delivery.boutiqueNom,
        reference: `${reference}-${index + 1}`,
        items: group.items,
        subtotal: partSubtotal,
        discountAmount: partDiscount,
        deliveryFee: group.delivery.fee,
        amount,
        delivery: group.delivery,
        ...(spec.address && group.delivery.method !== DeliveryMode.PICKUP
          ? { shippingAddress: shippingOf(spec.address) }
          : {}),
        customer: { nom: customer.nom, prenom: customer.prenom, telephone: customer.telephone },
        payment: {
          method: paymentMethod,
          status: negative
            ? online
              ? ShopOrderPaymentStatus.REFUNDED
              : ShopOrderPaymentStatus.VOID
            : paidAt
              ? ShopOrderPaymentStatus.PAID
              : ShopOrderPaymentStatus.UNPAID,
          paidAt,
          refundedAmount: negative && online ? amount : 0,
          refundedAt: negative && online ? last.changedAt : null,
        },
        status: last.status,
        statusHistory: history,
        pickupCode: generatePickupCode(),
        deliveryAttempts: history.filter((entry) => entry.status === ShopOrderStatus.SHIPPED).length,
        return: returnStep
          ? {
              reason: returnStep.reason ?? "not_as_described",
              details: returnStep.note,
              photos: [],
              requestedAt: returnStep.changedAt,
              shopResponse: answer?.note,
              respondedAt: answer?.changedAt ?? null,
              resolvedAt: null,
            }
          : null,
        deadlineAt: schedule.deadlineAt,
        reminderAt: schedule.reminderAt,
        createdAt: at(spec.daysAgo),
        updatedAt: last.changedAt,
      };
    });

    const status = orderStatusFrom(parts.map((part) => part.status));
    const updatedAt = parts.map((part) => part.updatedAt).sort().pop() ?? at(spec.daysAgo);
    return {
      order: {
        id,
        userId,
        reference,
        items: spec.items,
        subtotal,
        discountAmount,
        promotionCode: spec.code ?? null,
        shippingFee,
        amount: subtotal - discountAmount + shippingFee,
        status,
        statusHistory: [
          { status: OrderStatus.IN_PROGRESS, changedAt: at(spec.daysAgo), note: "Commande créée" },
          ...(status !== OrderStatus.IN_PROGRESS ? [{ status, changedAt: updatedAt }] : []),
        ],
        paymentMethod,
        paymentStatus: paymentMethod === PaymentMethod.ONLINE ? OrderPaymentStatus.PAID : OrderPaymentStatus.ON_DELIVERY,
        paidAt: paymentMethod === PaymentMethod.ONLINE ? at(spec.daysAgo) : null,
        paymentExpiresAt: null,
        deliveryMethod,
        deliveries,
        addressId: spec.address?.id ?? null,
        ...(spec.address ? { shippingAddress: shippingOf(spec.address) } : {}),
        createdAt: at(spec.daysAgo),
        updatedAt,
      },
      parts,
    };
  };

  const { PENDING, CONFIRMED, SHIPPED, READY_FOR_PICKUP, DELIVERED, RETURN_REQUESTED, DISPUTED, COMPLETED, REFUSED } =
    ShopOrderStatus;

  // Le gérant de démonstration (Volta Électrique) retrouve une commande dans
  // chaque onglet ; l'administration, un litige à trancher.
  const built = [
    order({
      n: 1,
      daysAgo: 0.2,
      items: [line(0, 40), line(25, 2)],
      method: "flat_rate",
      address: chantier,
      flows: {},
    }),
    order({
      n: 2,
      daysAgo: 4,
      items: [line(2, 12), line(15, 6), line(10, 3)],
      method: "flat_rate",
      address: maison,
      flows: {
        "Kaloum Céramique": [[PENDING, 4], [CONFIRMED, 3], [SHIPPED, 1]],
        "Volta Électrique": [[PENDING, 4], [CONFIRMED, 3]],
      },
    }),
    order({
      n: 3,
      daysAgo: 2,
      items: [line(6, 1)],
      method: "pickup",
      flows: { "Pro Outillage": [[PENDING, 2], [CONFIRMED, 1.9], [READY_FOR_PICKUP, 1]] },
    }),
    order({
      n: 4,
      daysAgo: 3,
      items: [line(24, 5)],
      method: "flat_rate",
      address: maison,
      payment: PaymentMethod.ONLINE,
      flows: { "Volta Électrique": [[PENDING, 3], [CONFIRMED, 2.9], [SHIPPED, 2], [DELIVERED, 1]] },
    }),
    order({
      n: 5,
      daysAgo: 8,
      items: [line(4, 1), line(26, 2)],
      method: "flat_rate",
      address: chantier,
      flows: {
        "Sanitaire Plus": [
          [PENDING, 8],
          [CONFIRMED, 7.9],
          [SHIPPED, 7],
          [DELIVERED, 6],
          [RETURN_REQUESTED, 5, { reason: "not_as_described", note: "La teinte ne correspond pas à la photo de l'annonce." }],
          [DISPUTED, 4.5, { note: "Le modèle livré est celui commandé : la référence figure sur le bon de livraison." }],
        ],
        "Volta Électrique": [
          [PENDING, 8],
          [CONFIRMED, 7.9],
          [SHIPPED, 6],
          [DELIVERED, 5],
          [RETURN_REQUESTED, 0.5, { reason: "incomplete", note: "Il manque un rouleau sur les deux commandés." }],
        ],
      },
    }),
    order({
      n: 6,
      daysAgo: 21,
      items: [line(3, 4), line(19, 2), line(20, 1)],
      method: "flat_rate",
      address: maison,
      flows: { "Coloris Conakry": [[PENDING, 21], [CONFIRMED, 20], [SHIPPED, 19], [DELIVERED, 17], [COMPLETED, 10]] },
      discount: 30_000,
      code: "BIENVENUE",
    }),
    order({
      n: 7,
      daysAgo: 35,
      items: [line(9, 2), line(12, 3)],
      method: "flat_rate",
      address: chantier,
      flows: { "Dépôt Matam": [[PENDING, 35], [REFUSED, 34, { reason: "out_of_stock", note: "Rupture de stock chez le dépôt." }]] },
    }),
    order({
      n: 8,
      daysAgo: 60,
      items: [line(5, 1), line(10, 1), line(24, 5)],
      method: "flat_rate",
      address: maison,
      flows: { "Volta Électrique": [[PENDING, 60], [CONFIRMED, 59], [SHIPPED, 58], [DELIVERED, 55], [COMPLETED, 48]] },
    }),
  ];

  const orders = built.map((entry) => entry.order);
  const shopOrders = built.flatMap((entry) => entry.parts);

  return { addresses: [maison, chantier], orders, shopOrders };
};
