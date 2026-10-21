import { Link } from "react-router-dom";
import type { ProductBoutique } from "../../../../entities/product";
import { ProductCard } from "../../shared";
import styles from "./ProductDetail.module.css";

interface ProductStripProps {
  title: string;
  /** Mention discrète sous le titre — provenance ou règle de sélection. */
  note?: string | undefined;
  items: ProductBoutique[];
  isLoading: boolean;
  /** Lien « voir tout », quand il existe une page pour ça. */
  moreTo?: string | undefined;
  moreLabel?: string | undefined;
  limit?: number;
}

// ─────────────────────────────────────────────
//  Bandeau de produits sous la fiche.
//  Une section vide ne s'affiche pas : un titre suivi de rien n'apprend
//  rien et allonge la page pour rien.
// ─────────────────────────────────────────────
export const ProductStrip = ({
  title,
  note,
  items,
  isLoading,
  moreTo,
  moreLabel = "Voir tout",
  limit = 4,
}: ProductStripProps) => {
  if (isLoading) {
    return (
      <section className={styles.related}>
        <h2 className={styles.relatedTitle}>{title}</h2>
        <div className={styles.relatedGrid} aria-hidden="true">
          {Array.from({ length: limit }, (_, index) => (
            <div key={index} className={styles.relatedSkeleton} />
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className={styles.related}>
      <div className={styles.relatedHead}>
        <div>
          <h2 className={styles.relatedTitle}>{title}</h2>
          {note ? <p className={styles.relatedNote}>{note}</p> : null}
        </div>
        {moreTo ? (
          <Link className={styles.relatedMore} to={moreTo}>
            {moreLabel} →
          </Link>
        ) : null}
      </div>

      <div className={styles.relatedGrid}>
        {items.slice(0, limit).map((item) => (
          <ProductCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
};
