import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Thumbnail } from "../../../../shared/ui";
import { byOrdre, type Categorie } from "../../../../entities/taxonomy";
import styles from "./CategorieTile.module.css";

// ─────────────────────────────────────────────
//  Une catégorie : image, nom, nombre de rayons et ses premiers rayons.
//  Les autres sont sur la page de la catégorie : avec cinquante rayons par
//  catégorie, tout lister noyait la page.
// ─────────────────────────────────────────────

/** Rayons montrés par catégorie ; les autres sont sur la page de la catégorie. */
const RAYONS_PAR_CATEGORIE = 5;

export const CategorieTiles = ({ children }: { children: ReactNode }) => (
  <div className={styles.tiles}>{children}</div>
);

export const CategorieTile = ({ categorie }: { categorie: Categorie }) => {
  // L'ordre du catalogue, pas l'alphabet (« gamme 2 » avant « gamme 10 »).
  const rayons = [...(categorie.sousCategories ?? [])].sort(byOrdre);
  const autres = rayons.length - RAYONS_PAR_CATEGORIE;

  return (
    <article className={styles.tile}>
      <Link className={styles.tileHead} to={`/categories/${categorie.id}`}>
        <span className={styles.tileThumb}>
          <Thumbnail src={categorie.image ?? undefined} alt={categorie.nom} seed={categorie.id} />
        </span>
        <span className={styles.tileText}>
          <span className={styles.tileNom}>{categorie.nom}</span>
          {categorie.description ? (
            <span className={styles.tileDesc}>{categorie.description}</span>
          ) : null}
          <span className={styles.tileMeta}>
            {rayons.length} rayon{rayons.length > 1 ? "s" : ""}
          </span>
        </span>
      </Link>

      {rayons.length > 0 ? (
        <ul className={styles.rayons}>
          {rayons.slice(0, RAYONS_PAR_CATEGORIE).map((rayon) => (
            <li key={rayon.id}>
              <Link className={styles.rayon} to={`/sous-categories/${rayon.id}`}>
                {rayon.nom}
              </Link>
            </li>
          ))}
          {autres > 0 ? (
            <li>
              <Link className={styles.voirTout} to={`/categories/${categorie.id}`}>
                {`+ ${autres} autre${autres > 1 ? "s" : ""} rayon${autres > 1 ? "s" : ""} →`}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </article>
  );
};
