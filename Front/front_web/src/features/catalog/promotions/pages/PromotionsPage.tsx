import { useId } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CatalogHeader,
  CatalogPage,
  InfiniteProductGrid,
} from "../../shared/components/CatalogPage";
import {
  FamilleChips,
  fetchActivePromotions,
  useFamilleParam,
  useListing,
  useResource,
  type ListingSort,
} from "../../shared";
import { FlashSaleBanner } from "../components/FlashSaleBanner";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import styles from "./PromotionsPage.module.css";

const PAGE_SIZE = 12;
const SORT_PARAM = "tri";

const SORTS: readonly { value: ListingSort; label: string }[] = [
  { value: "popular", label: "Popularité" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "newest", label: "Nouveautés" },
];

const isSort = (value: string | null): value is ListingSort =>
  SORTS.some((sort) => sort.value === value);

// ─────────────────────────────────────────────
//  Promotions.
//
//  Deux sources distinctes, affichées l'une sous l'autre :
//   • les ventes flash en cours (GET /promotions/flash/active), avec leur
//     compte à rebours ;
//   • toutes les offres dont le prix remisé est inférieur au prix
//     (GET /product-boutiques/search?discounted=true) — une remise posée
//     par un dépôt existe aussi hors de toute opération.
//  Le back ne sait pas trier par taux de remise : on ne le propose pas.
// ─────────────────────────────────────────────
export const PromotionsPage = () => {
  const sortId = useId();
  const [params, setParams] = useSearchParams();
  const familleId = useFamilleParam();
  const rawSort = params.get(SORT_PARAM);
  const sort: ListingSort = isSort(rawSort) ? rawSort : "popular";

  const flash = useResource(fetchActivePromotions, []);
  const produits = useListing({ sort, familleId, discounted: true }, PAGE_SIZE);

  useDocumentTitle("Promotions");

  const changeSort = (next: ListingSort) => {
    const updated = new URLSearchParams(params);
    if (next === "popular") updated.delete(SORT_PARAM);
    else updated.set(SORT_PARAM, next);
    setParams(updated);
  };

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[{ label: "Accueil", to: "/" }, { label: "Promotions" }]}
        eyebrow="Bonnes affaires"
        title="Promotions"
        lede="Ventes flash en cours et articles remisés par les dépôts, au meilleur prix du moment."
      />

      {/* Rien n'est affirmé pendant le chargement : « aucune vente flash »
          serait démenti une seconde plus tard. */}
      {flash.isLoading ? (
        <div className={styles.flashSkeleton} aria-hidden="true" />
      ) : flash.data.length > 0 ? (
        <div className={styles.flashList}>
          {flash.data.map((promotion) => (
            <FlashSaleBanner key={promotion.id} promotion={promotion} />
          ))}
        </div>
      ) : null}

      <section aria-labelledby={`${sortId}-title`}>
        <div className={styles.sectionHead}>
          <div>
            <h2 id={`${sortId}-title`} className={styles.sectionTitle}>
              Articles en promotion
            </h2>
            {!flash.isLoading && flash.data.length === 0 ? (
              <p className={styles.sectionText}>
                Pas de vente flash en ce moment : voici les remises posées par les dépôts.
              </p>
            ) : null}
          </div>

          <div className={styles.sort}>
            <label htmlFor={sortId} className={styles.sortLabel}>
              Trier par
            </label>
            <select
              id={sortId}
              className={styles.sortSelect}
              value={sort}
              onChange={(event) => changeSort(event.target.value as ListingSort)}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <FamilleChips
          total={produits.isLoading && produits.items.length === 0 ? undefined : produits.total}
        />

        <InfiniteProductGrid
          {...produits}
          pageSize={PAGE_SIZE}
          empty={{
            title: "Aucune remise dans ce domaine",
            text: "Revenez bientôt : les dépôts publient régulièrement de nouvelles offres.",
            action: { to: "/promotions", label: "Voir toutes les promotions" },
          }}
        />
      </section>
    </CatalogPage>
  );
};
