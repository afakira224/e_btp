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
import { CategorieTile, CategorieTiles } from "../components/CategorieTile";
import styles from "./FamillePage.module.css";

const PAGE_SIZE = 8;

// ─────────────────────────────────────────────
//  Un domaine : ses catégories en tuiles (avec leurs premiers rayons, comme
//  sur la page catalogue), puis les produits qu'il contient tous niveaux
//  confondus.
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
          <CategorieTiles>
            {(data?.categories ?? []).map((categorie) => (
              <CategorieTile key={categorie.id} categorie={categorie} />
            ))}
          </CategorieTiles>

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
