// Point d'entrée de la feature catalogue.
export { CategorySection } from "./categories";
export { DomainMenu } from "./domains";
export {
  CategoriePage,
  FamillePage,
  FamillesPage,
  SousCategoriePage,
} from "./browse";
export { ProductPage } from "./product";
export { NewArrivalsPage, NewArrivalsSection } from "./new-arrivals";
export { BestSellersPage, BestSellersSection } from "./best-sellers";
export { PromotionsPage } from "./promotions";
export { RecommendedSection } from "./recommended";
export { ProductCard, RatingStars } from "./shared";

// Briques de liste réutilisées hors du catalogue (page de recherche) :
// elles passent par ce point d'entrée plutôt que par un chemin interne.
export {
  Breadcrumb,
  type Crumb,
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
  FamilleChips,
  InfiniteProductGrid,
  fetchFamilles,
  fetchListing,
  useFamilleParam,
  useInfiniteProducts,
  useListing,
  useResource,
  type ListingQuery,
  type ListingSort,
  type PageLoader,
  // Renommé : `ProductPage` désigne déjà ici la page de fiche produit.
  type ProductPage as ProductListPage,
} from "./shared";
