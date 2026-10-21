import { useState } from "react";
import { Alert, Button } from "../../../shared/ui";
import { ApiError } from "../../../shared/api";
import { isOutOfStock, productName } from "../../../entities/product";
import { resolvedOffers } from "../../../entities/wishlist";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
} from "../../catalog/shared/components/CatalogPage";
import { ProductCard } from "../../catalog/shared";
import { useCart } from "../../cart";
import { useWishlist } from "../shared/hooks/useWishlist";
import styles from "./WishlistPage.module.css";

const CRUMBS = [{ label: "Accueil", to: "/" }, { label: "Favoris" }];

export const WishlistPage = () => {
  const { wishlist, isLoading, remove, clear } = useWishlist();
  const { add } = useCart();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (cle: string, action: () => Promise<void>) => {
    setBusy(cle);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "L'opération a échoué. Réessayez."
      );
    } finally {
      setBusy(null);
    }
  };

  if (isLoading && wishlist.items.length === 0) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={CRUMBS} eyebrow="Mon compte" title="Mes favoris" />
        <CatalogSkeletons count={4} />
      </CatalogPage>
    );
  }

  if (wishlist.items.length === 0) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={CRUMBS} eyebrow="Mon compte" title="Mes favoris" />
        <EmptyState
          title="Aucun favori"
          text="Le cœur sur une vignette produit met l'article de côté pour plus tard."
          action={{ to: "/categories", label: "Parcourir le catalogue" }}
        />
      </CatalogPage>
    );
  }

  const offres = resolvedOffers(wishlist);
  // Le DTO laisse `productBoutique` indéfini si l'offre a disparu : on le
  // signale plutôt que d'afficher une carte vide.
  const orphelins = wishlist.items.length - offres.length;

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={CRUMBS}
        eyebrow="Mon compte"
        title="Mes favoris"
        count={wishlist.totalItems}
        countLabel="articles"
      />

      {error ? (
        <div className={styles.feedback}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : message ? (
        <div className={styles.feedback}>
          <Alert tone="success">{message}</Alert>
        </div>
      ) : null}

      {orphelins > 0 ? (
        <div className={styles.feedback}>
          <Alert tone="warning">
            {orphelins === 1
              ? "Un article favori n'est plus proposé par sa boutique."
              : `${orphelins} articles favoris ne sont plus proposés par leur boutique.`}
          </Alert>
        </div>
      ) : null}

      <div className={styles.grid}>
        {offres.map((offre) => {
          const rupture = isOutOfStock(offre);
          const enCours = busy === offre.id;

          return (
            <div key={offre.id} className={styles.entry}>
              {/* La vignette de catalogue telle quelle : prix, note, stock.
                  Son cœur retire déjà l'article, les actions ci-dessous ne
                  font que l'expliciter. */}
              <ProductCard item={offre} />

              <div className={styles.entryActions}>
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={rupture || enCours}
                  onClick={() =>
                    void run(offre.id, async () => {
                      await add(offre.id, 1);
                      setMessage(`${productName(offre)} ajouté au panier.`);
                    })
                  }
                >
                  {rupture ? "Rupture de stock" : "Ajouter au panier"}
                </Button>

                <button
                  type="button"
                  className={styles.remove}
                  disabled={enCours}
                  onClick={() => void run(offre.id, () => remove(offre.id))}
                >
                  Retirer des favoris
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <Button
          variant="ghost"
          onClick={() => void run("clear", clear)}
          disabled={busy !== null}
        >
          Vider les favoris
        </Button>
      </div>
    </CatalogPage>
  );
};
