import type { ProductBoutique } from "../../product";

// ─────────────────────────────────────────────
//  Favoris — miroir de WishlistResponseDto
//  (Back/src/shared/interfaces/Wishlist.interfaces.ts).
//
//  Contrairement au panier, chaque item **imbrique l'offre complète**.
//  `productBoutique` reste facultatif : le back le laisse indéfini si
//  l'offre a disparu entre-temps.
// ─────────────────────────────────────────────

export interface WishlistItem {
  productBoutiqueId: string;
  productBoutique?: ProductBoutique | undefined;
}

export interface Wishlist {
  id: string;
  userId: string;
  items: WishlistItem[];
  totalItems: number;
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_WISHLIST: Wishlist = {
  id: "",
  userId: "",
  items: [],
  totalItems: 0,
  createdAt: "",
  updatedAt: "",
};

/** Offres encore disponibles — les items orphelins sont écartés. */
export const resolvedOffers = (wishlist: Wishlist): ProductBoutique[] =>
  wishlist.items
    .map((item) => item.productBoutique)
    .filter((offer): offer is ProductBoutique => offer !== undefined);
