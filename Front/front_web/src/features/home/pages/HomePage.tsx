import {
  BestSellersSection,
  CategorySection,
  NewArrivalsSection,
  RecommendedSection,
} from "../../catalog";
import { TrustBar } from "../../../shared/layout";
import { Hero } from "../hero";
import { PromotionsSection } from "../promotions";

// ─────────────────────────────────────────────
//  Page d'accueil.
//  Elle n'assemble que des sections : aucune logique métier, aucun appel
//  réseau ici — chaque section charge ce dont elle a besoin.
// ─────────────────────────────────────────────
export const HomePage = () => (
  <>
    <Hero />
    <TrustBar />

    <div className="container">
      <CategorySection />
      <NewArrivalsSection />
      <BestSellersSection />
      <RecommendedSection />
      <PromotionsSection />
    </div>
  </>
);
