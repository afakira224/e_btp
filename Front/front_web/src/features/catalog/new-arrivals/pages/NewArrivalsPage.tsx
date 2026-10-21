import type { ProductBoutique } from "../../../../entities/product";
import {
  CatalogHeader,
  CatalogPage,
  InfiniteProductGrid,
} from "../../shared/components/CatalogPage";
import { FamilleChips, ProductCard, useFamilleParam, useListing } from "../../shared";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import styles from "./NewArrivalsPage.module.css";

const PAGE_SIZE = 12;
const DAY = 24 * 60 * 60 * 1000;

const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

/** « aujourd'hui », « hier », « il y a 3 jours », « il y a 2 semaines »… */
const arrivedAgo = (createdAt: string): string => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / DAY));
  if (days < 7) return relative.format(-days, "day");
  if (days < 60) return relative.format(-Math.floor(days / 7), "week");
  return relative.format(-Math.floor(days / 30), "month");
};

/** Carte produit surmontée de sa date d'arrivée en rayon. */
const StampedCard = ({ item }: { item: ProductBoutique }) => (
  <div className={styles.cell}>
    <time className={styles.stamp} dateTime={item.createdAt}>
      Arrivé {arrivedAgo(item.createdAt)}
    </time>
    <ProductCard item={item} />
  </div>
);

// ─────────────────────────────────────────────
//  Nouveautés — les offres les plus récentes d'abord (tri `newest` du back).
//  Le back n'expose pas de filtre de date : la page ne prétend donc pas
//  s'arrêter à « 30 jours », elle déroule tout le catalogue par ancienneté.
//  Le badge « Nouveau » des cartes, lui, marque les moins de 30 jours.
// ─────────────────────────────────────────────
export const NewArrivalsPage = () => {
  const familleId = useFamilleParam();
  const produits = useListing({ sort: "newest", familleId }, PAGE_SIZE);

  useDocumentTitle("Nouveautés");

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[{ label: "Accueil", to: "/" }, { label: "Nouveautés" }]}
        eyebrow="Derniers arrivages"
        title="Nouveautés"
        lede="Les références que les dépôts viennent de mettre en rayon, des plus récentes aux plus anciennes."
      />

      <FamilleChips total={produits.isLoading && produits.items.length === 0 ? undefined : produits.total} />

      <InfiniteProductGrid
        {...produits}
        pageSize={PAGE_SIZE}
        renderItem={(item) => <StampedCard item={item} />}
        empty={{
          title: "Aucun arrivage dans ce domaine",
          text: "Les dépôts n'ont pas encore référencé de nouveauté ici.",
          action: { to: "/nouveautes", label: "Voir toutes les nouveautés" },
        }}
      />
    </CatalogPage>
  );
};
