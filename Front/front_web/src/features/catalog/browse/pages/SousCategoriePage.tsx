import { useCallback } from "react";
import { useParams } from "react-router-dom";
import type { SousCategorie } from "../../../../entities/taxonomy";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
  FilterChips,
  InfiniteProductGrid,
} from "../../shared/components/CatalogPage";
import {
  fetchFamilles,
  fetchProductsBy,
  fetchSousCategorie,
  useInfiniteProducts,
  useResource,
} from "../../shared";

const PAGE_SIZE = 8;

// ─────────────────────────────────────────────
//  Produits d'une sous-catégorie.
//  Les sous-catégories sœurs restent affichées : arrivé au niveau le plus
//  fin, on doit pouvoir glisser latéralement sans remonter d'un cran.
// ─────────────────────────────────────────────
export const SousCategoriePage = () => {
  const { sousCategorieId = "" } = useParams<{ sousCategorieId: string }>();

  const loadSous = useCallback(
    (signal: AbortSignal) => fetchSousCategorie(sousCategorieId, signal),
    [sousCategorieId]
  );
  const loadProduits = useCallback(
    (page: number, limit: number, signal: AbortSignal) =>
      fetchProductsBy({ sousCategoryId: sousCategorieId }, page, limit, signal),
    [sousCategorieId]
  );

  const sous = useResource<SousCategorie | null>(loadSous, null, sousCategorieId);
  const produits = useInfiniteProducts(loadProduits, {
    pageSize: PAGE_SIZE,
    key: sousCategorieId,
  });
  const familles = useResource(fetchFamilles, []);

  if (sous.error) {
    return (
      <CatalogPage>
        <CatalogHeader
          crumbs={[
            { label: "Accueil", to: "/" },
            { label: "Catalogue", to: "/categories" },
            { label: "Introuvable" },
          ]}
          eyebrow="Catalogue"
          title="Sous-catégorie introuvable"
        />
        <EmptyState
          title="Cette sous-catégorie n'existe pas"
          text={sous.error}
          action={{ to: "/categories", label: "Voir tous les domaines" }}
        />
      </CatalogPage>
    );
  }

  const data = sous.data;

  // Remontée de la chaîne depuis l'arbre des domaines.
  // `SousCategorieResponseDto` n'expose aucun lien vers sa catégorie : le
  // parent se retrouve en cherchant qui la contient, pas en lisant un
  // identifiant. C'est la forme du DTO qui l'impose.
  const categorie = familles.data
    .flatMap((famille) => famille.categories)
    .find((candidate) =>
      (candidate.sousCategories ?? []).some((item) => item.id === sousCategorieId)
    );
  const famille = familles.data.find((candidate) =>
    candidate.categories.some((item) => item.id === categorie?.id)
  );
  const soeurs = categorie?.sousCategories ?? [];

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[
          { label: "Accueil", to: "/" },
          { label: "Catalogue", to: "/categories" },
          ...(famille ? [{ label: famille.nom, to: `/familles/${famille.id}` }] : []),
          ...(categorie
            ? [{ label: categorie.nom, to: `/categories/${categorie.id}` }]
            : []),
          { label: data?.nom ?? "…" },
        ]}
        eyebrow="Sous-catégorie"
        title={data?.nom ?? "…"}
        lede={data?.description}
        {...(produits.total > 0 ? { count: produits.total } : {})}
      />

      {sous.isLoading ? (
        <CatalogSkeletons />
      ) : (
        <>
          {categorie ? (
            <FilterChips
              chips={[
                {
                  to: `/categories/${categorie.id}`,
                  label: "Tout",
                  isActive: false,
                },
                ...soeurs.map((soeur) => ({
                  to: `/sous-categories/${soeur.id}`,
                  label: soeur.nom,
                  isActive: soeur.id === sousCategorieId,
                })),
              ]}
            />
          ) : null}

          <InfiniteProductGrid
            {...produits}
            pageSize={PAGE_SIZE}
            empty={{
              title: "Aucun produit dans cette sous-catégorie",
              text: "Les boutiques n'ont pas encore référencé d'article ici.",
              ...(categorie
                ? {
                    action: {
                      to: `/categories/${categorie.id}`,
                      label: `Voir toute la catégorie ${categorie.nom}`,
                    },
                  }
                : {}),
            }}
          />
        </>
      )}
    </CatalogPage>
  );
};
