import { createContext, type Dispatch, type SetStateAction } from "react";
import type { Cart } from "../../../../entities/cart";
import type { DeliverySelection } from "../../../../entities/delivery";

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
  /** Relit le panier : après une commande, le serveur l'a vidé. */
  refresh: () => Promise<void>;
  /**
   * Mode de livraison choisi par boutique. Il vit avec le panier pour
   * suivre le client du panier à la page de commande ; seuls des modes sont
   * gardés ici, jamais de montant.
   */
  deliverySelection: DeliverySelection;
  setDeliverySelection: Dispatch<SetStateAction<DeliverySelection>>;
}

// Contexte isolé du provider : un fichier qui exporte un composant ne doit
// exporter que des composants, pour que le Fast Refresh fonctionne.
export const CartContext = createContext<CartContextValue | null>(null);
