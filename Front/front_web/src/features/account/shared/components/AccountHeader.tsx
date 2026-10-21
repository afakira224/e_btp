import type { ReactNode } from "react";
import { Breadcrumb, type Crumb } from "../../../catalog";
import styles from "./AccountHeader.module.css";

interface AccountHeaderProps {
  title: string;
  lede?: string | undefined;
  /**
   * Fil d'Ariane après « Accueil / Mon compte ». Vide sur la page « Mon
   * compte » elle-même ; le dernier élément est la page courante.
   */
  trail?: Crumb[] | undefined;
  /** Action principale, alignée à droite du titre. */
  action?: ReactNode;
}

/** En-tête commun des pages du compte : fil d'Ariane, titre, action. */
export const AccountHeader = ({ title, lede, trail = [], action }: AccountHeaderProps) => (
  <header className={styles.head}>
    <Breadcrumb
      items={[
        { label: "Accueil", to: "/" },
        trail.length > 0 ? { label: "Mon compte", to: "/compte" } : { label: "Mon compte" },
        ...trail,
      ]}
    />
    <div className={styles.row}>
      <h1 className={styles.title}>{title}</h1>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
    {lede ? <p className={styles.lede}>{lede}</p> : null}
  </header>
);
