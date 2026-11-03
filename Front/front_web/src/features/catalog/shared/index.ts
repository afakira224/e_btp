export { ProductCard } from "./components/ProductCard";
export { RatingStars } from "./components/RatingStars";
export { SponsoredNote } from "./components/SponsoredNote";
export { useSponsored, withSponsored } from "./hooks/useSponsored";
export { Breadcrumb, type Crumb } from "./components/Breadcrumb";
export {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
  FilterChips,
  InfiniteProductGrid,
  ProductGrid,
} from "./components/CatalogPage";
export { FamilleChips } from "./components/FamilleChips";
export { useFamilleParam } from "./hooks/useFamilleParam";
export { useResource } from "./hooks/useResource";
export { useListing } from "./hooks/useListing";
export {
  useInfiniteProducts,
  useSentinel,
  type PageLoader,
} from "./hooks/useInfiniteProducts";
export {
  fetchActivePromotions,
  fetchBestSellers,
  fetchCategorie,
  fetchCategories,
  fetchFamille,
  fetchFamilles,
  fetchProductsBy,
  fetchSousCategorie,
  type TaxonomyFilter,
  type ProductPage,
  fetchNewArrivals,
  fetchOffer,
  fetchFeaturedOffers,
  fetchSponsored,
  fetchCampaign,
  fetchCampaigns,
  offerPath,
  type SponsoredSlot,
  fetchOtherOffers,
  fetchRecentlyViewed,
  fetchShopOffers,
  fetchSuggestions,
  type ViewedOffer,
  fetchRecommended,
  fetchListing,
  type ListingQuery,
  type ListingSort,
  type Paginated,
} from "./api/catalog.api";
