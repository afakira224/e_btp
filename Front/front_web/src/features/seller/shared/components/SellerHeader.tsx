import type { ReactNode } from "react";
import { Breadcrumb, type Crumb } from "../../../catalog";
import { sellerPaths } from "../utils/paths";
import styles from "./SellerHeader.module.css";

interface SellerHeaderProps {
  title: string;
  lede?: ReactNode;
  /** Fil d'Ariane après « Accueil / Ma boutique » ; le dernier élément est la page courante. */
  trail?: Crumb[] | undefined;
  /** Action principale, alignée à droite du titre. */
  action?: ReactNode;
}

/** En-tête des pages vendeur : fil d'Ariane, titre, action. */
export const SellerHeader = ({ title, lede, trail = [], action }: SellerHeaderProps) => (
  <header className={styles.head}>
    <Breadcrumb
      items={[
        { label: "Accueil", to: "/" },
        trail.length > 0 ? { label: "Ma boutique", to: sellerPaths.home } : { label: "Ma boutique" },
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
