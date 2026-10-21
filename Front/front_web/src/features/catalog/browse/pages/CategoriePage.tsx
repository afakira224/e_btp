import { useCallback } from "react";
import { useParams } from "react-router-dom";
import type { Categorie } from "../../../../entities/taxonomy";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
  FilterChips,
  InfiniteProductGrid,
} from "../../shared/components/CatalogPage";
import {
  fetchCategorie,
  fetchFamilles,
  fetchProductsBy,
  useInfiniteProducts,
  useResource,
} from "../../shared";

const PAGE_SIZE = 8;

// ─────────────────────────────────────────────
//  Produits d'une catégorie.
//  Ses sous-catégories servent de filtres : ce sont de vrais liens, donc
//  une sélection reste partageable et revient avec le bouton Précédent.
// ─────────────────────────────────────────────
export const CategoriePage = () => {
  const { categorieId = "" } = useParams<{ categorieId: string }>();

  const loadCategorie = useCallback(
    (signal: AbortSignal) => fetchCategorie(categorieId, signal),
    [categorieId]
  );
  const loadProduits = useCallback(
    (page: number, limit: number, signal: AbortSignal) =>
      fetchProductsBy({ categoryId: categorieId }, page, limit, signal),
    [categorieId]
  );

  const categorie = useResource<Categorie | null>(loadCategorie, null, categorieId);
  const produits = useInfiniteProducts(loadProduits, {
    pageSize: PAGE_SIZE,
    key: categorieId,
  });
  // La famille n'est lue que pour le fil d'Ariane : on ne rompt pas la
  // chaîne de navigation sous prétexte qu'on est entré par un lien direct.
  const familles = useResource(fetchFamilles, []);

  if (categorie.error) {
    return (
      <CatalogPage>
        <CatalogHeader
          crumbs={[
            { label: "Accueil", to: "/" },
            { label: "Catalogue", to: "/categories" },
            { label: "Introuvable" },
          ]}
          eyebrow="Catalogue"
          title="Catégorie introuvable"
        />
        <EmptyState
          title="Cette catégorie n'existe pas"
          text={categorie.error}
          action={{ to: "/categories", label: "Voir tous les domaines" }}
        />
      </CatalogPage>
    );
  }

  const data = categorie.data;
  const famille = familles.data.find((candidate) =>
    candidate.categories.some((item) => item.id === data?.id)
  );
  const sous = data?.sousCategories ?? [];

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[
          { label: "Accueil", to: "/" },
          { label: "Catalogue", to: "/categories" },
          ...(famille ? [{ label: famille.nom, to: `/familles/${famille.id}` }] : []),
          { label: data?.nom ?? "…" },
        ]}
        eyebrow="Catégorie"
        title={data?.nom ?? "…"}
        lede={data?.description}
        {...(produits.total > 0 ? { count: produits.total } : {})}
      />

      {categorie.isLoading ? (
        <CatalogSkeletons />
      ) : (
        <>
          {sous.length > 0 ? (
            <FilterChips
              chips={[
                {
                  to: `/categories/${categorieId}`,
                  label: "Tout",
                  count: produits.total,
                  isActive: true,
                },
                // Pas de décompte par sous-catégorie : le back ne renvoie pas
                // de facettes, et le déduire des produits déjà chargés
                // donnerait un chiffre faux tant que tout n'est pas descendu.
                ...sous.map((sousCategorie) => ({
                  to: `/sous-categories/${sousCategorie.id}`,
                  label: sousCategorie.nom,
                  isActive: false,
                })),
              ]}
            />
          ) : null}

          <InfiniteProductGrid
            {...produits}
            pageSize={PAGE_SIZE}
            empty={{
              title: "Aucun produit dans cette catégorie",
              text: "Les boutiques n'ont pas encore référencé d'article ici.",
              action: { to: "/categories", label: "Voir tous les domaines" },
            }}
          />
        </>
      )}
    </CatalogPage>
  );
};
