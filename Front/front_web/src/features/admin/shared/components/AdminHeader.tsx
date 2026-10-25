import type { ReactNode } from "react";
import { Breadcrumb, type Crumb } from "../../../catalog";
import { adminPaths } from "../utils/paths";
import styles from "./AdminHeader.module.css";

interface AdminHeaderProps {
  title: string;
  lede?: ReactNode;
  /** Fil d'Ariane après « Accueil / Administration » ; le dernier élément est la page courante. */
  trail?: Crumb[] | undefined;
  /** Action principale, alignée à droite du titre. */
  action?: ReactNode;
}

/** En-tête des pages d'administration : fil d'Ariane, titre, action. */
export const AdminHeader = ({ title, lede, trail = [], action }: AdminHeaderProps) => (
  <header className={styles.head}>
    <Breadcrumb
      items={[
        { label: "Accueil", to: "/" },
        trail.length > 0 ? { label: "Administration", to: adminPaths.home } : { label: "Administration" },
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
