import { Link } from "react-router-dom";
import type { Categorie } from "../../../../entities/taxonomy";
import styles from "./TaxonomyCard.module.css";

interface CategorieCardProps {
  categorie: Categorie;
}

// ─────────────────────────────────────────────
//  Une catégorie et ses sous-catégories.
//  Les sous-catégories sont des liens directs : depuis la page d'un
//  domaine, on doit pouvoir descendre de deux niveaux d'un seul clic.
// ─────────────────────────────────────────────
export const CategorieCard = ({ categorie }: CategorieCardProps) => {
  const sous = categorie.sousCategories ?? [];

  return (
    <div className={styles.categorie}>
      <div className={styles.categorieHead}>
        <Link className={styles.categorieNom} to={`/categories/${categorie.id}`}>
          {categorie.nom}
        </Link>
        <span className={styles.familleMeta} aria-hidden="true">
          →
        </span>
      </div>

      {categorie.description ? (
        <span className={styles.categorieDesc}>{categorie.description}</span>
      ) : null}

      {sous.length > 0 ? (
        <ul className={styles.sous}>
          {sous.map((sousCategorie) => (
            <li key={sousCategorie.id}>
              <Link
                className={styles.sousLien}
                to={`/sous-categories/${sousCategorie.id}`}
              >
                {sousCategorie.nom}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
