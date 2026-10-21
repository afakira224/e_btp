import type { ReactNode } from "react";
import { ThemeToggle } from "../../../../shared/ui";
import styles from "./AuthLayout.module.css";

interface AuthLayoutProps {
  /** Surtitre technique, ex. « 01 / Connexion ». */
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

// Chiffres de la plateforme : ils ancrent la promesse dans du concret
// plutôt que de la répéter en adjectifs.
const INDEX = [
  { value: "240", label: "Boutiques" },
  { value: "12 000", label: "Références" },
  { value: "08", label: "Régions" },
];

// ─────────────────────────────────────────────
//  AuthLayout
//  Cadre commun aux écrans d'authentification.
//  Chaque page n'apporte que son intitulé et son formulaire.
// ─────────────────────────────────────────────
export const AuthLayout = ({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: AuthLayoutProps) => (
  <div className={styles.layout}>
    <aside className={styles.brand}>
      <div className={styles.brandHead}>
        <span className={styles.wordmark}>BTP Platform</span>
        <span className={styles.brandMeta}>
          <span className={styles.rule} aria-hidden="true" />
          Conakry — Guinée
        </span>
      </div>

      <div>
        <h1 className={styles.headline}>Matériaux de construction.</h1>
        <p className={styles.lede}>
          Catalogue multi-boutiques, commandes suivies de bout en bout et gestion
          centralisée de vos fournisseurs.
        </p>
      </div>

      <dl className={styles.index}>
        {INDEX.map((entry) => (
          <div key={entry.label} className={styles.indexItem}>
            <dd className={styles.indexValue}>{entry.value}</dd>
            <dt className={styles.indexLabel}>{entry.label}</dt>
          </div>
        ))}
      </dl>
    </aside>

    <main className={styles.panel}>
      <div className={styles.panelHeader}>
        <ThemeToggle />
      </div>

      <div className={styles.panelBody}>
        <div className={styles.form}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2 className={styles.title}>{title}</h2>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}

          <div className={styles.content}>{children}</div>

          {footer ? <div className={styles.footer}>{footer}</div> : null}
        </div>
      </div>
    </main>
  </div>
);
