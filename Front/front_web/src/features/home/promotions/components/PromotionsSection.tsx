import { Link } from "react-router-dom";
import { Button } from "../../../../shared/ui";
import { formatDiscount, type Promotion } from "../../../../entities/promotion";
import { formatPrice } from "../../../../entities/product";
import { useCountdown } from "../../../../shared/hooks/useCountdown";
import { fetchActivePromotions, useResource } from "../../../catalog/shared";
import styles from "./Promotions.module.css";

const pad = (value: number) => String(value).padStart(2, "0");

const FlashPanel = ({ promotion }: { promotion: Promotion }) => {
  const countdown = useCountdown(promotion.endDate);

  const remise = formatDiscount(promotion, formatPrice);

  const units = [
    { value: countdown.days, label: "Jours" },
    { value: countdown.hours, label: "Heures" },
    { value: countdown.minutes, label: "Min" },
    { value: countdown.seconds, label: "Sec" },
  ];

  return (
    <div className={[styles.panel, styles.flash].join(" ")}>
      <div>
        <span className={styles.tag}>Vente flash</span>
        <h3 className={styles.title}>Jusqu'à {remise} de remise</h3>
        <p className={styles.text}>{promotion.description}</p>
      </div>

      {countdown.expired ? (
        <p className={styles.text}>L'opération vient de se terminer.</p>
      ) : (
        <div
          className={styles.timer}
          // Un compteur qui s'annonce à chaque seconde rendrait la page
          // inutilisable au lecteur d'écran : on le laisse muet et on donne
          // l'échéance en clair.
          aria-label={`Fin de l'opération dans ${countdown.days} jours`}
        >
          {units.map((unit) => (
            <span key={unit.label} className={styles.unit}>
              <span className={styles.unitValue} aria-hidden="true">
                {pad(unit.value)}
              </span>
              <span className={styles.unitLabel} aria-hidden="true">
                {unit.label}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className={styles.foot}>
        <Link to="/promotions">
          <Button variant="secondary">Voir la sélection</Button>
        </Link>
      </div>
    </div>
  );
};

export const PromotionsSection = () => {
  const { data, isLoading } = useResource(fetchActivePromotions, []);
  const flash = data[0];

  return (
    <div className={styles.grid}>
      {isLoading ? (
        // Pendant le chargement on ne dit rien : afficher « aucune opération »
        // serait une affirmation fausse, que la page démentirait une seconde
        // plus tard.
        <div className={[styles.panel, styles.loading].join(" ")} aria-hidden="true" />
      ) : flash ? (
        <FlashPanel promotion={flash} />
      ) : (
        <div className={[styles.panel, styles.collection].join(" ")}>
          <div>
            <span className={styles.tag}>Catalogue</span>
            <h3 className={styles.title}>Aucune opération en cours</h3>
            <p className={styles.text}>
              Les prochaines ventes flash seront annoncées ici.
            </p>
          </div>
          <div className={styles.foot}>
            <Link to="/categories">
              <Button variant="secondary">Parcourir le catalogue</Button>
            </Link>
          </div>
        </div>
      )}

      <div className={[styles.panel, styles.collection].join(" ")}>
        <div>
          <span className={styles.tag}>Compte professionnel</span>
          <h3 className={styles.title}>Devis et tarifs négociés</h3>
          <p className={styles.text}>
            Entreprises et artisans : obtenez des prix dégressifs, le paiement à
            30 jours et un interlocuteur dédié pour vos chantiers.
          </p>
        </div>
        <div className={styles.foot}>
          <Link to="/signup">
            <Button variant="secondary">Ouvrir un compte</Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
