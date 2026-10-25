import { Link, useParams } from "react-router-dom";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPage } from "../../../account";
import { ShopOrderDetail, useShopOrder } from "../../../orders";
import { AdminHeader, adminPaths } from "../../shared";
import styles from "./AdminShopOrderPage.module.css";

const ORDERS_CRUMB = { label: "Commandes", to: adminPaths.orders };

// ─────────────────────────────────────────────
//  Une commande — /admin/commandes/:partId
//  Lien des alertes envoyées à l'administration (litige, livraison qui
//  traîne). On y tranche un litige, confirme un remboursement ou annule
//  d'office une commande qui ne peut pas aboutir.
// ─────────────────────────────────────────────
export const AdminShopOrderPage = () => {
  const { partId = "" } = useParams<{ partId: string }>();
  const { part, isLoading, error, replace } = useShopOrder(partId);

  useDocumentTitle(part ? `Commande ${part.reference}` : "Commande");

  if (error || (!isLoading && !part)) {
    return (
      <AccountPage>
        <AdminHeader title="Commande introuvable" trail={[ORDERS_CRUMB, { label: "Introuvable" }]} />
        <Alert tone="danger">{error ?? "Commande introuvable."}</Alert>
      </AccountPage>
    );
  }

  if (!part) {
    return (
      <AccountPage>
        <AdminHeader title="Commande…" trail={[ORDERS_CRUMB, { label: "…" }]} />
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  return (
    <AccountPage>
      <AdminHeader
        title={`Commande ${part.reference}`}
        lede={`${part.boutique.nom ?? "Boutique"} · passée le ${new Date(part.createdAt).toLocaleDateString("fr-FR")}`}
        trail={[ORDERS_CRUMB, { label: part.reference }]}
      />
      <ShopOrderDetail
        part={part}
        viewer="admin"
        onUpdated={replace}
        aside={
          <section className={styles.box}>
            <h2 className={styles.boxTitle}>Boutique</h2>
            <p className={styles.line}>
              <strong>{part.boutique.nom ?? "Boutique"}</strong>
              <Link to={`/boutiques/${encodeURIComponent(part.boutique.id)}`}>Voir la vitrine →</Link>
            </p>
          </section>
        }
      />
    </AccountPage>
  );
};
