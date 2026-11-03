import { apiClient } from "../../../../shared/api";
import type { ProductBoutique } from "../../../../entities/product";
import type {
  Categorie,
  Famille,
  SousCategorie,
} from "../../../../entities/taxonomy";
import type { Campaign, Promotion } from "../../../../entities/promotion";

// ─────────────────────────────────────────────
//  Lectures du catalogue, communes aux sub-features.
//  Les chemins reprennent ceux montés par le back
//  (Back/src/routers/router.router.ts).
// ─────────────────────────────────────────────

export const fetchCategories = async (signal?: AbortSignal): Promise<Categorie[]> => {
  const response = await apiClient.get<Categorie[]>("/categories", signal);
  return response.data ?? [];
};

/** Domaines : familles et leurs catégories, pour le menu de navigation. */
export const fetchFamilles = async (signal?: AbortSignal): Promise<Famille[]> => {
  const response = await apiClient.get<Famille[]>("/familles", signal);
  return response.data ?? [];
};

/** Une famille avec ses catégories et sous-catégories. */
export const fetchFamille = async (id: string, signal?: AbortSignal): Promise<Famille> => {
  const response = await apiClient.get<Famille>(
    `/familles/${encodeURIComponent(id)}`,
    signal
  );
  if (!response.data) throw new Error("Famille introuvable.");
  return response.data;
};

/** Une catégorie avec ses sous-catégories. */
export const fetchCategorie = async (
  id: string,
  signal?: AbortSignal
): Promise<Categorie> => {
  const response = await apiClient.get<Categorie>(
    `/categories/${encodeURIComponent(id)}`,
    signal
  );
  if (!response.data) throw new Error("Catégorie introuvable.");
  return response.data;
};

export const fetchSousCategorie = async (
  id: string,
  signal?: AbortSignal
): Promise<SousCategorie> => {
  const response = await apiClient.get<SousCategorie>(
    `/sous-categories/${encodeURIComponent(id)}`,
    signal
  );
  if (!response.data) throw new Error("Sous-catégorie introuvable.");
  return response.data;
};

// ─────────────────────────────────────────────
//  Listings de product-boutiques.
//
//  Trois routes distinctes côté back, on s'y tient :
//   • GET /product-boutiques                    filtres boutiqueId / productId / isFeatured
//   • GET /product-boutiques/search             texte, taxonomie, prix, tri
//   • GET /product-boutiques/:id/suggestions    produits similaires
//
//  Toutes les listes paginées renvoient `{ items, total, page, totalPages }`.
//  `hasMore` n'existe pas côté back : il se déduit de `page < totalPages`.
// ─────────────────────────────────────────────

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ProductPage {
  items: ProductBoutique[];
  page: number;
  hasMore: boolean;
  total: number;
}

const EMPTY_PAGE: Paginated<ProductBoutique> = {
  items: [],
  total: 0,
  page: 1,
  totalPages: 0,
};

const toProductPage = (page: Paginated<ProductBoutique>): ProductPage => ({
  items: page.items,
  page: page.page,
  total: page.total,
  hasMore: page.page < page.totalPages,
});

const getPage = async (
  path: string,
  signal?: AbortSignal
): Promise<Paginated<ProductBoutique>> => {
  const response = await apiClient.get<Paginated<ProductBoutique>>(path, signal);
  return response.data ?? EMPTY_PAGE;
};

/** Filtre de taxonomie — un seul niveau à la fois. */
export type TaxonomyFilter =
  | { familleId: string }
  | { categoryId: string }
  | { sousCategoryId: string };

export const fetchProductsBy = async (
  filter: TaxonomyFilter,
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<ProductPage> => {
  const [key, value] = Object.entries(filter)[0] as [string, string];
  return toProductPage(
    await getPage(
      `/product-boutiques/search?${key}=${encodeURIComponent(value)}&page=${page}&limit=${limit}&sort=popular`,
      signal
    )
  );
};

/** Derniers arrivages — tri `newest` du back. */
export const fetchNewArrivals = async (
  signal?: AbortSignal
): Promise<ProductBoutique[]> => {
  const page = await getPage(
    "/product-boutiques/search?sort=newest&page=1&limit=6",
    signal
  );
  return page.items;
};

/** Meilleures ventes : unités vendues et livrées sur 30 jours (calculées par le serveur). */
export const fetchBestSellers = async (
  signal?: AbortSignal
): Promise<ProductBoutique[]> => {
  const page = await getPage("/product-boutiques?sort=best_sellers&page=1&limit=10", signal);
  return page.items;
};

/** Produits phares d'une vitrine, dans l'ordre choisi par la boutique. */
export const fetchFeaturedOffers = async (
  boutiqueId: string,
  signal?: AbortSignal
): Promise<ProductBoutique[]> => {
  const page = await getPage(
    `/product-boutiques?boutiqueId=${encodeURIComponent(boutiqueId)}&featured=true&page=1&limit=6`,
    signal
  );
  return page.items;
};

/** Emplacements des places sponsorisées, et ce que chacune lit de la page. */
export type SponsoredSlot = "home" | "search" | "category" | "similar" | "promotions";

/**
 * Offres boostées d'une page, choisies par le serveur pour ce visiteur
 * (pertinence, fréquence, budget). Une erreur n'empêche jamais la page :
 * la place reste simplement vide.
 */
export const fetchSponsored = async (
  slot: SponsoredSlot,
  context: Record<string, string | undefined> = {},
  signal?: AbortSignal
): Promise<ProductBoutique[]> => {
  const params = new URLSearchParams({ slot });
  for (const [key, value] of Object.entries(context)) if (value) params.set(key, value);
  try {
    const response = await apiClient.get<ProductBoutique[]>(`/sponsored?${params.toString()}`, signal);
    return response.data ?? [];
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return [];
  }
};

/** Lien vers une fiche : depuis une place sponsorisée, la visite est attribuée au boost. */
export const offerPath = (offer: Pick<ProductBoutique, "id" | "sponsored">): string =>
  offer.sponsored
    ? `/produits/${offer.id}?src=${encodeURIComponent(`boost:${offer.sponsored.boostId}`)}`
    : `/produits/${offer.id}`;

/** Campagnes de la plateforme en cours ou à venir. */
export const fetchCampaigns = async (signal?: AbortSignal): Promise<Campaign[]> => {
  const response = await apiClient.get<Campaign[]>("/campaigns", signal);
  return response.data ?? [];
};

/** Une campagne et ses offres inscrites, la plus remisée d'abord. */
export const fetchCampaign = async (
  slug: string,
  signal?: AbortSignal
): Promise<Campaign & { offers: ProductBoutique[] }> => {
  const response = await apiClient.get<Campaign & { offers: ProductBoutique[] }>(
    `/campaigns/${encodeURIComponent(slug)}`,
    signal
  );
  if (!response.data) throw new Error("Campagne introuvable.");
  return response.data;
};

/**
 * Fil de recommandations.
 * Le back n'expose pas d'endpoint de recommandation personnalisée : c'est
 * le catalogue paginé, trié par popularité. Le nom de la section promet
 * plus que la donnée ne tient — à revoir le jour où un vrai moteur existe.
 */
export const fetchRecommended = async (
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<ProductPage> =>
  toProductPage(
    await getPage(
      `/product-boutiques/search?sort=popular&page=${page}&limit=${limit}`,
      signal
    )
  );

/**
 * Détail d'une offre. L'identifiant est celui du `product_boutique`, pas du
 * produit : c'est l'offre qui porte le prix, le stock et la boutique.
 */
export const fetchOffer = async (
  id: string,
  signal?: AbortSignal,
  /** Provenance (`boost:<id>`) : une visite depuis une place sponsorisée est comptée. */
  src?: string
): Promise<ProductBoutique> => {
  const response = await apiClient.get<ProductBoutique>(
    `/product-boutiques/${encodeURIComponent(id)}${src ? `?src=${encodeURIComponent(src)}` : ""}`,
    signal
  );
  if (!response.data) throw new Error("Produit introuvable.");
  return response.data;
};

/**
 * Produits similaires. Le back applique une cascade de pertinence :
 * même sous-catégorie (3) > même catégorie (2) > même famille (1).
 */
export const fetchSuggestions = async (
  offerId: string,
  limit: number,
  signal?: AbortSignal
): Promise<ProductBoutique[]> => {
  const response = await apiClient.get<ProductBoutique[]>(
    `/product-boutiques/${encodeURIComponent(offerId)}/suggestions?limit=${limit}`,
    signal
  );
  return response.data ?? [];
};

/** Autres offres du même produit, chez d'autres dépôts. */
export const fetchOtherOffers = async (
  productId: string,
  signal?: AbortSignal
): Promise<ProductBoutique[]> => {
  const page = await getPage(
    `/product-boutiques?productId=${encodeURIComponent(productId)}&page=1&limit=10`,
    signal
  );
  return page.items;
};

/** Autres produits du même dépôt. */
export const fetchShopOffers = async (
  boutiqueId: string,
  signal?: AbortSignal
): Promise<ProductBoutique[]> => {
  const page = await getPage(
    `/product-boutiques?boutiqueId=${encodeURIComponent(boutiqueId)}&page=1&limit=10`,
    signal
  );
  return page.items;
};

/** Offre enrichie de sa date de consultation, comme le back la renvoie. */
export type ViewedOffer = ProductBoutique & { viewedAt: string };

/**
 * Historique de consultation. La route est protégée par `requireAuth` et
 * `requireSelf` : un visiteur anonyme n'a pas d'historique, et il n'y a pas
 * de repli local — ce serait une donnée que le serveur ne connaîtrait pas.
 */
export const fetchRecentlyViewed = async (
  userId: string,
  signal?: AbortSignal
): Promise<ViewedOffer[]> => {
  const response = await apiClient.get<ViewedOffer[]>(
    `/product-boutiques/recently-viewed/${encodeURIComponent(userId)}`,
    signal
  );
  return response.data ?? [];
};

/**
 * Ventes flash en cours, la plus proche de sa fin d'abord.
 * `GET /promotions` renvoie un objet paginé `{ promotions, … }` et ne filtre
 * pas sur la fenêtre de dates : `/promotions/flash/active` fait les deux
 * vérifications côté serveur et renvoie directement le tableau.
 */
export const fetchActivePromotions = async (
  signal?: AbortSignal
): Promise<Promotion[]> => {
  const response = await apiClient.get<Promotion[]>("/promotions/flash/active", signal);
  return response.data ?? [];
};

// ─────────────────────────────────────────────
//  Listes éditoriales paginées — nouveautés, meilleures ventes, promotions.
//  Toutes passent par /product-boutiques/search : seuls le tri et les
//  filtres changent.
// ─────────────────────────────────────────────
export type ListingSort = "newest" | "popular" | "rating" | "price_asc" | "price_desc" | "best_sellers" | "discount";

export interface ListingQuery {
  sort: ListingSort;
  familleId?: string | undefined;
  /** Offres dont le prix remisé est inférieur au prix. */
  discounted?: boolean | undefined;
  /** Limite la liste aux offres d'une boutique. */
  boutiqueId?: string | undefined;
  /** Texte libre, sur le nom et la description du produit. */
  q?: string | undefined;
  /** Offres inscrites à une campagne de la plateforme. */
  campaignId?: string | undefined;
}

export const fetchListing = async (
  query: ListingQuery,
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<ProductPage> => {
  const params = new URLSearchParams({ sort: query.sort, page: String(page), limit: String(limit) });
  if (query.familleId) params.set("familleId", query.familleId);
  if (query.discounted) params.set("discounted", "true");
  if (query.boutiqueId) params.set("boutiqueId", query.boutiqueId);
  if (query.q) params.set("q", query.q);
  if (query.campaignId) params.set("campaignId", query.campaignId);
  return toProductPage(await getPage(`/product-boutiques/search?${params.toString()}`, signal));
};
