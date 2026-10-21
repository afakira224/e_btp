import type { ProductBoutique } from "../../../entities/product";
import type { DeliveryMethod, OrderStatus, ShippingAddress } from "../../../entities/order";
import { OFFERS } from "./catalogSeed";

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
  status: OrderStatus;
  statusHistory: { status: OrderStatus; changedAt: string; note?: string }[];
  deliveryMethod: DeliveryMethod;
  addressId: string | null;
  shippingAddress?: ShippingAddress;
  createdAt: string;
  updatedAt: string;
}

const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo: number, hours = 0): string =>
  new Date(Date.now() - daysAgo * DAY + hours * 60 * 60 * 1000).toISOString();

const FEES: Record<DeliveryMethod, number> = { pickup: 0, standard: 25_000, express: 50_000 };

const unitPrice = (offer: ProductBoutique): number =>
  offer.discountPrice != null && offer.discountPrice < offer.price
    ? offer.discountPrice
    : offer.price;

const line = (index: number, quantity: number): MockOrderItem => {
  const offer = OFFERS[index % OFFERS.length];
  if (!offer) throw new Error("Catalogue simulé vide.");
  return { productBoutiqueId: offer.id, price: unitPrice(offer), quantity };
};

export const seedAccountFor = (userId: string) => {
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

  const order = (spec: {
    n: number;
    daysAgo: number;
    items: MockOrderItem[];
    method: DeliveryMethod;
    address?: MockAddress;
    history: [OrderStatus, number][];
    discount?: number;
    code?: string;
  }): MockOrder => {
    const subtotal = spec.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discountAmount = spec.discount ?? 0;
    const shippingFee = FEES[spec.method];
    const statusHistory = spec.history.map(([status, daysAgo]) => ({
      status,
      changedAt: at(daysAgo, 2),
    }));
    const last = statusHistory[statusHistory.length - 1];

    return {
      id: `cmd-${userId}-${spec.n}`,
      userId,
      reference: `CMD-${Date.parse(at(spec.daysAgo)).toString()}-${100000 + spec.n * 7919}`,
      items: spec.items,
      subtotal,
      discountAmount,
      promotionCode: spec.code ?? null,
      shippingFee,
      amount: subtotal - discountAmount + shippingFee,
      status: last?.status ?? "pending",
      statusHistory,
      deliveryMethod: spec.method,
      addressId: spec.address?.id ?? null,
      ...(spec.address ? { shippingAddress: shippingOf(spec.address) } : {}),
      createdAt: at(spec.daysAgo),
      updatedAt: last?.changedAt ?? at(spec.daysAgo),
    };
  };

  const orders: MockOrder[] = [
    order({
      n: 1,
      daysAgo: 1,
      items: [line(0, 40), line(13, 2)],
      method: "express",
      address: chantier,
      history: [["pending", 1]],
    }),
    order({
      n: 2,
      daysAgo: 4,
      items: [line(2, 12), line(15, 6), line(16, 3)],
      method: "standard",
      address: maison,
      history: [
        ["pending", 4],
        ["confirmed", 3],
        ["shipped", 1],
      ],
    }),
    order({
      n: 3,
      daysAgo: 9,
      items: [line(6, 1)],
      method: "pickup",
      history: [
        ["pending", 9],
        ["confirmed", 9],
      ],
    }),
    order({
      n: 4,
      daysAgo: 21,
      items: [line(3, 4), line(19, 2), line(20, 1)],
      method: "standard",
      address: maison,
      history: [
        ["pending", 21],
        ["confirmed", 20],
        ["shipped", 19],
        ["delivered", 17],
      ],
      discount: 30_000,
      code: "BIENVENUE",
    }),
    order({
      n: 5,
      daysAgo: 35,
      items: [line(9, 2), line(12, 3)],
      method: "express",
      address: chantier,
      history: [
        ["pending", 35],
        ["cancelled", 34],
      ],
    }),
    order({
      n: 6,
      daysAgo: 60,
      items: [line(5, 1), line(10, 1), line(24, 5)],
      method: "standard",
      address: maison,
      history: [
        ["pending", 60],
        ["confirmed", 59],
        ["shipped", 58],
        ["delivered", 55],
      ],
    }),
  ];

  // L'annulation porte un motif, comme lorsqu'un dépôt refuse une commande.
  const cancelled = orders[4]?.statusHistory[1];
  if (cancelled) cancelled.note = "Rupture de stock chez le dépôt.";

  return { addresses: [maison, chantier], orders };
};
