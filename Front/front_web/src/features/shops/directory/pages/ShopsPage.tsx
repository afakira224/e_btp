import { Alert, Button } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { CatalogHeader, CatalogPage, EmptyState } from "../../../catalog";
import { SearchField, useUrlSearchText } from "../../shared";
import { ShopCard } from "../components/ShopCard";
import { PAGE_SIZE, useShopDirectory } from "../hooks/useShopDirectory";
import styles from "./ShopsPage.module.css";

// ─────────────────────────────────────────────
//  Annuaire des boutiques — /boutiques?q=…
//  La recherche porte sur le nom (paramètre `search` du back) et vit dans
//  l'URL : une recherche se partage et revient avec le bouton Précédent.
// ─────────────────────────────────────────────
export const ShopsPage = () => {
  const search = useUrlSearchText("q");
  const directory = useShopDirectory(search.query);
  const { shops, isLoading, error, total, hasMore } = directory;

  useDocumentTitle("Boutiques");

  const firstLoad = isLoading && shops.length === 0;

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[{ label: "Accueil", to: "/" }, { label: "Boutiques" }]}
        eyebrow="Dépôts partenaires"
        title="Boutiques"
        lede="Les dépôts et quincailleries de Conakry qui vendent sur la plateforme. Chaque boutique fixe ses prix et gère ses stocks."
        {...(firstLoad || error ? {} : { count: total, countLabel: "boutiques" })}
      />

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <SearchField
            label="Rechercher une boutique par son nom"
            placeholder="Rechercher une boutique…"
            value={search.value}
            onChange={search.onChange}
          />
        </div>
      </div>

      {error && shops.length === 0 ? (
        <div className={styles.state}>
          <Alert tone="danger">{error}</Alert>
          <Button variant="secondary" onClick={directory.retry}>
            Réessayer
          </Button>
        </div>
      ) : firstLoad ? (
        <div className={styles.grid} aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : shops.length === 0 ? (
        search.query ? (
          <EmptyState
            title={`Aucune boutique ne correspond à « ${search.query} »`}
            text="La recherche porte sur le nom de la boutique. Essayez un mot plus court."
            action={{ to: "/boutiques", label: "Voir toutes les boutiques" }}
          />
        ) : (
          <EmptyState
            title="Aucune boutique pour le moment"
            text="Les premiers dépôts partenaires arrivent bientôt."
          />
        )
      ) : (
        <>
          <div
            className={[styles.grid, isLoading ? styles.stale : ""].filter(Boolean).join(" ")}
            aria-busy={isLoading}
          >
            {shops.map((shop) => (
              <ShopCard key={shop.id} shop={shop} />
            ))}
          </div>

          <div className={styles.foot}>
            <span className={styles.counter} role="status" aria-live="polite">
              {shops.length} sur {total} boutiques
            </span>
            {error ? (
              <>
                <Alert tone="danger">{error}</Alert>
                <Button variant="secondary" onClick={directory.retry}>
                  Réessayer
                </Button>
              </>
            ) : hasMore ? (
              <Button variant="secondary" onClick={directory.loadMore} isLoading={isLoading}>
                Voir {Math.min(PAGE_SIZE, total - shops.length)} boutiques de plus
              </Button>
            ) : null}
          </div>
        </>
      )}
    </CatalogPage>
  );
};
