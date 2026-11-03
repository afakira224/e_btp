import { useCallback, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { PROMOTION_TABS, type PromotionTab } from "../../../../entities/promotion";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { Alert } from "../../../../shared/ui";
import { useResource } from "../../../catalog";
import { fetchShopOffers, sellerPaths, useSellerShop } from "../../shared";
import { fetchShopPromotions, type PromotionList } from "../api/marketing.api";
import { CampaignPanel } from "../components/CampaignPanel";
import { PromotionCard } from "../components/PromotionCard";
import styles from "../components/Marketing.module.css";

const TABS = Object.keys(PROMOTION_TABS) as PromotionTab[];

const EMPTY: Record<PromotionTab, string> = {
  active: "Aucune promotion en cours. Créez-en une : elle est en ligne dès que vous la lancez.",
  scheduled: "Rien de programmé, ni de brouillon.",
  ended: "Les promotions terminées ou arrêtées, avec leurs ventes, s'afficheront ici.",
};

// ─────────────────────────────────────────────
//  Promotions — /ma-boutique/:boutiqueId/promotions?onglet=
//  La boutique planifie et lance seule ses promotions ; aucune validation.
//  En cours (et en pause), programmées (et brouillons), terminées.
// ─────────────────────────────────────────────
export const ShopPromotionsPage = () => {
  const { shop } = useSellerShop();
  const [params, setParams] = useSearchParams();
  const raw = params.get("onglet");
  const tab: PromotionTab = TABS.includes(raw as PromotionTab) ? (raw as PromotionTab) : "active";
  const initial = (useLocation().state as { feedback?: string } | null)?.feedback ?? null;
  const [feedback, setFeedback] = useState<string | null>(initial);
  const [version, setVersion] = useState(0);

  useDocumentTitle(`Promotions — ${shop.nom}`);

  const load = useCallback((signal: AbortSignal) => fetchShopPromotions(shop.id, tab, signal), [shop.id, tab]);
  const list = useResource<PromotionList | null>(load, null, `${shop.id}:${tab}:${version}`);
  const loadOffers = useCallback((signal: AbortSignal) => fetchShopOffers(shop.id, 1, 100, signal), [shop.id]);
  const offers = useResource(loadOffers, null, shop.id);

  const changed = (message: string) => {
    setFeedback(message);
    setVersion((value) => value + 1);
  };

  const blocked = list.data?.promotionsBlockedUntil ?? null;

  return (
    <div className={styles.page}>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {blocked ? (
        <Alert tone="danger">
          {`Promotions suspendues par la modération jusqu'au ${new Date(blocked).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} : vos promotions et boosts sont arrêtés, et aucun nouveau ne peut être lancé d'ici là. `}
          <Link to={sellerPaths.support(shop.id)}>Voir la mesure</Link>
        </Alert>
      ) : null}

      <div className={styles.toolbar}>
        <p className={styles.hint}>
          Le prix barré est toujours le plus bas pratiqué sur 30 jours : une remise se voit à partir de 5 %. Une seule remise s'applique par produit, la meilleure pour le client.
        </p>
        {blocked ? null : (
          <Link className={styles.action} to={sellerPaths.newPromotion(shop.id)}>
            Nouvelle promotion
          </Link>
        )}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Promotions">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === tab}
            className={key === tab ? styles.tabOn : styles.tab}
            onClick={() => setParams(key === "active" ? {} : { onglet: key })}
          >
            {PROMOTION_TABS[key]}
            {list.data ? <span className={styles.count}>{list.data.counts[key]}</span> : null}
          </button>
        ))}
      </div>

      {list.error ? (
        <Alert tone="danger">{list.error}</Alert>
      ) : list.isLoading || !list.data ? (
        <div className={styles.skeleton} aria-hidden="true" />
      ) : list.data.promotions.length === 0 ? (
        <p className={styles.empty}>{EMPTY[tab]}</p>
      ) : (
        <ul className={styles.list}>
          {list.data.promotions.map((promo) => (
            <PromotionCard key={promo.id} promo={promo} onChanged={changed} />
          ))}
        </ul>
      )}

      {blocked ? null : <CampaignPanel shopId={shop.id} offers={offers.data?.items ?? []} onJoined={changed} />}
    </div>
  );
};
