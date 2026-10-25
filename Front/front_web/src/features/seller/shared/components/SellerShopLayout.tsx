import { useCallback, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import type { Shop } from "../../../../entities/shop";
import { Alert } from "../../../../shared/ui";
import { AccountPage } from "../../../account";
import { useAuth } from "../../../auth";
import { useResource } from "../../../catalog";
import { fetchShop } from "../../../shops";
import { canManageShop } from "../api/seller.api";
import type { SellerShopContext } from "../hooks/useSellerShop";
import { sellerPaths } from "../utils/paths";
import { SellerHeader } from "./SellerHeader";
import styles from "./SellerShopLayout.module.css";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  [styles.tab, isActive ? styles.active : ""].filter(Boolean).join(" ");

// ─────────────────────────────────────────────
//  Ossature d'une boutique — /ma-boutique/:boutiqueId/…
//  Charge la boutique une fois pour ses rubriques (commandes, produits,
//  livraison, informations) et la leur passe par le contexte de l'Outlet.
// ─────────────────────────────────────────────
export const SellerShopLayout = () => {
  const { boutiqueId = "" } = useParams<{ boutiqueId: string }>();
  const { user } = useAuth();

  const load = useCallback((signal: AbortSignal) => fetchShop(boutiqueId, signal), [boutiqueId]);
  const shop = useResource<Shop | null>(load, null, boutiqueId);
  // Après une modification des informations, la version enregistrée fait
  // foi : l'en-tête suit sans relecture, et la rubrique reste montée.
  const [updated, setUpdated] = useState<Shop | null>(null);

  if (shop.error) {
    return (
      <AccountPage>
        <SellerHeader title="Boutique introuvable" trail={[{ label: "Introuvable" }]} />
        <Alert tone="danger">{shop.error}</Alert>
      </AccountPage>
    );
  }

  if (shop.isLoading || !shop.data) {
    return (
      <AccountPage>
        <SellerHeader title="Ma boutique…" trail={[{ label: "…" }]} />
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  const data = updated?.id === shop.data.id ? updated : shop.data;

  // Le back refuserait toute écriture : autant ne pas proposer de formulaire.
  if (!canManageShop(user, data)) {
    return (
      <AccountPage>
        <SellerHeader title={data.nom} trail={[{ label: data.nom }]} />
        <Alert tone="danger">
          Cette boutique n'est pas la vôtre : seuls son gérant et l'administration peuvent la
          modifier.
        </Alert>
      </AccountPage>
    );
  }

  const context: SellerShopContext = { shop: data, onShopUpdated: setUpdated };

  return (
    <AccountPage>
      <SellerHeader
        title={data.nom}
        lede={data.adresse ? data.adresse : "Adresse de la boutique non renseignée"}
        trail={[{ label: data.nom }]}
        action={
          <Link className={styles.storefront} to={sellerPaths.storefront(data.id)}>
            Voir ma vitrine →
          </Link>
        }
      />

      <nav className={styles.tabs} aria-label="Rubriques de la boutique">
        <NavLink className={tabClass} to={sellerPaths.orders(data.id)}>
          Commandes
        </NavLink>
        <NavLink className={tabClass} to={sellerPaths.products(data.id)}>
          Produits
        </NavLink>
        <NavLink className={tabClass} to={sellerPaths.delivery(data.id)}>
          Livraison
        </NavLink>
        <NavLink className={tabClass} to={sellerPaths.info(data.id)}>
          Informations
        </NavLink>
      </nav>

      <Outlet context={context} />
    </AccountPage>
  );
};
