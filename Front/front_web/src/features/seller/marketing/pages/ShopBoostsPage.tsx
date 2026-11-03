import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Credits } from "../../../../entities/boost";
import type { ProductBoutique } from "../../../../entities/product";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { Alert } from "../../../../shared/ui";
import { useResource } from "../../../catalog";
import { fetchShopOffers, sellerPaths, useSellerShop } from "../../shared";
import { fetchBoosts, fetchCredits, fetchFeatured, type BoostList } from "../api/marketing.api";
import { BoostCard } from "../components/BoostCard";
import { CreditsPanel } from "../components/CreditsPanel";
import { FeaturedPanel } from "../components/FeaturedPanel";
import styles from "../components/Marketing.module.css";

type Tab = "active" | "ended";
const TABS: Record<Tab, string> = { active: "En cours", ended: "Terminés" };

// ─────────────────────────────────────────────
//  Mise en avant — /ma-boutique/:boutiqueId/mise-en-avant?onglet=
//  Les boosts (comme « booster une publication ») : la boutique paie un
//  budget pour que sa promotion ou ses produits soient vus davantage,
//  avec la mention « Sponsorisé ». Ses crédits, et ses produits phares.
// ─────────────────────────────────────────────
export const ShopBoostsPage = () => {
  const { shop } = useSellerShop();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("onglet") === "ended" ? "ended" : "active";
  const initial = (useLocation().state as { feedback?: string } | null)?.feedback ?? null;
  const [feedback, setFeedback] = useState<string | null>(initial);
  const [version, setVersion] = useState(0);

  useDocumentTitle(`Mise en avant — ${shop.nom}`);

  const loadBoosts = useCallback((signal: AbortSignal) => fetchBoosts(shop.id, tab, signal), [shop.id, tab]);
  const boosts = useResource<BoostList | null>(loadBoosts, null, `${shop.id}:${tab}:${version}`);
  const loadCredits = useCallback((signal: AbortSignal) => fetchCredits(shop.id, signal), [shop.id]);
  const credits = useResource<Credits | null>(loadCredits, null, `${shop.id}:${version}`);
  const loadFeatured = useCallback(
    async (signal: AbortSignal) => {
      const [featured, offers] = await Promise.all([fetchFeatured(shop.id, signal), fetchShopOffers(shop.id, 1, 100, signal)]);
      return { featured, offers: offers.items };
    },
    [shop.id]
  );
  const vitrine = useResource<{ featured: ProductBoutique[]; offers: ProductBoutique[] } | null>(loadFeatured, null, `${shop.id}:${version}`);

  const changed = (message: string) => {
    setFeedback(message);
    setVersion((value) => value + 1);
  };

  return (
    <div className={styles.page}>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}

      <div className={styles.toolbar}>
        <p className={styles.hint}>
          Un boost montre votre promotion ou vos produits à plus de clients, en tête des pages et des recherches, toujours avec la mention « Sponsorisé ». Vous fixez le budget ; ce qui n'est pas dépensé vous revient en crédits.
        </p>
        <Link className={styles.action} to={sellerPaths.newBoost(shop.id)}>
          Booster
        </Link>
      </div>

      {credits.data ? <CreditsPanel shopId={shop.id} credits={credits.data} onNavigate={navigate} /> : credits.error ? <Alert tone="danger">{credits.error}</Alert> : null}

      <div className={styles.tabs} role="tablist" aria-label="Boosts">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === tab}
            className={key === tab ? styles.tabOn : styles.tab}
            onClick={() => setParams(key === "active" ? {} : { onglet: key })}
          >
            {TABS[key]}
            {boosts.data ? <span className={styles.count}>{boosts.data.counts[key]}</span> : null}
          </button>
        ))}
      </div>

      {boosts.error ? (
        <Alert tone="danger">{boosts.error}</Alert>
      ) : boosts.isLoading || !boosts.data ? (
        <div className={styles.skeleton} aria-hidden="true" />
      ) : boosts.data.boosts.length === 0 ? (
        <p className={styles.empty}>
          {tab === "active" ? "Aucun boost en cours. Boostez une promotion en cours, ou directement des produits." : "Vos boosts terminés et leurs résultats s'afficheront ici."}
        </p>
      ) : (
        <ul className={styles.list}>
          {boosts.data.boosts.map((boost) => (
            <BoostCard key={boost.id} boost={boost} />
          ))}
        </ul>
      )}

      {vitrine.data ? (
        <FeaturedPanel featured={vitrine.data.featured} offers={vitrine.data.offers} onChanged={changed} storefront={sellerPaths.storefront(shop.id)} />
      ) : null}
    </div>
  );
};
