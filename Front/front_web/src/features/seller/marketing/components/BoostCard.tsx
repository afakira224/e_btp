import { Link } from "react-router-dom";
import { BOOST_GOAL_LABELS, BOOST_STATUS_LABELS, BOOST_STATUS_TONES, type Boost } from "../../../../entities/boost";
import { formatPrice } from "../../../../entities/product";
import { StatusBadge } from "../../../../shared/ui";
import { sellerPaths } from "../../shared";
import styles from "./Marketing.module.css";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const integer = new Intl.NumberFormat("fr-FR");

// Un boost dans la liste : ce qu'il montre, son budget et ses premiers résultats.
export const BoostCard = ({ boost }: { boost: Boost }) => (
  <li className={styles.card}>
    <div className={styles.cardHead}>
      <div>
        <span className={styles.eyebrow}>{`${boost.kindLabel} · ${BOOST_GOAL_LABELS[boost.goal]}`}</span>
        <h3 className={styles.cardTitle}>
          <Link to={sellerPaths.boost(boost.boutiqueId, boost.id)}>
            {boost.promotion?.nom ?? boost.offers.map((offer) => offer.name).join(", ")}
          </Link>
        </h3>
      </div>
      <StatusBadge tone={BOOST_STATUS_TONES[boost.status]}>{BOOST_STATUS_LABELS[boost.status]}</StatusBadge>
    </div>
    <ul className={styles.meta}>
      <li>{`Du ${dayFormat.format(new Date(boost.startDate))} au ${dayFormat.format(new Date(boost.endDate))}`}</li>
      <li>{`${formatPrice(boost.dailyBudget)} par jour`}</li>
      <li>{`Dépensé : ${formatPrice(boost.spent)} sur ${formatPrice(boost.reserved)}`}</li>
      {boost.refunded > 0 ? <li>{`Rendu en crédits : ${formatPrice(boost.refunded)}`}</li> : null}
    </ul>
    <dl className={styles.stats}>
      <div className={styles.stat}>
        <dt>Affichages</dt>
        <dd>{integer.format(boost.totals.impressions)}</dd>
      </div>
      <div className={styles.stat}>
        <dt>Visites</dt>
        <dd>{integer.format(boost.totals.visits)}</dd>
      </div>
      <div className={styles.stat}>
        <dt>Ventes</dt>
        <dd>{integer.format(boost.totals.orders)}</dd>
      </div>
      <div className={styles.stat}>
        <dt>Chiffre d'affaires</dt>
        <dd>{formatPrice(boost.totals.revenue)}</dd>
      </div>
    </dl>
    {boost.stopReason && (boost.status === "ended" || boost.status === "stopped") ? <p className={styles.hint}>{boost.stopReason}</p> : null}
  </li>
);
