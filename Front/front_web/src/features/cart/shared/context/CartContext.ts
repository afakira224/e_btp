import { createContext } from "react";
import type { Cart } from "../../../../entities/cart";

export interface CartContextValue {
  cart: Cart;
  /** Somme des quantités — ce dont l'en-tête a besoin. */
  count: number;
  isLoading: boolean;
  /** Lèvent une ApiError : 400 stock insuffisant, 401 hors session. */
  add: (productBoutiqueId: string, quantity?: number) => Promise<void>;
  setQuantity: (productBoutiqueId: string, quantity: number) => Promise<void>;
  remove: (productBoutiqueId: string) => Promise<void>;
  clear: () => Promise<void>;
}

// Contexte isolé du provider : un fichier qui exporte un composant ne doit
// exporter que des composants, pour que le Fast Refresh fonctionne.
export const CartContext = createContext<CartContextValue | null>(null);
