import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert, Button } from "../../../../shared/ui";
import type { ProductBoutique } from "../../../../entities/product";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { ProductCard } from "./ProductCard";
import { useSentinel } from "../hooks/useInfiniteProducts";
import styles from "./CatalogPage.module.css";

// ─────────────────────────────────────────────
//  Briques partagées par les pages de navigation du catalogue.
//  Les quatre pages — familles, famille, catégorie, sous-catégorie —
//  ne diffèrent que par leur source de données et leur fil d'Ariane.
//  Tout le reste est ici.
// ─────────────────────────────────────────────

interface CatalogHeaderProps {
  crumbs: Crumb[];
  eyebrow: string;
  title: string;
  lede?: string | undefined;
  /** Nombre de résultats, affiché une fois le chargement terminé. */
  count?: number | undefined;
  countLabel?: string | undefined;
}

export const CatalogHeader = ({
  crumbs,
  eyebrow,
  title,
  lede,
  count,
  countLabel = "produits",
}: CatalogHeaderProps) => (
  <header className={styles.head}>
    <Breadcrumb items={crumbs} />
    <span className={styles.eyebrow}>{eyebrow}</span>
    <h1 className={styles.title}>{title}</h1>
    {lede ? <p className={styles.lede}>{lede}</p> : null}
    {count !== undefined ? (
      <span className={styles.count}>
        {count} {count > 1 ? countLabel : countLabel.replace(/s$/, "")}
      </span>
    ) : null}
  </header>
);

/** Nombre de colonnes sur grand écran ; 3 quand une colonne de filtres est à côté. */
type Columns = 3 | 4;

const withColumns = (base: string | undefined, columns: Columns) =>
  [base, columns === 3 ? styles.cols3 : ""].filter(Boolean).join(" ");

export const CatalogSkeletons = ({
  count = 8,
  columns = 4,
}: {
  count?: number;
  columns?: Columns;
}) => (
  <div className={withColumns(styles.skeletons, columns)} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className={styles.skeleton} />
    ))}
  </div>
);

interface EmptyStateProps {
  title: string;
  text: string;
  action?: { to: string; label: string } | undefined;
}

export const EmptyState = ({ title, text, action }: EmptyStateProps) => (
  <div className={styles.empty}>
    <p className={styles.emptyTitle}>{title}</p>
    <p className={styles.emptyText}>{text}</p>
    {action ? (
      <div className={styles.emptyAction}>
        <Link to={action.to}>
          <Button variant="secondary">{action.label}</Button>
        </Link>
      </div>
    ) : null}
  </div>
);

interface ProductGridProps {
  items: ProductBoutique[];
  isLoading: boolean;
  error: string | null;
  empty: EmptyStateProps;
}

export const ProductGrid = ({ items, isLoading, error, empty }: ProductGridProps) => {
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (isLoading) return <CatalogSkeletons />;
  if (items.length === 0) return <EmptyState {...empty} />;

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <ProductCard key={item.id} item={item} />
      ))}
    </div>
  );
};

interface InfiniteProductGridProps {
  items: ProductBoutique[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
  loadMore: () => void;
  retry: () => void;
  empty: EmptyStateProps;
  pageSize?: number;
  columns?: Columns;
  /** Rendu d'une vignette ; par défaut la carte produit standard. */
  renderItem?: ((item: ProductBoutique, index: number) => ReactNode) | undefined;
}

// ─────────────────────────────────────────────
//  Grille de produits chargée au défilement.
//  L'état vient du hook, tenu par la page : c'est elle qui a besoin du
//  total et des facettes pour ses filtres.
// ─────────────────────────────────────────────
export const InfiniteProductGrid = ({
  items,
  isLoading,
  error,
  hasMore,
  total,
  loadMore,
  retry,
  empty,
  pageSize = 12,
  columns = 4,
  renderItem,
}: InfiniteProductGridProps) => {
  // L'observateur se tait pendant un chargement ou après une erreur : sans
  // cela, une panne réseau déclencherait une rafale de requêtes.
  const sentinelRef = useSentinel(loadMore, {
    enabled: hasMore && !isLoading && !error,
    dependency: items.length,
  });

  const premierChargement = isLoading && items.length === 0;

  if (error && items.length === 0) {
    return (
      <>
        <Alert tone="danger">{error}</Alert>
        <div className={styles.foot}>
          <Button variant="secondary" onClick={retry}>
            Réessayer
          </Button>
        </div>
      </>
    );
  }

  if (premierChargement) return <CatalogSkeletons count={pageSize} columns={columns} />;
  if (items.length === 0) return <EmptyState {...empty} />;

  return (
    <>
      <div className={withColumns(styles.grid, columns)}>
        {items.map((item, index) =>
          renderItem ? (
            <Fragment key={item.id}>{renderItem(item, index)}</Fragment>
          ) : (
            <ProductCard key={item.id} item={item} />
          )
        )}

        {/* Les blocs d'attente prolongent la grille à la place exacte des
            vignettes à venir : la page ne sursaute pas. */}
        {isLoading
          ? Array.from({ length: Math.min(pageSize, total - items.length) }, (_, index) => (
              <div key={`attente-${index}`} className={styles.skeleton} aria-hidden="true" />
            ))
          : null}
      </div>

      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />

      <div className={styles.foot}>
        {/* Annoncé poliment : un lecteur d'écran doit savoir que la liste
            s'est allongée, sans être interrompu. */}
        <span className={styles.counter} role="status" aria-live="polite">
          {items.length} sur {total} produits
        </span>

        {error ? (
          <>
            <Alert tone="danger">{error}</Alert>
            <Button variant="secondary" onClick={retry}>
              Réessayer
            </Button>
          </>
        ) : hasMore ? (
          // Le bouton double le défilement automatique plutôt que de le
          // remplacer : au clavier, rien ne permet de « faire défiler pour
          // charger ».
          <Button variant="secondary" onClick={loadMore} isLoading={isLoading}>
            Charger plus de produits
          </Button>
        ) : (
          <p className={styles.end}>Vous avez parcouru toute la sélection.</p>
        )}
      </div>
    </>
  );
};

export interface FilterChip {
  to: string;
  label: string;
  count?: number | undefined;
  isActive: boolean;
}

/** Filtres de sous-catégories : de vrais liens, donc partageables. */
export const FilterChips = ({ chips }: { chips: FilterChip[] }) => (
  <div className={styles.filters}>
    {chips.map((chip) => (
      <Link
        key={chip.to}
        to={chip.to}
        className={[styles.chip, chip.isActive ? styles.chipActive : ""]
          .filter(Boolean)
          .join(" ")}
        aria-current={chip.isActive ? "page" : undefined}
      >
        {chip.label}
        {chip.count !== undefined ? (
          <span className={styles.chipCount}>{chip.count}</span>
        ) : null}
      </Link>
    ))}
  </div>
);

export const CatalogPage = ({ children }: { children: ReactNode }) => (
  <div className={`container ${styles.page}`}>{children}</div>
);
