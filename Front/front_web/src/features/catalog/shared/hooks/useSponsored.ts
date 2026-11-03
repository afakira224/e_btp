import type { ProductBoutique } from "../../../../entities/product";
import { fetchSponsored, type SponsoredSlot } from "../api/catalog.api";
import { useResource } from "./useResource";

/**
 * Places sponsorisées d'une page. Le contexte (recherche, catégorie, offre
 * vue) dit au serveur ce qui est pertinent ; il fait partie de la clé de
 * lecture, qui relance la demande quand il change.
 */
export const useSponsored = (slot: SponsoredSlot, context: Record<string, string | undefined> = {}) => {
  const key = `${slot}|${Object.entries(context)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join("&")}`;
  return useResource<ProductBoutique[]>((signal) => fetchSponsored(slot, context, signal), [], key);
};

/** Les places sponsorisées en tête d'une liste, sans doublon. */
export const withSponsored = (sponsored: readonly ProductBoutique[], items: readonly ProductBoutique[]): ProductBoutique[] => {
  const ids = new Set(sponsored.map((offer) => offer.id));
  return [...sponsored, ...items.filter((offer) => !ids.has(offer.id))];
};
