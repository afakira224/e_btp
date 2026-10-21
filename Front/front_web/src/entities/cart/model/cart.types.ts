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
  /** Prix unitaire figé au moment de l'ajout. */
  unitPrice: number;
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
  /** Somme des `lineTotal`. */
  totalAmount: number;
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

/** Prix courant effectif de l'offre, remise comprise. */
export const currentPrice = (item: CartItem): number =>
  item.discountPrice != null && item.discountPrice < item.price
    ? item.discountPrice
    : item.price;

/**
 * Le prix a-t-il bougé depuis l'ajout ?
 * Le DTO expose à la fois le prix figé et le prix courant : autant le dire
 * à l'utilisateur plutôt que de le laisser découvrir l'écart au paiement.
 */
export const priceChanged = (item: CartItem): boolean =>
  currentPrice(item) !== item.unitPrice;

export const priceDelta = (item: CartItem): number =>
  currentPrice(item) - item.unitPrice;

/** La quantité au panier dépasse-t-elle le stock encore disponible ? */
export const exceedsStock = (item: CartItem): boolean => item.quantity > item.stock;

export const isOutOfStock = (item: CartItem): boolean => item.stock <= 0;

/** Une ligne est bloquante si elle empêche la commande de partir. */
export const hasBlockingIssue = (cart: Cart): boolean =>
  cart.items.some((item) => isOutOfStock(item) || exceedsStock(item));
