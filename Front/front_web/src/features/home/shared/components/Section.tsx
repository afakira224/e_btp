import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert } from "../../../../shared/ui";
import styles from "./Section.module.css";

interface SectionProps {
  eyebrow: string;
  title: string;
  /** Lien « voir tout » aligné à droite du titre. */
  moreTo?: string | undefined;
  moreLabel?: string | undefined;
  isLoading?: boolean;
  error?: string | null;
  /** Nombre et forme des blocs d'attente, ajustés à la grille de la section. */
  skeleton?: { count: number; height: number; columns: string } | undefined;
  children: ReactNode;
}

export const Section = ({
  eyebrow,
  title,
  moreTo,
  moreLabel = "Voir tout",
  isLoading = false,
  error = null,
  skeleton,
  children,
}: SectionProps) => (
  <section className={styles.section}>
    <header className={styles.head}>
      <div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h2 className={styles.title}>{title}</h2>
      </div>
      {moreTo ? (
        <Link className={styles.more} to={moreTo}>
          {moreLabel} →
        </Link>
      ) : null}
    </header>

    {error ? (
      <Alert tone="danger">{error}</Alert>
    ) : isLoading && skeleton ? (
      <div
        className={styles.skeletons}
        style={{ gridTemplateColumns: skeleton.columns }}
        aria-hidden="true"
      >
        {Array.from({ length: skeleton.count }, (_, index) => (
          <div
            key={index}
            className={styles.skeleton}
            style={{ height: `${skeleton.height}px` }}
          />
        ))}
      </div>
    ) : (
      children
    )}
  </section>
);
