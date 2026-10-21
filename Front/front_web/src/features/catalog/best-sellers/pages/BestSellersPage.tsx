import type { ProductBoutique } from "../../../../entities/product";
import { Badge } from "../../../../shared/ui";
import {
  CatalogHeader,
  CatalogPage,
  InfiniteProductGrid,
} from "../../shared/components/CatalogPage";
import { FamilleChips, ProductCard, useFamilleParam, useListing } from "../../shared";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import styles from "./BestSellersPage.module.css";

const PAGE_SIZE = 12;
const PODIUM = 3;

/** Carte produit précédée de son rang dans le classement. */
const RankedCard = ({ item, rank }: { item: ProductBoutique; rank: number }) => (
  <div className={[styles.cell, rank <= PODIUM ? styles.podium : ""].filter(Boolean).join(" ")}>
    <div className={styles.rankRow}>
      <span className={styles.rank} aria-label={`Rang ${rank}`}>
        {String(rank).padStart(2, "0")}
      </span>
      {rank <= PODIUM ? <Badge tone="solid">Top {PODIUM}</Badge> : null}
    </div>
    <ProductCard item={item} />
  </div>
);

// ─────────────────────────────────────────────
//  Meilleures ventes — classement complet, chargé au défilement.
//
//  Le back n'expose pas de volume de ventes : le tri `popular` range les
//  offres par nombre d'avis clients. La page le dit en clair plutôt que de
//  promettre un classement « par ventes » qu'aucune donnée ne soutient.
//  Le rang est la position dans la liste filtrée : changer de domaine
//  recalcule le classement de ce domaine.
// ─────────────────────────────────────────────
export const BestSellersPage = () => {
  const familleId = useFamilleParam();
  const produits = useListing({ sort: "popular", familleId }, PAGE_SIZE);

  useDocumentTitle("Meilleures ventes");

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[{ label: "Accueil", to: "/" }, { label: "Meilleures ventes" }]}
        eyebrow="Les plus commandés"
        title="Meilleures ventes"
        lede="Le classement des articles les plus plébiscités par les clients des dépôts, établi sur le nombre d'avis laissés."
      />

      <FamilleChips total={produits.isLoading && produits.items.length === 0 ? undefined : produits.total} />

      <InfiniteProductGrid
        {...produits}
        pageSize={PAGE_SIZE}
        renderItem={(item, index) => <RankedCard item={item} rank={index + 1} />}
        empty={{
          title: "Aucun classement pour ce domaine",
          text: "Pas encore assez d'avis clients pour établir un classement ici.",
          action: { to: "/meilleures-ventes", label: "Voir le classement général" },
        }}
      />
    </CatalogPage>
  );
};
