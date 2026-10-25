import { Link, useParams } from "react-router-dom";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { ShopOrderDetail, useShopOrder } from "../../../orders";
import { sellerPaths, useSellerShop } from "../../shared";
import styles from "./ShopOrderPage.module.css";

// ─────────────────────────────────────────────
//  Une commande de la boutique — /ma-boutique/:boutiqueId/commandes/:partId
//  C'est le lien des emails « Nouvelle commande » : on y confirme, prépare,
//  expédie, remet (avec le code du client) ou répond à un retour.
// ─────────────────────────────────────────────
export const ShopOrderPage = () => {
  const { shop, refreshOrderCounts } = useSellerShop();
  const { partId = "" } = useParams<{ partId: string }>();
  const { part, isLoading, error, replace } = useShopOrder(partId);

  useDocumentTitle(part ? `Commande ${part.reference}` : "Commande");

  const back = (
    <Link className={styles.back} to={sellerPaths.orders(shop.id)}>
      ← Toutes les commandes
    </Link>
  );

  if (error || (!isLoading && !part)) {
    return (
      <div className={styles.page}>
        {back}
        <Alert tone="danger">{error ?? "Commande introuvable."}</Alert>
      </div>
    );
  }

  if (!part) {
    return (
      <div className={styles.page}>
        {back}
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  // Le lien d'une autre boutique : le back l'autoriserait à l'administration,
  // mais cette page est celle de la boutique ouverte.
  if (part.boutique.id !== shop.id) {
    return (
      <div className={styles.page}>
        {back}
        <Alert tone="danger">Cette commande n'appartient pas à {shop.nom}.</Alert>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {back}
      <ShopOrderDetail
        part={part}
        viewer="shop"
        onUpdated={(next) => {
          replace(next);
          refreshOrderCounts();
        }}
      />
    </div>
  );
};
