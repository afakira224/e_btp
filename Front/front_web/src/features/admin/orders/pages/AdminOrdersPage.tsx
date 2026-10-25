import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPage } from "../../../account";
import { ShopOrderBoard } from "../../../orders";
import { AdminHeader, AdminNav, adminPaths } from "../../shared";

// ─────────────────────────────────────────────
//  Commandes — /admin/commandes?onglet=
//  Toutes les boutiques. L'onglet « Problèmes » s'ouvre d'abord : échecs de
//  livraison, retours sans réponse, litiges à trancher.
// ─────────────────────────────────────────────
export const AdminOrdersPage = () => {
  useDocumentTitle("Commandes et litiges");

  return (
    <AccountPage>
      <AdminHeader
        title="Commandes et litiges"
        lede="Les commandes de toutes les boutiques. Un retour refusé par la boutique, ou laissé sans réponse 48 heures, devient un litige que vous tranchez."
        trail={[{ label: "Commandes" }]}
      />
      <AdminNav />
      <ShopOrderBoard defaultGroup="issues" detailPath={(part) => adminPaths.order(part.id)} showShop />
    </AccountPage>
  );
};
