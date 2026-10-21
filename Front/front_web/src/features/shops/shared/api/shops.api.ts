import { apiClient } from "../../../../shared/api";
import type { Shop } from "../../../../entities/shop";

// ─────────────────────────────────────────────
//  Boutiques — GET /shops et GET /shops/:id.
//
//  Contrairement aux offres, dont la boutique imbriquée passe par
//  `toShopResponseDto` (`id`), ces deux routes renvoient le document
//  Mongoose brut : `_id`, `deletedAt`, `__v`. On normalise ici, une fois,
//  pour que les composants ne connaissent que l'entité `Shop`. Si le back
//  se met à renvoyer le DTO, rien ne change côté front.
// ─────────────────────────────────────────────

type RawShop = Omit<Shop, "id"> & { id?: string; _id?: string };

/**
 * Liste blanche des champs repris : tout ce qui n'est pas nommé ici — le
 * téléphone de la boutique en premier lieu — est écarté dès la réception
 * et n'atteint jamais un composant.
 */
const toShop = (raw: RawShop): Shop => ({
  id: raw.id ?? raw._id ?? "",
  ownerId: String(raw.ownerId ?? ""),
  nom: raw.nom,
  description: raw.description,
  logo: raw.logo,
  email: raw.email,
  adresse: raw.adresse,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

interface RawShopPage {
  shops: RawShop[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ShopPage {
  items: Shop[];
  total: number;
  page: number;
  hasMore: boolean;
}

export const fetchShops = async (
  {
    search,
    ownerId,
    page,
    limit,
  }: { search?: string | undefined; ownerId?: string | undefined; page: number; limit: number },
  signal?: AbortSignal
): Promise<ShopPage> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set("search", search);
  if (ownerId) params.set("ownerId", ownerId);

  const response = await apiClient.get<RawShopPage>(`/shops?${params.toString()}`, signal);
  const data = response.data;
  if (!data) return { items: [], total: 0, page, hasMore: false };

  return {
    items: data.shops.map(toShop),
    total: data.total,
    page: data.page,
    hasMore: data.page < data.totalPages,
  };
};

export const fetchShop = async (id: string, signal?: AbortSignal): Promise<Shop> => {
  const response = await apiClient.get<RawShop>(`/shops/${encodeURIComponent(id)}`, signal);
  if (!response.data) throw new Error("Boutique introuvable.");
  return toShop(response.data);
};
