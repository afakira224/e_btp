import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BOOST_GOAL_LABELS,
  BOOST_RELATION_LABELS,
  BOOST_STATUS_LABELS,
  BOOST_STATUS_TONES,
  CUSTOMER_TYPE_LABELS,
  type Boost,
} from "../../../../entities/boost";
import { formatPrice } from "../../../../entities/product";
import { ApiError } from "../../../../shared/api";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { Alert, Button, StatusBadge, Thumbnail } from "../../../../shared/ui";
import { AccountPanel } from "../../../account";
import { useResource } from "../../../catalog";
import { sellerPaths, useSellerShop } from "../../shared";
import { fetchBoost, runBoostAction } from "../api/marketing.api";
import styles from "../components/Marketing.module.css";

const integer = new Intl.NumberFormat("fr-FR");
const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

const ACTION_LABELS = { pause: "Mettre en pause", resume: "Reprendre", stop: "Arrêter le boost" } as const;

const audienceText = (boost: Boost) => {
  const { audience } = boost;
  if (audience.mode !== "custom") return "Automatique : les clients intéressés par ce type de produit.";
  const zones = [...audience.communes, ...audience.villes];
  return [
    zones.length > 0 ? zones.join(", ") : "Toutes les zones",
    audience.customerTypes.length === 1 ? CUSTOMER_TYPE_LABELS[audience.customerTypes[0] as keyof typeof CUSTOMER_TYPE_LABELS] : "Particuliers et sociétés",
    BOOST_RELATION_LABELS[audience.relation],
  ].join(" · ");
};

// ─────────────────────────────────────────────
//  Un boost — /ma-boutique/:boutiqueId/mise-en-avant/boosts/:boostId
//  Ses résultats (affichages, visites, ajouts au panier, ventes), jour par
//  jour, et ce qu'il reste du budget. Pause, reprise, arrêt.
// ─────────────────────────────────────────────
export const BoostDetailPage = () => {
  const { shop } = useSellerShop();
  const { boostId = "" } = useParams<{ boostId: string }>();
  const [version, setVersion] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((signal: AbortSignal) => fetchBoost(boostId, signal), [boostId]);
  const boost = useResource<Boost | null>(load, null, `${boostId}:${version}`);
  const data = boost.data;

  useDocumentTitle(`Boost — ${shop.nom}`);

  const run = async (action: "pause" | "resume" | "stop") => {
    if (action === "stop" && !window.confirm("Arrêter ce boost ? Le budget non dépensé revient en crédits.")) return;
    setBusy(action);
    setError(null);
    try {
      const { message } = await runBoostAction(boostId, action);
      setFeedback(message);
      setVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "L'action a échoué.");
    } finally {
      setBusy(null);
    }
  };

  if (boost.error) return <Alert tone="danger">{boost.error}</Alert>;
  if (boost.isLoading || !data) return <div className={styles.skeleton} aria-hidden="true" />;

  const { totals } = data;
  const conversion = totals.visits > 0 ? Math.round((totals.orders / totals.visits) * 1000) / 10 : 0;

  return (
    <div className={styles.page}>
      <Link to={sellerPaths.boosts(shop.id)} className={styles.hint}>
        ← Mise en avant
      </Link>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <span className={styles.eyebrow}>{`${data.kindLabel} · ${BOOST_GOAL_LABELS[data.goal]}`}</span>
            <h2 className={styles.cardTitle}>{data.promotion?.nom ?? data.offers.map((offer) => offer.name).join(", ")}</h2>
          </div>
          <StatusBadge tone={BOOST_STATUS_TONES[data.status]}>{BOOST_STATUS_LABELS[data.status]}</StatusBadge>
        </div>
        <ul className={styles.meta}>
          <li>{`Du ${dateFormat.format(new Date(data.startDate))} au ${dateFormat.format(new Date(data.endDate))}`}</li>
          <li>{audienceText(data)}</li>
        </ul>
        <ul className={styles.offers}>
          {data.offers.map((offer) => (
            <li key={offer.id} className={styles.offer}>
              <span className={styles.offerThumb}>
                <Thumbnail src={offer.image} alt="" seed={offer.id} />
              </span>
              {offer.name}
            </li>
          ))}
        </ul>
        {data.stopReason && (data.status === "ended" || data.status === "stopped") ? <p className={styles.hint}>{data.stopReason}</p> : null}
        {data.availableActions.length > 0 ? (
          <div className={styles.actions}>
            {data.availableActions.map((action) => (
              <Button key={action} variant={action === "stop" ? "ghost" : "secondary"} onClick={() => void run(action)} isLoading={busy === action} disabled={busy !== null}>
                {ACTION_LABELS[action]}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <AccountPanel title="Résultats" description="Une vente compte quand le client a visité la fiche depuis le boost dans les 7 jours avant d'acheter.">
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Affichages</dt>
            <dd>{integer.format(totals.impressions)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Clients atteints</dt>
            <dd>{integer.format(totals.reach)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Visites</dt>
            <dd>{`${integer.format(totals.visits)} (${totals.visitRate} %)`}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Ajouts au panier</dt>
            <dd>{integer.format(totals.carts)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Ventes</dt>
            <dd>{`${integer.format(totals.orders)}${totals.visits > 0 ? ` (${conversion} %)` : ""}`}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Chiffre d'affaires</dt>
            <dd>{formatPrice(totals.revenue)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Coût par vente</dt>
            <dd>{totals.costPerSale !== null ? formatPrice(totals.costPerSale) : "—"}</dd>
          </div>
        </dl>
      </AccountPanel>

      <AccountPanel title="Budget">
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Par jour</dt>
            <dd>{formatPrice(data.dailyBudget)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Réservé</dt>
            <dd>{formatPrice(data.reserved)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Dépensé</dt>
            <dd>{formatPrice(data.spent)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>{data.status === "active" || data.status === "paused" ? "Reste" : "Rendu en crédits"}</dt>
            <dd>{formatPrice(data.status === "active" || data.status === "paused" ? data.remaining : data.refunded)}</dd>
          </div>
        </dl>
      </AccountPanel>

      {data.daily && data.daily.length > 0 ? (
        <AccountPanel title="Jour par jour">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Jour</th>
                  <th scope="col">Affichages</th>
                  <th scope="col">Visites</th>
                  <th scope="col">Paniers</th>
                  <th scope="col">Ventes</th>
                  <th scope="col">Dépensé</th>
                </tr>
              </thead>
              <tbody>
                {[...data.daily].reverse().map((row) => (
                  <tr key={row.day}>
                    <td>{dayFormat.format(new Date(`${row.day}T12:00:00`))}</td>
                    <td>{integer.format(row.impressions)}</td>
                    <td>{integer.format(row.visits)}</td>
                    <td>{integer.format(row.carts)}</td>
                    <td>{integer.format(row.orders)}</td>
                    <td>{formatPrice(row.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AccountPanel>
      ) : null}
    </div>
  );
};
