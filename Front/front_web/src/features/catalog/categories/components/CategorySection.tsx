import { Link } from "react-router-dom";
import { Thumbnail } from "../../../../shared/ui";
import { Section } from "../../../home/shared";
import { fetchCategories, useResource } from "../../shared";
import styles from "./CategoryGrid.module.css";

// Un aperçu, pas le catalogue : 6 remplit la grille à 6, 3 ou 2 colonnes.
// Les autres sont sur /categories (« Toutes les catégories »).
const APERCU = 6;

export const CategorySection = () => {
  const { data, isLoading, error } = useResource(fetchCategories, []);
  const apercu = data.slice(0, APERCU);

  return (
    <Section
      eyebrow="Catalogue"
      title="Acheter par catégorie"
      moreTo="/categories"
      moreLabel="Toutes les catégories"
      isLoading={isLoading}
      error={error}
      skeleton={{ count: 6, height: 184, columns: "repeat(6, 1fr)" }}
    >
      <div className={styles.grid}>
        {apercu.map((categorie) => (
          <Link
            key={categorie.id}
            className={styles.tile}
            to={`/categories/${categorie.id}`}
          >
            <Thumbnail
              src={categorie.image ?? undefined}
              alt={categorie.nom}
              seed={categorie.id}
            />
            <div>
              <span className={styles.label}>
                <span className={styles.nom}>{categorie.nom}</span>
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </span>
              {categorie.description ? (
                <span className={styles.desc}>{categorie.description}</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
};
