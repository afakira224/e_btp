import { Link } from "react-router-dom";
import { Thumbnail } from "../../../../shared/ui";
import { Section } from "../../../home/shared";
import { fetchCategories, useResource } from "../../shared";
import styles from "./CategoryGrid.module.css";

export const CategorySection = () => {
  const { data, isLoading, error } = useResource(fetchCategories, []);

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
        {data.map((categorie) => (
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
