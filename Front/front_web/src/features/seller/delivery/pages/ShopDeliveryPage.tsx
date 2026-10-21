import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import type { ShopDeliveryOverview } from "../../../../entities/delivery";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPanel } from "../../../account";
import { useResource } from "../../../catalog";
import { DeliverySummary, fetchShopDelivery, sellerPaths, useSellerShop } from "../../shared";
import { ShopDeliveryForm } from "../components/ShopDeliveryForm";
import styles from "./ShopDeliveryPage.module.css";

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count > 1 ? pluralForm : singular}`;

// ─────────────────────────────────────────────
//  Livraison de la boutique — /ma-boutique/:boutiqueId/livraison
//  Les réglages par défaut s'appliquent aussitôt à tous les produits qui les
//  suivent : rien n'est recopié chez eux, ils les relisent à chaque calcul.
//  Les produits personnalisés gardent les leurs.
// ─────────────────────────────────────────────
export const ShopDeliveryPage = () => {
  const { shop } = useSellerShop();
  useDocumentTitle(`Livraison — ${shop.nom}`);

  const load = useCallback((signal: AbortSignal) => fetchShopDelivery(shop.id, signal), [shop.id]);
  const loaded = useResource<ShopDeliveryOverview | null>(load, null, shop.id);

  // Après un enregistrement, la réponse du PUT fait foi : inutile de relire.
  const [saved, setSaved] = useState<ShopDeliveryOverview | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const current = saved ?? loaded.data;

  if (loaded.error) return <Alert tone="danger">{loaded.error}</Alert>;
  if (loaded.isLoading || !current) return <div className={styles.skeleton} aria-hidden="true" />;

  const onSaved = (overview: ShopDeliveryOverview) => {
    setSaved(overview);
    setRevision((value) => value + 1);
    setFeedback(
      overview.inheritingProducts > 0
        ? `Livraison mise à jour : ${plural(overview.inheritingProducts, "produit")} ${
            overview.inheritingProducts > 1 ? "suivent" : "suit"
          } désormais ces réglages.`
        : "Livraison mise à jour."
    );
  };

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        {feedback ? <Alert tone="success">{feedback}</Alert> : null}

        <AccountPanel
          title="Modes de livraison par défaut"
          description="Ils s'appliquent à chaque produit qui utilise les paramètres de la boutique, y compris ceux que vous ajouterez. Proposez-en un ou plusieurs : le client choisira."
        >
          <ShopDeliveryForm
            // Formulaire neuf après chaque enregistrement : il repart des
            // réglages que le serveur vient de confirmer.
            key={revision}
            shop={shop}
            saved={current}
            onSaved={onSaved}
          />
        </AccountPanel>
      </div>

      <aside className={styles.side}>
        <AccountPanel
          title="Configuration appliquée"
          description="Ce que voient vos clients aujourd'hui, frais calculés par le serveur."
        >
          <DeliverySummary options={current.options} />
        </AccountPanel>

        <AccountPanel title="Portée">
          <dl className={styles.scope}>
            <div>
              <dt>{plural(current.inheritingProducts, "produit")}</dt>
              <dd>suivent ces réglages et changeront avec eux.</dd>
            </div>
            <div>
              <dt>{plural(current.customProducts, "produit personnalisé", "produits personnalisés")}</dt>
              <dd>gardent leur propre livraison, que ces réglages ne modifient pas.</dd>
            </div>
          </dl>
          <p className={styles.note}>
            Les commandes déjà passées conservent le mode et les frais de leur validation.{" "}
            <Link to={sellerPaths.products(shop.id)}>Voir les produits</Link>
          </p>
        </AccountPanel>
      </aside>
    </div>
  );
};
