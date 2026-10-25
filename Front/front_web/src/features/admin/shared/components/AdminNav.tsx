import { NavLink } from "react-router-dom";
import { adminPaths } from "../utils/paths";
import styles from "./AdminNav.module.css";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  [styles.tab, isActive ? styles.active : ""].filter(Boolean).join(" ");

/** Rubriques de l'administration, sous l'en-tête de chaque liste. */
export const AdminNav = () => (
  <nav className={styles.tabs} aria-label="Rubriques de l'administration">
    <NavLink className={tabClass} to={adminPaths.orders}>
      Commandes et litiges
    </NavLink>
    <NavLink className={tabClass} to={adminPaths.shopRequests}>
      Demandes de boutique
    </NavLink>
  </nav>
);
