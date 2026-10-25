import { useOutletContext } from "react-router-dom";
import type { ShopOrderCounts } from "../../../../entities/order";
import type { Shop } from "../../../../entities/shop";

/** Ce que SellerShopLayout transmet à ses rubriques. */
export interface SellerShopContext {
  shop: Shop;
  /** Une rubrique qui modifie la boutique transmet la version enregistrée. */
  onShopUpdated: (shop: Shop) => void;
  /** Commandes par onglet ; null tant qu'elles ne sont pas lues. */
  orderCounts: ShopOrderCounts | null;
  /** À appeler après une action sur une commande : le menu suit. */
  refreshOrderCounts: () => void;
}

/** La boutique en cours, chargée et dont le compte est gérant. */
export const useSellerShop = (): SellerShopContext => useOutletContext<SellerShopContext>();
