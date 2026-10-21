import { useCallback } from "react";
import { useParams } from "react-router-dom";
import type { Famille } from "../../../../entities/taxonomy";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
  InfiniteProductGrid,
} from "../../shared/components/CatalogPage";
import {
  fetchFamille,
  fetchProductsBy,
  useInfiniteProducts,
  useResource,
} from "../../shared";

const PAGE_SIZE = 8;
import { CategorieCard } from "../components/CategorieCard";
import styles from "../components/TaxonomyCard.module.css";

// ─────────────────────────────────────────────
//  Un domaine : ses catégories, leurs sous-catégories, et les produits
//  qu'il contient tous niveaux confondus.
// ─────────────────────────────────────────────
export const FamillePage = () => {
  const { familleId = "" } = useParams<{ familleId: string }>();

  const loadFamille = useCallback(
    (signal: AbortSignal) => fetchFamille(familleId, signal),
    [familleId]
  );
  const loadProduits = useCallback(
    (page: number, limit: number, signal: AbortSignal) =>
      fetchProductsBy({ familleId }, page, limit, signal),
    [familleId]
  );

  const famille = useResource<Famille | null>(loadFamille, null, familleId);
  const produits = useInfiniteProducts(loadProduits, {
    pageSize: PAGE_SIZE,
    key: familleId,
  });

  if (famille.error) {
    return (
      <CatalogPage>
        <CatalogHeader
          crumbs={[{ label: "Accueil", to: "/" }, { label: "Catalogue", to: "/categories" }, { label: "Introuvable" }]}
          eyebrow="Catalogue"
          title="Domaine introuvable"
        />
        <EmptyState
          title="Ce domaine n'existe pas"
          text={famille.error}
          action={{ to: "/categories", label: "Voir tous les domaines" }}
        />
      </CatalogPage>
    );
  }

  const data = famille.data;

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[
          { label: "Accueil", to: "/" },
          { label: "Catalogue", to: "/categories" },
          { label: data?.nom ?? "…" },
        ]}
        eyebrow="Domaine"
        title={data?.nom ?? "…"}
        lede={data?.description}
        {...(produits.total > 0 ? { count: produits.total } : {})}
      />

      {famille.isLoading ? (
        <CatalogSkeletons count={3} />
      ) : (
        <>
          <div className={styles.categories}>
            {(data?.categories ?? []).map((categorie) => (
              <CategorieCard key={categorie.id} categorie={categorie} />
            ))}
          </div>

          <div className={styles.produits}>
            <h2 className={styles.produitsTitre}>Produits du domaine</h2>
            <InfiniteProductGrid
              {...produits}
              pageSize={PAGE_SIZE}
              empty={{
                title: "Aucun produit dans ce domaine",
                text: "Les boutiques n'ont pas encore référencé d'article ici.",
                action: { to: "/categories", label: "Voir tous les domaines" },
              }}
            />
          </div>
        </>
      )}
    </CatalogPage>
  );
};
