import { useState } from "react";
import { Link } from "react-router-dom";
import { formatPrice } from "../../../../entities/product";
import {
  promotionSummary,
  SHOP_PROMOTION_STATUS_LABELS,
  SHOP_PROMOTION_STATUS_TONES,
  type PromotionAction,
  type ShopPromotion,
} from "../../../../entities/promotion";
import { ApiError } from "../../../../shared/api";
import { Alert, Button, Input, StatusBadge, Thumbnail } from "../../../../shared/ui";
import { sellerPaths } from "../../shared";
import { runPromotionAction } from "../api/marketing.api";
import styles from "./Marketing.module.css";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const formatDate = (iso: string) => dateFormat.format(new Date(iso));

const ACTION_LABELS: Record<PromotionAction, string> = {
  launch: "Lancer",
  pause: "Mettre en pause",
  resume: "Reprendre",
  extend: "Prolonger",
  stop: "Arrêter",
};

/** Un boost montre des produits : un code ou une livraison offerte n'en a pas. */
const boostable = (promo: ShopPromotion) =>
  (promo.status === "active" || promo.status === "scheduled") && promo.type !== "coupon" && promo.type !== "free_shipping";

const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

// ─────────────────────────────────────────────
//  Une promotion de la boutique : ce qu'elle fait, ses dates, ses ventes,
//  et les actions que son état permet (calculées par le serveur).
// ─────────────────────────────────────────────
export const PromotionCard = ({ promo, onChanged }: { promo: ShopPromotion; onChanged: (message: string) => void }) => {
  const [busy, setBusy] = useState<PromotionAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extending, setExtending] = useState(false);
  const [endDate, setEndDate] = useState(promo.endDate ? toLocalInput(promo.endDate) : "");

  const run = async (action: PromotionAction) => {
    if (action === "stop" && !window.confirm(`Arrêter « ${promo.nom} » ? Les prix reviennent à la normale et elle ne pourra pas reprendre.`)) return;
    setBusy(action);
    setError(null);
    try {
      const body = action === "extend" ? { endDate: new Date(endDate).toISOString() } : {};
      const { message } = await runPromotionAction(promo.id, action, body);
      setExtending(false);
      onChanged(message);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "L'action a échoué. Réessayez.");
    } finally {
      setBusy(null);
    }
  };

  const editable = promo.status === "draft" || promo.status === "scheduled";
  const stats = promo.stats;

  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <span className={styles.eyebrow}>{promo.typeLabel}</span>
          <h3 className={styles.cardTitle}>
            {editable ? <Link to={sellerPaths.editPromotion(promo.boutiqueId, promo.id)}>{promo.nom}</Link> : promo.nom}
          </h3>
        </div>
        <StatusBadge tone={SHOP_PROMOTION_STATUS_TONES[promo.status]}>{SHOP_PROMOTION_STATUS_LABELS[promo.status]}</StatusBadge>
      </div>

      <ul className={styles.meta}>
        <li>{promotionSummary(promo, formatPrice)}</li>
        <li>
          {promo.endDate ? `Du ${formatDate(promo.startDate)} au ${formatDate(promo.endDate)}` : `Depuis le ${formatDate(promo.startDate)}, sans fin`}
        </li>
        {promo.type === "flash_sale" && promo.flashQuantity ? <li>{`${promo.flashSold} / ${promo.flashQuantity} vendues`}</li> : null}
        {promo.type === "coupon" ? <li>{`${promo.usedCount} utilisation${promo.usedCount > 1 ? "s" : ""}${promo.usageLimit ? ` sur ${promo.usageLimit}` : ""}`}</li> : null}
        {promo.campaignId ? <li>Inscrite à une campagne de la plateforme</li> : null}
      </ul>

      {promo.offers.length > 0 ? (
        <ul className={styles.offers}>
          {promo.offers.slice(0, 6).map((offer) => (
            <li key={offer.id} className={styles.offer}>
              <span className={styles.offerThumb}>
                <Thumbnail src={offer.image} alt="" seed={offer.id} />
              </span>
              {offer.name}
            </li>
          ))}
          {promo.offers.length > 6 ? <li className={styles.offer}>{`+ ${promo.offers.length - 6}`}</li> : null}
        </ul>
      ) : null}

      {stats && (stats.orders > 0 || promo.status !== "draft") ? (
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Commandes</dt>
            <dd>{stats.orders}</dd>
          </div>
          {promo.type !== "coupon" ? (
            <div className={styles.stat}>
              <dt>Unités vendues</dt>
              <dd>{stats.units}</dd>
            </div>
          ) : null}
          <div className={styles.stat}>
            <dt>Chiffre d'affaires</dt>
            <dd>{formatPrice(stats.revenue)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Remises accordées</dt>
            <dd>{formatPrice(stats.discount)}</dd>
          </div>
        </dl>
      ) : null}

      {promo.stopReason && promo.status === "stopped" ? <p className={styles.hint}>{promo.stopReason}</p> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className={styles.actions}>
        {promo.availableActions
          .filter((action) => action !== "extend")
          .map((action) => (
            <Button
              key={action}
              variant={action === "stop" ? "ghost" : action === "launch" || action === "resume" ? "primary" : "secondary"}
              onClick={() => void run(action)}
              isLoading={busy === action}
              disabled={busy !== null}
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
        {promo.availableActions.includes("extend") ? (
          extending ? (
            <>
              <Input label="Nouvelle fin" type="datetime-local" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              <Button onClick={() => void run("extend")} isLoading={busy === "extend"} disabled={!endDate || busy !== null}>
                Prolonger
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setExtending(true)} disabled={busy !== null}>
              Prolonger
            </Button>
          )
        ) : null}
        {editable ? (
          <Link className={styles.secondary} to={sellerPaths.editPromotion(promo.boutiqueId, promo.id)}>
            Modifier
          </Link>
        ) : null}
        {boostable(promo) ? (
          <Link className={styles.action} to={sellerPaths.newBoost(promo.boutiqueId, { promotionId: promo.id })}>
            Booster
          </Link>
        ) : null}
      </div>
    </li>
  );
};
