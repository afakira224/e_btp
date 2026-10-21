import { Link, useLocation } from "react-router-dom";
import { Alert, Button } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPanel } from "../../../account";
import { sellerPaths, useSellerShop } from "../../shared";
import { OfferRow } from "../components/OfferRow";
import { useShopOffers } from "../hooks/useShopOffers";
import styles from "./OffersPage.module.css";

/** Message passé au retour d'un formulaire, affiché une fois. */
export interface OffersPageState {
  feedback?: string;
}

// ─────────────────────────────────────────────
//  Produits de la boutique — /ma-boutique/:boutiqueId/produits
// ─────────────────────────────────────────────
export const OffersPage = () => {
  const { shop } = useSellerShop();
  const location = useLocation();
  const feedback = (location.state as OffersPageState | null)?.feedback;
  const offers = useShopOffers(shop.id);

  useDocumentTitle(`Produits — ${shop.nom}`);

  const add = (
    <Link to={sellerPaths.newProduct(shop.id)}>
      <Button>Ajouter un produit</Button>
    </Link>
  );

  return (
    <div className={styles.page}>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {offers.error ? <Alert tone="danger">{offers.error}</Alert> : null}

      <AccountPanel
        title={offers.isLoading && offers.items.length === 0 ? "Produits" : `Produits (${offers.total})`}
        description="Chaque produit suit les modes de livraison de la boutique, sauf si vous les personnalisez."
      >
        <div className={styles.toolbar}>
          {add}
          <Link className={styles.settings} to={sellerPaths.delivery(shop.id)}>
            Modes de livraison de la boutique →
          </Link>
        </div>

        {offers.items.length > 0 ? (
          <ul className={styles.list}>
            {offers.items.map((offer) => (
              <OfferRow key={offer.id} shopId={shop.id} offer={offer} />
            ))}
          </ul>
        ) : offers.isLoading ? (
          <div className={styles.skeleton} aria-hidden="true" />
        ) : (
          <p className={styles.empty}>
            Aucun produit pour l'instant. Ajoutez le premier : il suivra les modes de livraison de
            la boutique.
          </p>
        )}

        {offers.hasMore ? (
          <div className={styles.more}>
            <Button variant="secondary" onClick={offers.loadMore} isLoading={offers.isLoading}>
              Afficher plus
            </Button>
          </div>
        ) : null}
      </AccountPanel>
    </div>
  );
};
