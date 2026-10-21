import { Link } from "react-router-dom";
import { Alert } from "../../../../shared/ui";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
} from "../../shared/components/CatalogPage";
import { fetchFamilles, useResource } from "../../shared";
import { CategorieCard } from "../components/CategorieCard";
import styles from "../components/TaxonomyCard.module.css";

// ─────────────────────────────────────────────
//  Racine du catalogue : toutes les familles, chacune avec ses catégories
//  et leurs sous-catégories. C'est la carte complète de la taxonomie sur
//  une seule page.
// ─────────────────────────────────────────────
export const FamillesPage = () => {
  const { data, isLoading, error } = useResource(fetchFamilles, []);

  const nbCategories = data.reduce(
    (total, famille) => total + famille.categories.length,
    0
  );

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[{ label: "Accueil", to: "/" }, { label: "Catalogue" }]}
        // Le surtitre ne répète pas le dernier maillon du fil d'Ariane :
        // « Catalogue / Catalogue » ne dit rien de plus.
        eyebrow="Parcourir"
        title="Tous les domaines"
        lede="Parcourez le catalogue par domaine, puis par catégorie et sous-catégorie."
        {...(isLoading || error
          ? {}
          : { count: nbCategories, countLabel: "catégories" })}
      />

      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : isLoading ? (
        <CatalogSkeletons count={4} />
      ) : data.length === 0 ? (
        <EmptyState
          title="Catalogue vide"
          text="Aucun domaine n'est publié pour le moment."
          action={{ to: "/", label: "Retour à l'accueil" }}
        />
      ) : (
        <div className={styles.familles}>
          {data.map((famille) => (
            <section key={famille.id} className={styles.famille}>
              <div className={styles.familleHead}>
                <div>
                  <Link className={styles.familleNom} to={`/familles/${famille.id}`}>
                    {famille.nom}
                  </Link>
                  {famille.description ? (
                    <p className={styles.familleDesc}>{famille.description}</p>
                  ) : null}
                </div>
                <span className={styles.familleMeta}>
                  {famille.categories.length} catégories
                </span>
              </div>

              <div className={styles.categories}>
                {famille.categories.map((categorie) => (
                  <CategorieCard key={categorie.id} categorie={categorie} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </CatalogPage>
  );
};
