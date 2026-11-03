// ─────────────────────────────────────────────
//  Panier — miroir de CartResponseDto
//  (Back/src/shared/interfaces/Cart.interfaces.ts).
//
//  À noter : contrairement aux favoris, les lignes de panier sont
//  **aplaties** — elles portent directement `productName`, `urlImages` et
//  `stock` au lieu d'imbriquer une offre complète.
// ─────────────────────────────────────────────

export interface CartItem {
  productBoutiqueId: string;
  productId?: string | undefined;
  productName?: string | undefined;
  urlImages: string[];
  /** Prix courant de l'offre, indicatif. */
  price: number;
  /** Absent ou null quand l'offre n'est pas remisée (le back envoie null). */
  discountPrice?: number | null | undefined;
  /** Prix unitaire en vigueur pour cette quantité : promotion et palier compris (le checkout le recalcule). */
  unitPrice: number;
  /** Prix unitaire vu à l'ajout ; différent quand une promotion a commencé ou fini depuis. */
  addedUnitPrice?: number | undefined;
  priceChanged?: boolean | undefined;
  /** Économie de la ligne par rapport au prix de base. */
  savings?: number | undefined;
  pricing?: import("../../product").OfferPricing | undefined;
  quantity: number;
  stock: number;
  /** `unitPrice * quantity`. */
  lineTotal: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  /** Somme des quantités. */
  totalItems: number;
  /** Somme des `lineTotal`, aux prix en vigueur. */
  totalAmount: number;
  /** Économies du panier par rapport aux prix de base. */
  totalSavings?: number | undefined;
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_CART: Cart = {
  id: "",
  userId: "",
  items: [],
  totalItems: 0,
  totalAmount: 0,
  createdAt: "",
  updatedAt: "",
};

// ─────────────────────────────────────────────
//  Lectures utiles à l'affichage
// ─────────────────────────────────────────────

/** Prix unitaire payé aujourd'hui, promotion et palier compris. */
export const currentPrice = (item: CartItem): number => item.unitPrice;

/**
 * Le prix a-t-il bougé depuis l'ajout ? Une promotion a commencé ou fini :
 * autant le dire plutôt que de le laisser découvrir au paiement.
 */
export const priceChanged = (item: CartItem): boolean =>
  item.priceChanged ?? (item.addedUnitPrice !== undefined && item.addedUnitPrice !== item.unitPrice);

export const priceDelta = (item: CartItem): number => item.unitPrice - (item.addedUnitPrice ?? item.unitPrice);

/** La quantité au panier dépasse-t-elle le stock encore disponible ? */
export const exceedsStock = (item: CartItem): boolean => item.quantity > item.stock;

export const isOutOfStock = (item: CartItem): boolean => item.stock <= 0;

/** Une ligne est bloquante si elle empêche la commande de partir. */
export const hasBlockingIssue = (cart: Cart): boolean =>
  cart.items.some((item) => isOutOfStock(item) || exceedsStock(item));
