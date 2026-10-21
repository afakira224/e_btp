import {
  DELIVERY_MODE_LABELS,
  DeliveryMode,
  formatFee,
  type DeliveryGroupQuote,
  type DeliveryQuote,
  type DeliverySelection,
} from "../../../entities/delivery";
import styles from "./DeliveryChoices.module.css";

interface DeliveryChoicesProps {
  quote: DeliveryQuote;
  /** Modes déjà demandés par le client, par boutique. */
  selection: DeliverySelection;
  onChoose: (boutiqueId: string, method: DeliveryMode) => void;
  disabled?: boolean;
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/** Une livraison : la boutique, ses articles, les modes qu'ils acceptent tous. */
const Group = ({
  group,
  requested,
  onChoose,
  disabled,
}: {
  group: DeliveryGroupQuote;
  requested: DeliveryMode | undefined;
  onChoose: DeliveryChoicesProps["onChoose"];
  disabled: boolean;
}) => {
  const articles = group.items.reduce((sum, item) => sum + item.quantity, 0);
  const name = `livraison-${group.boutiqueId}`;
  // Rien de demandé et plusieurs modes possibles : une invitation, pas un refus.
  const prompt = !requested && group.selectedMethod === null && group.options.length > 1;

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>
        <span className={styles.shop}>{group.boutiqueNom ?? "Boutique"}</span>
        <span className={styles.count}>{plural(articles, "article")}</span>
      </legend>

      {group.options.length > 0 ? (
        <div className={styles.options}>
          {group.options.map((option) => (
            <label key={option.method} className={styles.option}>
              <input
                type="radio"
                name={name}
                value={option.method}
                checked={group.selectedMethod === option.method}
                disabled={disabled}
                onChange={() => onChoose(group.boutiqueId, option.method)}
              />
              <span className={styles.optionLabel}>{DELIVERY_MODE_LABELS[option.method]}</span>
              <span className={styles.optionFee}>{formatFee(option.fee)}</span>
            </label>
          ))}
        </div>
      ) : null}

      {group.selectedMethod === DeliveryMode.PICKUP && group.pickupAdresse ? (
        <p className={styles.hint}>À retirer : {group.pickupAdresse}</p>
      ) : null}

      {group.error ? (
        <p className={prompt ? styles.hint : styles.error} role={prompt ? undefined : "alert"}>
          {group.error}
        </p>
      ) : null}
    </fieldset>
  );
};

// ─────────────────────────────────────────────
//  Choix de livraison du panier.
//  Une livraison par boutique : le prix fixe est facturé une fois pour tous
//  ses articles, deux boutiques font deux livraisons. Les montants affichés
//  sont ceux du devis serveur, rien n'est additionné ici.
// ─────────────────────────────────────────────
export const DeliveryChoices = ({
  quote,
  selection,
  onChoose,
  disabled = false,
}: DeliveryChoicesProps) => (
  <div className={styles.choices}>
    {quote.groups.map((group) => (
      <Group
        key={group.boutiqueId}
        group={group}
        requested={selection[group.boutiqueId]}
        onChoose={onChoose}
        disabled={disabled}
      />
    ))}
  </div>
);
