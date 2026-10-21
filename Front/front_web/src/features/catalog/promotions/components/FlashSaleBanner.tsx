import { formatPrice } from "../../../../entities/product";
import { formatDiscount, type Promotion } from "../../../../entities/promotion";
import { useCountdown } from "../../../../shared/hooks/useCountdown";
import styles from "./FlashSaleBanner.module.css";

const pad = (value: number) => String(value).padStart(2, "0");

const endFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

// ─────────────────────────────────────────────
//  Bandeau d'une vente flash : remise, échéance, compte à rebours.
//  Le compteur est muet pour les lecteurs d'écran (il changerait chaque
//  seconde) ; l'échéance est donnée en toutes lettres à côté.
// ─────────────────────────────────────────────
export const FlashSaleBanner = ({ promotion }: { promotion: Promotion }) => {
  const countdown = useCountdown(promotion.endDate);
  const articles = promotion.productBoutiqueIds.length;

  const units = [
    { value: countdown.days, label: "Jours" },
    { value: countdown.hours, label: "Heures" },
    { value: countdown.minutes, label: "Min" },
    { value: countdown.seconds, label: "Sec" },
  ];

  return (
    <section className={styles.banner} aria-labelledby={`flash-${promotion.id}`}>
      <div className={styles.copy}>
        <span className={styles.tag}>Vente flash</span>
        <h2 id={`flash-${promotion.id}`} className={styles.title}>
          {promotion.nom}
          <span className={styles.value}>
            −{formatDiscount(promotion, formatPrice)}
          </span>
        </h2>
        {promotion.description ? <p className={styles.text}>{promotion.description}</p> : null}

        <ul className={styles.meta}>
          {articles > 0 ? (
            <li>
              {articles} article{articles > 1 ? "s" : ""} concerné{articles > 1 ? "s" : ""}
            </li>
          ) : null}
          {promotion.maxDiscount ? (
            <li>Remise plafonnée à {formatPrice(promotion.maxDiscount)}</li>
          ) : null}
          <li>
            Jusqu'au{" "}
            <time dateTime={promotion.endDate}>{endFormat.format(new Date(promotion.endDate))}</time>
          </li>
        </ul>
      </div>

      {countdown.expired ? (
        <p className={styles.text}>L'opération vient de se terminer.</p>
      ) : (
        <div className={styles.timer} aria-hidden="true">
          {units.map((unit) => (
            <span key={unit.label} className={styles.unit}>
              <span className={styles.unitValue}>{pad(unit.value)}</span>
              <span className={styles.unitLabel}>{unit.label}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
};
