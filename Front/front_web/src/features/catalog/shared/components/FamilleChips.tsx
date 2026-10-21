import { useLocation, useSearchParams } from "react-router-dom";
import { fetchFamilles } from "../api/catalog.api";
import { useResource } from "../hooks/useResource";
import { FAMILLE_PARAM, useFamilleParam } from "../hooks/useFamilleParam";
import { FilterChips } from "./CatalogPage";

// ─────────────────────────────────────────────
//  Filtre par domaine pour les listes éditoriales (nouveautés, meilleures
//  ventes, promotions). De vrais liens, comme les sous-catégories des pages
//  catalogue : Précédent revient au filtre d'avant.
// ─────────────────────────────────────────────
export const FamilleChips = ({ total }: { total?: number | undefined }) => {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const active = useFamilleParam();
  const familles = useResource(fetchFamilles, []);

  // Tant que les domaines ne sont pas là, on ne montre pas un « Tout » seul.
  if (familles.data.length === 0) return null;

  // Les autres paramètres (le tri, par exemple) survivent au changement
  // de domaine.
  const linkFor = (familleId: string | null) => {
    const next = new URLSearchParams(params);
    if (familleId) next.set(FAMILLE_PARAM, familleId);
    else next.delete(FAMILLE_PARAM);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <FilterChips
      chips={[
        {
          to: linkFor(null),
          label: "Tout",
          count: active ? undefined : total,
          isActive: !active,
        },
        ...familles.data.map((famille) => ({
          to: linkFor(famille.id),
          label: famille.nom,
          count: active === famille.id ? total : undefined,
          isActive: active === famille.id,
        })),
      ]}
    />
  );
};
