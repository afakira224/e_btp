import { createContext } from "react";
import type { Wishlist } from "../../../../entities/wishlist";

export interface WishlistContextValue {
  wishlist: Wishlist;
  count: number;
  isLoading: boolean;
  /** Vrai si l'offre figure déjà dans les favoris. */
  has: (productBoutiqueId: string) => boolean;
  /** Ajoute ou retire selon l'état courant. */
  toggle: (productBoutiqueId: string) => Promise<void>;
  remove: (productBoutiqueId: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const WishlistContext = createContext<WishlistContextValue | null>(null);
