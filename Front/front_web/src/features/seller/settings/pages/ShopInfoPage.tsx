import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPanel } from "../../../account";
import { ShopAvatar } from "../../../shops";
import { sellerPaths, useSellerShop } from "../../shared";
import { ShopInfoForm } from "../components/ShopInfoForm";
import styles from "./ShopInfoPage.module.css";

// ─────────────────────────────────────────────
//  Informations de la boutique — /ma-boutique/:boutiqueId/informations
//  Nom, présentation, contact, adresse et logo : la vitrine publique et la
//  boutique affichée sur chaque produit se mettent à jour aussitôt.
// ─────────────────────────────────────────────
export const ShopInfoPage = () => {
  const { shop, onShopUpdated } = useSellerShop();
  const [saved, setSaved] = useState(false);
  useDocumentTitle(`Informations — ${shop.nom}`);

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        {saved ? <Alert tone="success">Les informations de la boutique ont été enregistrées.</Alert> : null}

        <AccountPanel
          title="Informations de la boutique"
          description="Ce que les clients lisent sur votre vitrine et sur chacun de vos produits."
        >
          {/* Formulaire neuf après chaque enregistrement : il repart de la
              boutique que le serveur vient de confirmer. */}
          <ShopInfoForm
            key={shop.updatedAt}
            shop={shop}
            onSaved={(next) => {
              onShopUpdated(next);
              setSaved(true);
            }}
          />
        </AccountPanel>
      </div>

      <aside className={styles.side}>
        <AccountPanel title="Aperçu" description="Votre boutique dans l'annuaire des dépôts.">
          <div className={styles.preview}>
            <ShopAvatar shop={shop} size="lg" />
            <div className={styles.previewText}>
              <span className={styles.previewName}>{shop.nom}</span>
              <span className={styles.previewMeta}>{shop.adresse || "Adresse non renseignée"}</span>
            </div>
          </div>
          {shop.description ? <p className={styles.previewDescription}>{shop.description}</p> : null}
          <Link className={styles.link} to={sellerPaths.storefront(shop.id)}>
            Voir ma vitrine →
          </Link>
        </AccountPanel>
      </aside>
    </div>
  );
};
