import { Fragment } from "react";
import { Link } from "react-router-dom";
import styles from "./Breadcrumb.module.css";

export interface Crumb {
  label: string;
  /** Absent sur le dernier maillon : la page courante ne se lie pas à elle-même. */
  to?: string | undefined;
}

interface BreadcrumbProps {
  items: Crumb[];
}

export const Breadcrumb = ({ items }: BreadcrumbProps) => (
  <nav aria-label="Fil d'Ariane">
    <ol className={styles.trail}>
      {items.map((crumb, index) => {
        const last = index === items.length - 1;

        return (
          <Fragment key={`${crumb.label}-${index}`}>
            <li className={styles.item}>
              {crumb.to && !last ? (
                <Link className={styles.link} to={crumb.to}>
                  {crumb.label}
                </Link>
              ) : (
                <span className={styles.current} aria-current={last ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
            {last ? null : (
              <li className={styles.separator} aria-hidden="true">
                /
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  </nav>
);
