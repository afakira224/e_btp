import { useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import type { Shop } from "../../../../entities/shop";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPage } from "../../../account";
import { useAuth } from "../../../auth";
import { useResource } from "../../../catalog";
import { fetchManagedShops, SellerHeader, sellerPaths } from "../../shared";
import styles from "./SellerHomePage.module.css";

// ─────────────────────────────────────────────
//  Ma boutique — /ma-boutique
//  Un gérant n'a le plus souvent qu'une boutique : il y entre directement.
//  Avec plusieurs boutiques (ou pour l'administration), il choisit d'abord.
// ─────────────────────────────────────────────
export const SellerHomePage = () => {
  const { user } = useAuth();
  useDocumentTitle("Ma boutique");

  const load = useCallback(
    (signal: AbortSignal) => (user ? fetchManagedShops(user, signal) : Promise.resolve([])),
    [user]
  );
  const shops = useResource<Shop[] | null>(load, null, user?._id ?? "");

  const header = (
    <SellerHeader
      title="Ma boutique"
      lede="Gérez les produits de vos boutiques et les modes de livraison que vous proposez."
    />
  );

  if (shops.error) {
    return (
      <AccountPage>
        {header}
        <Alert tone="danger">{shops.error}</Alert>
      </AccountPage>
    );
  }

  if (shops.isLoading || !shops.data) {
    return (
      <AccountPage>
        {header}
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  const [only] = shops.data;
  if (shops.data.length === 1 && only) {
    return <Navigate to={sellerPaths.products(only.id)} replace />;
  }

  return (
    <AccountPage>
      {header}
      {shops.data.length === 0 ? (
        <Alert tone="info">
          Aucune boutique n'est rattachée à ce compte. La création d'une boutique passe par
          l'administration de la plateforme.
        </Alert>
      ) : (
        <ul className={styles.shops}>
          {shops.data.map((shop) => (
            <li key={shop.id}>
              <Link className={styles.card} to={sellerPaths.products(shop.id)}>
                <span className={styles.name}>
                  {shop.nom}
                  <span aria-hidden="true">→</span>
                </span>
                <span className={styles.address}>{shop.adresse ?? "Adresse non renseignée"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AccountPage>
  );
};
