import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { Famille } from "../../../../entities/taxonomy";
import { formatPrice } from "../../../../entities/product";
import { Button, Select } from "../../../../shared/ui";
import type { PriceRange, SearchCriteria } from "../../shared";
import type { TaxonomyPath } from "../utils/taxonomyPath";
import styles from "./SearchFilters.module.css";

interface SearchFiltersProps {
  criteria: SearchCriteria;
  familles: Famille[];
  path: TaxonomyPath;
  priceRange: PriceRange | null;
  filterCount: number;
  onChange: (patch: Partial<SearchCriteria>) => void;
  onReset: () => void;
}

/** Un seul niveau de taxonomie actif : fixer l'un efface les deux autres. */
const taxonomy = (level: "familleId" | "categoryId" | "sousCategoryId", id: string) => ({
  familleId: level === "familleId" && id ? id : undefined,
  categoryId: level === "categoryId" && id ? id : undefined,
  sousCategoryId: level === "sousCategoryId" && id ? id : undefined,
});

const toAmount = (value: string): number | undefined => {
  const cleaned = value.replace(/\s/g, "");
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
};

/**
 * Groupe de filtres. Un `role="group"` étiqueté plutôt qu'un fieldset : la
 * légende d'un fieldset se pose sur sa bordure et coupe le filet de
 * séparation, ce qu'aucun style ne corrige proprement.
 */
const Group = ({ title, children }: { title: string; children: ReactNode }) => {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={styles.group}>
      <span id={id} className={styles.legend}>
        {title}
      </span>
      {children}
    </div>
  );
};

// ─────────────────────────────────────────────
//  Filtres de la page de résultats.
//  Les listes de rayons se déplient en cascade : choisir un domaine révèle
//  ses catégories, choisir une catégorie révèle ses sous-catégories. En
//  remontant d'un cran (« Toutes »), on garde le niveau parent.
// ─────────────────────────────────────────────
export const SearchFilters = ({
  criteria,
  familles,
  path,
  priceRange,
  filterCount,
  onChange,
  onReset,
}: SearchFiltersProps) => {
  // Les montants se saisissent librement puis s'appliquent d'un coup :
  // relancer la recherche à chaque chiffre tapé serait pénible.
  const [min, setMin] = useState(criteria.minPrice?.toString() ?? "");
  const [max, setMax] = useState(criteria.maxPrice?.toString() ?? "");
  const [synced, setSynced] = useState({ min: criteria.minPrice, max: criteria.maxPrice });
  if (synced.min !== criteria.minPrice || synced.max !== criteria.maxPrice) {
    setSynced({ min: criteria.minPrice, max: criteria.maxPrice });
    setMin(criteria.minPrice?.toString() ?? "");
    setMax(criteria.maxPrice?.toString() ?? "");
  }

  const applyPrice = (event: FormEvent) => {
    event.preventDefault();
    let minPrice = toAmount(min);
    let maxPrice = toAmount(max);
    // Des bornes inversées ne sont pas une erreur de l'utilisateur à lui
    // reprocher : on les remet dans l'ordre.
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      [minPrice, maxPrice] = [maxPrice, minPrice];
    }
    onChange({ minPrice, maxPrice });
  };

  const categories = path.famille?.categories ?? [];
  const sousCategories = path.categorie?.sousCategories ?? [];

  return (
    <div className={styles.filters}>
      <div className={styles.head}>
        <h2 className={styles.title}>Filtres</h2>
        {filterCount > 0 ? (
          <button type="button" className={styles.reset} onClick={onReset}>
            Tout effacer
          </button>
        ) : null}
      </div>

      <Group title="Rayon">

        <Select
          label="Domaine"
          value={path.famille?.id ?? ""}
          options={[
            { value: "", label: "Tous les domaines" },
            ...familles.map((famille) => ({ value: famille.id, label: famille.nom })),
          ]}
          onChange={(event) => onChange(taxonomy("familleId", event.target.value))}
        />

        {categories.length > 0 ? (
          <Select
            label="Catégorie"
            value={path.categorie?.id ?? ""}
            options={[
              { value: "", label: "Toutes les catégories" },
              ...categories.map((categorie) => ({ value: categorie.id, label: categorie.nom })),
            ]}
            onChange={(event) =>
              onChange(
                event.target.value
                  ? taxonomy("categoryId", event.target.value)
                  : taxonomy("familleId", path.famille?.id ?? "")
              )
            }
          />
        ) : null}

        {sousCategories.length > 0 ? (
          <Select
            label="Sous-catégorie"
            value={path.sousCategorie?.id ?? ""}
            options={[
              { value: "", label: "Toutes les sous-catégories" },
              ...sousCategories.map((sous) => ({ value: sous.id, label: sous.nom })),
            ]}
            onChange={(event) =>
              onChange(
                event.target.value
                  ? taxonomy("sousCategoryId", event.target.value)
                  : taxonomy("categoryId", path.categorie?.id ?? "")
              )
            }
          />
        ) : null}
      </Group>

      <form onSubmit={applyPrice}>
        <Group title="Prix (GNF)">

          <div className={styles.priceRow}>
            <label className={styles.priceField}>
              <span className={styles.priceLabel}>Min</span>
              <input
                className={styles.priceInput}
                inputMode="numeric"
                value={min}
                placeholder={priceRange ? String(priceRange.min) : "0"}
                onChange={(event) => setMin(event.target.value)}
              />
            </label>
            <span className={styles.dash} aria-hidden="true">
              —
            </span>
            <label className={styles.priceField}>
              <span className={styles.priceLabel}>Max</span>
              <input
                className={styles.priceInput}
                inputMode="numeric"
                value={max}
                placeholder={priceRange ? String(priceRange.max) : ""}
                onChange={(event) => setMax(event.target.value)}
              />
            </label>
          </div>

          {priceRange && priceRange.max > 0 ? (
            <p className={styles.hint}>
              De {formatPrice(priceRange.min)} à {formatPrice(priceRange.max)} dans cette
              sélection.
            </p>
          ) : null}

          <Button type="submit" variant="secondary" fullWidth>
            Appliquer
          </Button>
        </Group>
      </form>

      <Group title="Disponibilité">

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={criteria.inStock === true}
            onChange={(event) => onChange({ inStock: event.target.checked || undefined })}
          />
          En stock uniquement
        </label>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={criteria.discounted === true}
            onChange={(event) => onChange({ discounted: event.target.checked || undefined })}
          />
          En promotion
        </label>
      </Group>
    </div>
  );
};
