import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import {
  CatalogHeader,
  CatalogPage,
  InfiniteProductGrid,
  useResource,
} from "../../../catalog";
import { loadTaxonomy, searchUrl, useRecentSearches } from "../../shared";
import { SearchFilters } from "../components/SearchFilters";
import { SearchToolbar } from "../components/SearchToolbar";
import { useSearchQuery } from "../hooks/useSearchQuery";
import { PAGE_SIZE, useSearchResults } from "../hooks/useSearchResults";
import { resolveTaxonomy } from "../utils/taxonomyPath";
import styles from "./SearchResultsPage.module.css";

const loadFamilles = () => loadTaxonomy();

// ─────────────────────────────────────────────
//  Page de résultats — /recherche?q=…
//
//  L'URL porte toute la recherche (texte, rayon, prix, disponibilité,
//  tri) : la page n'a pas d'état propre à part l'ouverture des filtres
//  sur mobile. Sans texte, elle liste tout le catalogue et sert de
//  point d'entrée « parcourir avec des filtres ».
// ─────────────────────────────────────────────
export const SearchResultsPage = () => {
  const filtersId = useId();
  const { criteria, update, reset, filterCount } = useSearchQuery();
  const results = useSearchResults(criteria);
  const familles = useResource(loadFamilles, []);
  const { recent } = useRecentSearches();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const toggleRef = useRef<HTMLElement | null>(null);

  // Le panneau mobile recouvre la page : le focus y entre à l'ouverture et
  // revient au bouton « Filtres » à la fermeture.
  const openFilters = () => {
    toggleRef.current = document.activeElement as HTMLElement | null;
    setFiltersOpen(true);
  };
  const closeFilters = () => {
    setFiltersOpen(false);
    toggleRef.current?.focus();
  };

  useEffect(() => {
    if (filtersOpen) closeRef.current?.focus();
  }, [filtersOpen]);

  const path = resolveTaxonomy(familles.data, criteria);
  const { q } = criteria;

  useDocumentTitle(q ? `« ${q} » — Recherche` : "Recherche");

  const empty =
    filterCount > 0
      ? {
          title: q ? `Aucun résultat pour « ${q} » avec ces filtres` : "Aucun produit avec ces filtres",
          text: "Élargissez la fourchette de prix ou retirez un filtre pour voir plus d'articles.",
          action: { to: searchUrl(q), label: "Retirer tous les filtres" },
        }
      : {
          title: `Aucun résultat pour « ${q} »`,
          text: "Vérifiez l'orthographe, essayez un terme plus général (« ciment » plutôt que « CEM II 42.5 ») ou parcourez les rayons.",
          action: { to: "/categories", label: "Parcourir le catalogue" },
        };

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[{ label: "Accueil", to: "/" }, { label: "Recherche" }]}
        eyebrow={q ? "Résultats de recherche" : "Recherche"}
        title={q ? `« ${q} »` : "Tous les produits"}
        lede={
          q
            ? undefined
            : "Tapez un produit dans la barre de recherche, ou affinez la sélection avec les filtres."
        }
      />

      {/* Sans texte, les recherches récentes offrent un raccourci. */}
      {!q && recent.length > 0 ? (
        <nav className={styles.recent} aria-label="Recherches récentes">
          <span className={styles.recentLabel}>Vos recherches récentes</span>
          <ul className={styles.recentList}>
            {recent.map((term) => (
              <li key={term}>
                <Link className={styles.recentLink} to={searchUrl(term)}>
                  {term}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className={styles.layout}>
        <aside
          id={filtersId}
          className={[styles.aside, filtersOpen ? styles.asideOpen : ""]
            .filter(Boolean)
            .join(" ")}
          aria-label="Filtres de recherche"
          onKeyDown={(event) => {
            if (event.key === "Escape" && filtersOpen) closeFilters();
          }}
        >
          {/* En-tête et pied du panneau mobile ; masqués sur grand écran,
              où les filtres sont toujours visibles. */}
          <div className={styles.sheetHead}>
            <span className={styles.sheetTitle}>Filtres</span>
            <button
              ref={closeRef}
              type="button"
              className={styles.sheetClose}
              onClick={closeFilters}
              aria-label="Fermer les filtres"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <SearchFilters
            criteria={criteria}
            familles={familles.data}
            path={path}
            priceRange={results.priceRange}
            filterCount={filterCount}
            onChange={update}
            onReset={reset}
          />

          <div className={styles.sheetFoot}>
            <Button fullWidth onClick={closeFilters}>
              {results.isLoading
                ? "Recherche…"
                : `Voir ${results.total} résultat${results.total > 1 ? "s" : ""}`}
            </Button>
          </div>
        </aside>

        <section className={styles.main} aria-label="Résultats">
          <SearchToolbar
            criteria={criteria}
            path={path}
            total={results.total}
            isLoading={results.isLoading}
            filterCount={filterCount}
            filtersOpen={filtersOpen}
            filtersId={filtersId}
            onToggleFilters={() => (filtersOpen ? closeFilters() : openFilters())}
            onChange={update}
          />

          <InfiniteProductGrid
            {...results}
            pageSize={PAGE_SIZE}
            columns={3}
            empty={empty}
          />
        </section>
      </div>
    </CatalogPage>
  );
};
