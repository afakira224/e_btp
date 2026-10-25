import type { ReactNode } from "react";
import styles from "./StatusBadge.module.css";

export type StatusBadgeTone = "neutral" | "progress" | "warning" | "success" | "danger";

interface StatusBadgeProps {
  tone: StatusBadgeTone;
  children: ReactNode;
}

/**
 * Pastille d'état (commande, sous-commande…). Les couleurs fonctionnelles de
 * la charte portent le sens — en cours, à surveiller, réussi, échoué — et le
 * libellé reste toujours écrit : la couleur n'est jamais seule à parler.
 */
export const StatusBadge = ({ tone, children }: StatusBadgeProps) => (
  <span className={[styles.badge, styles[tone]].join(" ")}>
    <span className={styles.dot} aria-hidden="true" />
    {children}
  </span>
);
