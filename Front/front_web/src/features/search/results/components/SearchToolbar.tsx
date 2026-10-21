import { useId } from "react";
import { formatPrice } from "../../../../entities/product";
import { SEARCH_SORTS, type SearchCriteria, type SearchSort } from "../../shared";
import type { TaxonomyPath } from "../utils/taxonomyPath";
import styles from "./SearchToolbar.module.css";

interface SearchToolbarProps {
  criteria: SearchCriteria;
  path: TaxonomyPath;
  total: number;
  isLoading: boolean;
  filterCount: number;
  filtersOpen: boolean;
  filtersId: string;
  onToggleFilters: () => void;
  onChange: (patch: Partial<SearchCriteria>) => void;
}

interface ActiveFilter {
  key: string;
  label: string;
  clear: Partial<SearchCriteria>;
}

/** Filtres en vigueur, chacun retirable d'un clic. */
const activeFilters = (criteria: SearchCriteria, path: TaxonomyPath): ActiveFilter[] => {
  const list: ActiveFilter[] = [];
  const rayon = path.sousCategorie ?? path.categorie ?? path.famille;
  if (rayon) {
    list.push({
      key: "rayon",
      label: rayon.nom,
      clear: { familleId: undefined, categoryId: undefined, sousCategoryId: undefined },
    });
  }
  if (criteria.minPrice !== undefined) {
    list.push({ key: "min", label: `Dès ${formatPrice(criteria.minPrice)}`, clear: { minPrice: undefined } });
  }
  if (criteria.maxPrice !== undefined) {
    list.push({ key: "max", label: `Jusqu'à ${formatPrice(criteria.maxPrice)}`, clear: { maxPrice: undefined } });
  }
  if (criteria.inStock) list.push({ key: "stock", label: "En stock", clear: { inStock: undefined } });
  if (criteria.discounted) list.push({ key: "promo", label: "En promotion", clear: { discounted: undefined } });
  return list;
};

export const SearchToolbar = ({
  criteria,
  path,
  total,
  isLoading,
  filterCount,
  filtersOpen,
  filtersId,
  onToggleFilters,
  onChange,
}: SearchToolbarProps) => {
  const sortId = useId();
  const chips = activeFilters(criteria, path);

  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        {/* Visible seulement quand les filtres sont repliés (mobile). */}
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          onClick={onToggleFilters}
        >
          Filtres
          {filterCount > 0 ? <span className={styles.badge}>{filterCount}</span> : null}
        </button>

        <span className={styles.count} role="status" aria-live="polite">
          {isLoading && total === 0
            ? "Recherche…"
            : `${total} résultat${total > 1 ? "s" : ""}`}
        </span>

        <div className={styles.sort}>
          <label htmlFor={sortId} className={styles.sortLabel}>
            Trier par
          </label>
          <select
            id={sortId}
            className={styles.sortSelect}
            value={criteria.sort}
            onChange={(event) => onChange({ sort: event.target.value as SearchSort })}
          >
            {SEARCH_SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {chips.length > 0 ? (
        <ul className={styles.chips} aria-label="Filtres actifs">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                className={styles.chip}
                onClick={() => onChange(chip.clear)}
                aria-label={`Retirer le filtre ${chip.label}`}
              >
                {chip.label}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
