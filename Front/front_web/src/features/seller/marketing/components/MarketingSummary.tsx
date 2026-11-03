import { useCallback } from "react";
import { Link } from "react-router-dom";
import { formatPrice } from "../../../../entities/product";
import { AccountPanel } from "../../../account";
import { useResource } from "../../../catalog";
import { sellerPaths } from "../../shared";
import { fetchBoosts, fetchCredits, fetchShopPromotions } from "../api/marketing.api";
import styles from "./Marketing.module.css";

// Résumé pour le tableau de bord : promotions en cours, boosts, crédits.
export const MarketingSummary = ({ shopId }: { shopId: string }) => {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [promotions, boosts, credits] = await Promise.all([
        fetchShopPromotions(shopId, "active", signal),
        fetchBoosts(shopId, "active", signal),
        fetchCredits(shopId, signal),
      ]);
      return { promotions: promotions.counts, boosts: boosts.counts.active, balance: credits.balance };
    },
    [shopId]
  );
  const data = useResource(load, null, shopId);

  return (
    <AccountPanel title="Promotions et mise en avant" more={{ to: sellerPaths.promotions(shopId), label: "Promotions" }}>
      {data.data ? (
        <div className={styles.stats}>
          <Link className={styles.stat} to={sellerPaths.promotions(shopId)}>
            <span className={styles.statLabel}>Promotions en cours</span>
            <strong>{data.data.promotions.active}</strong>
          </Link>
          <Link className={styles.stat} to={sellerPaths.promotions(shopId, "scheduled")}>
            <span className={styles.statLabel}>Programmées</span>
            <strong>{data.data.promotions.scheduled}</strong>
          </Link>
          <Link className={styles.stat} to={sellerPaths.boosts(shopId)}>
            <span className={styles.statLabel}>Boosts en cours</span>
            <strong>{data.data.boosts}</strong>
          </Link>
          <Link className={styles.stat} to={sellerPaths.boosts(shopId)}>
            <span className={styles.statLabel}>Crédits de boost</span>
            <strong>{formatPrice(data.data.balance)}</strong>
          </Link>
        </div>
      ) : (
        <div className={styles.skeleton} aria-hidden="true" />
      )}
    </AccountPanel>
  );
};
