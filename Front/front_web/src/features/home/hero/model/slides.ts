import type { ProductBoutique } from "../../../../entities/product";

// ─────────────────────────────────────────────
//  Contenu du carrousel.
//
//  Chaque diapositive porte un angle différent — catalogue, déstockage,
//  compte professionnel — et sa propre sélection de produits. Trois
//  variations du même message n'auraient aucun intérêt : si l'utilisateur
//  attend le passage suivant, il doit y gagner quelque chose.
// ─────────────────────────────────────────────

/** Comment la diapositive choisit les produits qu'elle met en avant. */
export type SlideSource = "best-sellers" | "discounted" | "new-arrivals";

export interface HeroSlide {
  id: string;
  eyebrow: string;
  /** Pastille d'accent devant le surtitre — réservée à l'urgence réelle. */
  flagged?: boolean;
  title: string;
  lede: string;
  primary: { to: string; label: string };
  secondary: { to: string; label: string };
  source: SlideSource;
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "catalogue",
    eyebrow: "Catalogue",
    title: "Tout le chantier, au même endroit.",
    lede: "Ciment, ferraillage, revêtements, outillage : commandez auprès des dépôts de Conakry et suivez vos livraisons jusqu'au chantier.",
    primary: { to: "/categories", label: "Parcourir le catalogue" },
    secondary: { to: "/meilleures-ventes", label: "Voir les meilleures ventes" },
    source: "best-sellers",
  },
  {
    id: "destockage",
    eyebrow: "Déstockage en cours",
    flagged: true,
    title: "Jusqu'à 20 % sur une sélection.",
    lede: "Fins de série et surplus de dépôt, au prix du déstockage. Quantités limitées, servies dans l'ordre d'arrivée des commandes.",
    primary: { to: "/promotions", label: "Voir la sélection" },
    secondary: { to: "/categories", label: "Parcourir le catalogue" },
    source: "discounted",
  },
  {
    id: "professionnel",
    eyebrow: "Compte professionnel",
    title: "Des tarifs négociés pour vos chantiers.",
    lede: "Entreprises et artisans : prix dégressifs, paiement à 30 jours et un interlocuteur dédié, du devis à la livraison sur site.",
    primary: { to: "/signup", label: "Ouvrir un compte" },
    secondary: { to: "/devis", label: "Demander un devis" },
    source: "new-arrivals",
  },
];

/** Trois produits par diapositive, choisis selon son angle. */
export const pickProducts = (
  source: SlideSource,
  bestSellers: ProductBoutique[],
  newArrivals: ProductBoutique[]
): ProductBoutique[] => {
  if (source === "discounted") {
    // La remise la plus forte d'abord : la diapositive promet un prix,
    // elle doit montrer les meilleurs.
    return [...bestSellers, ...newArrivals]
      .filter((item) => item.discountPrice != null)
      .filter(
        (item, index, all) => all.findIndex((other) => other.id === item.id) === index
      )
      .sort(
        (a, b) =>
          (b.price - (b.discountPrice ?? b.price)) / b.price -
          (a.price - (a.discountPrice ?? a.price)) / a.price
      )
      .slice(0, 3);
  }

  if (source === "new-arrivals") return newArrivals.slice(0, 3);

  return bestSellers.slice(0, 3);
};
