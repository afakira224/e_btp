import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./AccountPanel.module.css";

interface AccountPanelProps {
  title: string;
  description?: string | undefined;
  /** Lien « voir tout » aligné à droite du titre. */
  more?: { to: string; label: string } | undefined;
  children: ReactNode;
}

/** Bloc de contenu d'une rubrique : titre, description courte, contenu. */
export const AccountPanel = ({ title, description, more, children }: AccountPanelProps) => (
  <section className={styles.panel}>
    <header className={styles.head}>
      <div>
        <h2 className={styles.title}>{title}</h2>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {more ? (
        <Link className={styles.more} to={more.to}>
          {more.label} →
        </Link>
      ) : null}
    </header>
    <div className={styles.body}>{children}</div>
  </section>
);
