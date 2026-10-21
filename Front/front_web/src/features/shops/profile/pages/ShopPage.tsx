import { useCallback, useId } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { Shop } from "../../../../entities/shop";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
  FamilleChips,
  fetchListing,
  InfiniteProductGrid,
  useFamilleParam,
  useListing,
  useResource,
  type ListingSort,
} from "../../../catalog";
import { fetchShop, SearchField, useUrlSearchText } from "../../shared";
import { ShopProfile } from "../components/ShopProfile";
import styles from "./ShopPage.module.css";

const PAGE_SIZE = 12;
const SORT_PARAM = "tri";
const PROMO_PARAM = "promo";

const SORTS: readonly { value: ListingSort; label: string }[] = [
  { value: "popular", label: "Popularité" },
  { value: "newest", label: "Nouveautés" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "rating", label: "Mieux notés" },
];

const isSort = (value: string | null): value is ListingSort =>
  SORTS.some((sort) => sort.value === value);

interface Counts {
  articles: number;
  promotions: number;
}

// ─────────────────────────────────────────────
//  Page d'une boutique — /boutiques/:boutiqueId
//
//  En-tête (identité, chiffres, coordonnées), puis son catalogue :
//  recherche dans la boutique, domaine, promotions, tri. Tout passe par
//  GET /product-boutiques/search?boutiqueId=… ; les critères vivent dans
//  l'URL, comme sur les autres listes du site.
//
//  Les chiffres de l'en-tête sont lus à part, sans filtre : ils décrivent
//  la boutique, pas la sélection en cours.
// ─────────────────────────────────────────────
export const ShopPage = () => {
  const { boutiqueId = "" } = useParams<{ boutiqueId: string }>();
  const sortId = useId();
  const [params, setParams] = useSearchParams();
  const search = useUrlSearchText("q");
  const familleId = useFamilleParam();
  const rawSort = params.get(SORT_PARAM);
  const sort: ListingSort = isSort(rawSort) ? rawSort : "popular";
  const promoOnly = params.get(PROMO_PARAM) === "1";

  const loadShop = useCallback((signal: AbortSignal) => fetchShop(boutiqueId, signal), [boutiqueId]);
  const shop = useResource<Shop | null>(loadShop, null, boutiqueId);

  // `limit=1` : seul le total nous intéresse.
  const loadCounts = useCallback(
    async (signal: AbortSignal): Promise<Counts> => {
      const [all, promo] = await Promise.all([
        fetchListing({ sort: "popular", boutiqueId }, 1, 1, signal),
        fetchListing({ sort: "popular", boutiqueId, discounted: true }, 1, 1, signal),
      ]);
      return { articles: all.total, promotions: promo.total };
    },
    [boutiqueId]
  );
  const counts = useResource<Counts | null>(loadCounts, null, boutiqueId);

  const produits = useListing(
    { sort, boutiqueId, familleId, discounted: promoOnly, q: search.query || undefined },
    PAGE_SIZE
  );

  useDocumentTitle(shop.data?.nom ?? "Boutique");

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next);
  };

  if (shop.error) {
    return (
      <CatalogPage>
        <CatalogHeader
          crumbs={[
            { label: "Accueil", to: "/" },
            { label: "Boutiques", to: "/boutiques" },
            { label: "Introuvable" },
          ]}
          eyebrow="Boutique"
          title="Boutique introuvable"
        />
        <EmptyState
          title="Cette boutique n'existe pas ou a fermé"
          text={shop.error}
          action={{ to: "/boutiques", label: "Voir toutes les boutiques" }}
        />
      </CatalogPage>
    );
  }

  const filtered = Boolean(search.query || familleId || promoOnly);

  return (
    <CatalogPage>
      {shop.isLoading || !shop.data ? (
        <div className={styles.heroSkeleton} aria-hidden="true" />
      ) : (
        <ShopProfile
          shop={shop.data}
          articles={counts.data?.articles}
          promotions={counts.data?.promotions}
        />
      )}

      <section aria-labelledby={`${sortId}-title`}>
        <div className={styles.head}>
          <h2 id={`${sortId}-title`} className={styles.title}>
            Articles de la boutique
          </h2>

          <div className={styles.controls}>
            <div className={styles.search}>
              <SearchField
                label="Rechercher dans cette boutique"
                placeholder="Rechercher dans la boutique…"
                value={search.value}
                onChange={search.onChange}
              />
            </div>

            <button
              type="button"
              className={[styles.toggle, promoOnly ? styles.toggleOn : ""].filter(Boolean).join(" ")}
              aria-pressed={promoOnly}
              onClick={() => setParam(PROMO_PARAM, promoOnly ? null : "1")}
            >
              En promotion
            </button>

            <div className={styles.sort}>
              <label htmlFor={sortId} className={styles.sortLabel}>
                Trier par
              </label>
              <select
                id={sortId}
                className={styles.sortSelect}
                value={sort}
                onChange={(event) =>
                  setParam(SORT_PARAM, event.target.value === "popular" ? null : event.target.value)
                }
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <FamilleChips
          total={produits.isLoading && produits.items.length === 0 ? undefined : produits.total}
        />

        {shop.isLoading ? (
          <CatalogSkeletons count={PAGE_SIZE} />
        ) : (
          <InfiniteProductGrid
            {...produits}
            pageSize={PAGE_SIZE}
            empty={
              filtered
                ? {
                    title: search.query
                      ? `Aucun article ne correspond à « ${search.query} »`
                      : "Aucun article avec ces filtres",
                    text: "Retirez un filtre ou cherchez un terme plus général.",
                    action: { to: `/boutiques/${boutiqueId}`, label: "Voir tous les articles" },
                  }
                : {
                    title: "Cette boutique n'a encore rien mis en rayon",
                    text: "Ses premiers articles apparaîtront ici dès leur publication.",
                    action: { to: "/boutiques", label: "Découvrir d'autres boutiques" },
                  }
            }
          />
        )}
      </section>
    </CatalogPage>
  );
};
