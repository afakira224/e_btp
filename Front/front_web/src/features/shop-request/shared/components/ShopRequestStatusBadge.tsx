import { SHOP_REQUEST_STATUS_LABELS, type ShopRequestStatus } from "../../../../entities/shop-request";
import styles from "./ShopRequestStatusBadge.module.css";

/**
 * Statut d'une demande : la couleur fonctionnelle porte le sens, le libellé
 * reste écrit — la couleur n'est jamais seule à parler.
 */
export const ShopRequestStatusBadge = ({ status }: { status: ShopRequestStatus }) => (
  <span className={[styles.badge, styles[status]].join(" ")}>
    <span className={styles.dot} aria-hidden="true" />
    {SHOP_REQUEST_STATUS_LABELS[status]}
  </span>
);
