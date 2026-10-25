import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { ShopOrderBoard } from "../../../orders";
import { sellerPaths, useSellerShop } from "../../shared";

// ─────────────────────────────────────────────
//  Commandes de la boutique — /ma-boutique/:boutiqueId/commandes?onglet=
//  La file « À confirmer » s'ouvre d'abord : c'est elle qui a une échéance
//  (48 heures, sinon la commande expire).
// ─────────────────────────────────────────────
export const ShopOrdersPage = () => {
  const { shop } = useSellerShop();
  useDocumentTitle(`Commandes — ${shop.nom}`);

  return (
    <ShopOrderBoard
      boutiqueId={shop.id}
      defaultGroup="todo"
      detailPath={(part) => sellerPaths.order(shop.id, part.id)}
    />
  );
};
