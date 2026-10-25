import { useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import type { Shop } from "../../../../entities/shop";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { useAuth } from "../../../auth";
import { useResource } from "../../../catalog";
import { fetchManagedShops, sellerPaths } from "../../shared";
import styles from "./SellerHomePage.module.css";

// ─────────────────────────────────────────────
//  Mes boutiques — /ma-boutique
//  Un gérant n'a le plus souvent qu'une boutique : il entre directement sur
//  son tableau de bord. Avec plusieurs boutiques (ou pour l'administration),
//  il choisit d'abord.
// ─────────────────────────────────────────────
export const SellerHomePage = () => {
  const { user } = useAuth();
  useDocumentTitle("Espace boutique");

  const load = useCallback(
    (signal: AbortSignal) => (user ? fetchManagedShops(user, signal) : Promise.resolve([])),
    [user]
  );
  const shops = useResource<Shop[] | null>(load, null, user?._id ?? "");

  const [only] = shops.data ?? [];
  if (shops.data?.length === 1 && only) {
    return <Navigate to={sellerPaths.dashboard(only.id)} replace />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Mes boutiques</h1>
        <p className={styles.lede}>Choisissez la boutique à gérer : commandes, produits, livraison et informations.</p>
      </header>

      {shops.error ? (
        <Alert tone="danger">{shops.error}</Alert>
      ) : shops.isLoading || !shops.data ? (
        <div className={styles.skeleton} aria-hidden="true" />
      ) : shops.data.length === 0 ? (
        <Alert tone="info">
          Aucune boutique n'est rattachée à ce compte.{" "}
          <Link to="/compte/boutique/demande">Demander l'ouverture d'une boutique</Link> : l'équipe de la
          plateforme examine chaque demande.
        </Alert>
      ) : (
        <ul className={styles.shops}>
          {shops.data.map((shop) => (
            <li key={shop.id}>
              <Link className={styles.card} to={sellerPaths.dashboard(shop.id)}>
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
    </div>
  );
};
