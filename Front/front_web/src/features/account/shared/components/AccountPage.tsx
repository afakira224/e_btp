import type { ReactNode } from "react";
import styles from "./AccountPage.module.css";

/**
 * Cadre d'une page du compte. Chaque rubrique est une page à part entière,
 * sans colonne partagée : on y arrive depuis « Mon compte » et on y revient
 * par le fil d'Ariane.
 *
 * `narrow` borne la largeur des pages de lecture et de formulaire : une
 * liste de commandes ou un formulaire étirés sur 1 200 px se lisent mal.
 */
export const AccountPage = ({
  width = "wide",
  children,
}: {
  width?: "wide" | "narrow";
  children: ReactNode;
}) => (
  <div className={`container ${styles.page}`}>
    <div className={width === "narrow" ? styles.narrow : undefined}>{children}</div>
  </div>
);
