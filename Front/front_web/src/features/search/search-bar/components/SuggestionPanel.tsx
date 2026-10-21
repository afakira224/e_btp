import { useEffect, type ReactNode } from "react";
import { Thumbnail } from "../../../../shared/ui";
import { formatPrice } from "../../../../entities/product";
import { Highlight, type Suggestion, type TaxonomyLevel } from "../../shared";
import styles from "./SuggestionPanel.module.css";

const GROUP_LABEL: Record<Suggestion["kind"], string | null> = {
  recent: null, // porté par l'en-tête du panneau, avec son bouton « Effacer »
  taxonomy: "Rayons",
  product: "Produits",
  all: null,
};

const LEVEL_LABEL: Record<TaxonomyLevel, string> = {
  famille: "Domaine",
  categorie: "Catégorie",
  sousCategorie: "Sous-catégorie",
};

interface SuggestionPanelProps {
  isOpen: boolean;
  listboxId: string;
  query: string;
  suggestions: Suggestion[];
  active: number;
  isTyping: boolean;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  onHover: (index: number) => void;
  onSelect: (suggestion: Suggestion) => void;
  onClearRecent: () => void;
}

/** Regroupe les entrées consécutives de même origine, index global conservé. */
const groupByKind = (suggestions: Suggestion[]) => {
  const groups: { kind: Suggestion["kind"]; entries: { item: Suggestion; index: number }[] }[] =
    [];
  suggestions.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.kind === item.kind) last.entries.push({ item, index });
    else groups.push({ kind: item.kind, entries: [{ item, index }] });
  });
  return groups;
};

const OptionBody = ({ item, query }: { item: Suggestion; query: string }): ReactNode => {
  switch (item.kind) {
    case "recent":
      return (
        <>
          <span className={styles.glyph} aria-hidden="true">
            ↺
          </span>
          <span className={styles.label}>{item.label}</span>
        </>
      );

    case "taxonomy":
      return (
        <>
          <span className={styles.glyph} aria-hidden="true">
            ▦
          </span>
          <span className={styles.text}>
            <span className={styles.label}>
              <Highlight text={item.label} query={query} />
            </span>
            <span className={styles.meta}>
              {LEVEL_LABEL[item.level]}
              {item.parent ? ` · ${item.parent}` : ""}
            </span>
          </span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </>
      );

    case "product":
      return (
        <>
          <span className={styles.thumb}>
            <Thumbnail src={item.image} alt="" seed={item.id} />
          </span>
          <span className={styles.text}>
            <span className={styles.label}>
              <Highlight text={item.label} query={query} />
            </span>
            <span className={styles.meta}>{item.shop}</span>
          </span>
          <span className={styles.prices}>
            <span className={styles.price}>{formatPrice(item.price)}</span>
            {item.wasPrice !== undefined ? (
              <span className={styles.was}>{formatPrice(item.wasPrice)}</span>
            ) : null}
          </span>
        </>
      );

    case "all":
      return (
        <span className={styles.all}>
          Voir tous les résultats pour « {item.label} »
          <span aria-hidden="true"> →</span>
        </span>
      );
  }
};

export const SuggestionPanel = ({
  isOpen,
  listboxId,
  query,
  suggestions,
  active,
  isTyping,
  isLoading,
  isEmpty,
  error,
  onHover,
  onSelect,
  onClearRecent,
}: SuggestionPanelProps) => {
  const groups = groupByKind(suggestions);

  // La sélection au clavier reste visible quand le panneau défile.
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${listboxId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listboxId]);

  return (
    <div className={styles.panel} hidden={!isOpen}>
      {/* Filet de progression : les anciens résultats restent lisibles
          pendant que les nouveaux arrivent. */}
      {isLoading ? <span className={styles.progress} aria-hidden="true" /> : null}

      {!isTyping && suggestions.length > 0 ? (
        <div className={styles.head}>
          <span className={styles.groupLabel}>Recherches récentes</span>
          <button type="button" className={styles.clearRecent} onClick={onClearRecent}>
            Effacer
          </button>
        </div>
      ) : null}

      {error ? (
        <p className={styles.state}>
          {error} Appuyez sur Entrée pour lancer la recherche quand même.
        </p>
      ) : null}

      {isEmpty ? (
        <p className={styles.state}>
          Aucun produit ni rayon ne correspond à « {query} ». Essayez un terme plus
          général.
        </p>
      ) : null}

      {isLoading && suggestions.length === 0 && !error ? (
        <p className={styles.state}>Recherche en cours…</p>
      ) : null}

      <div
        id={listboxId}
        role="listbox"
        aria-label="Suggestions de recherche"
        className={[styles.listbox, isLoading ? styles.stale : ""].filter(Boolean).join(" ")}
      >
        {groups.map((group) => {
          const label = GROUP_LABEL[group.kind];
          const labelId = `${listboxId}-${group.kind}`;

          return (
            <div
              key={group.kind}
              role="group"
              aria-labelledby={label ? labelId : undefined}
              aria-label={label ? undefined : group.kind === "recent" ? "Recherches récentes" : "Tous les résultats"}
              className={group.kind === "all" ? styles.footGroup : styles.group}
            >
              {label ? (
                <div id={labelId} role="presentation" className={styles.groupLabel}>
                  {label}
                </div>
              ) : null}

              {group.entries.map(({ item, index }) => (
                <div
                  key={item.id}
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={[
                    styles.option,
                    styles[item.kind],
                    index === active ? styles.active : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  // Garder le focus dans le champ : sans cela, le clic ferait
                  // perdre le focus et refermerait la liste avant d'aboutir.
                  onMouseDown={(event) => event.preventDefault()}
                  // `mousemove` et non `mouseenter` : une liste qui défile
                  // sous un curseur immobile ne doit pas voler la sélection
                  // faite au clavier.
                  onMouseMove={() => {
                    if (index !== active) onHover(index);
                  }}
                  onClick={() => onSelect(item)}
                >
                  <OptionBody item={item} query={query} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
