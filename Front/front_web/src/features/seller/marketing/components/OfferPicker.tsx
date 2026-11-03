import type { ProductBoutique } from "../../../../entities/product";
import { effectivePrice, formatPrice, productImage, productName } from "../../../../entities/product";
import { Thumbnail } from "../../../../shared/ui";
import styles from "./Marketing.module.css";

// ─────────────────────────────────────────────
//  Choix des offres de la boutique visées par une promotion ou un boost.
//  Une offre masquée par la modération ou en rupture ne se choisit pas.
// ─────────────────────────────────────────────
export const OfferPicker = ({
  offers,
  value,
  onChange,
  max,
  label,
}: {
  offers: readonly ProductBoutique[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  max?: number | undefined;
  label: string;
}) => {
  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (max === 1) onChange([id]);
      else if (!max || value.length < max) onChange([...value, id]);
    } else onChange(value.filter((candidate) => candidate !== id));
  };

  return (
    <fieldset className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className={styles.eyebrow}>
        {label}
        {max && max > 1 ? ` — ${value.length} / ${max}` : ""}
      </legend>
      {offers.length === 0 ? (
        <p className={styles.empty}>Aucun produit dans la boutique : ajoutez-en dans Produits.</p>
      ) : (
        <ul className={styles.picker}>
          {offers.map((offer) => {
            const disabled = !!offer.hidden || offer.stock <= 0;
            return (
              <li key={offer.id}>
                <label className={styles.pick} style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
                  <input
                    type={max === 1 ? "radio" : "checkbox"}
                    name={label}
                    checked={value.includes(offer.id)}
                    disabled={disabled}
                    onChange={(event) => toggle(offer.id, event.target.checked)}
                  />
                  <span className={styles.offerThumb}>
                    <Thumbnail src={productImage(offer)} alt="" seed={offer.id} />
                  </span>
                  <span className={styles.pickName}>
                    {productName(offer)}
                    {offer.hidden ? " — masquée" : offer.stock <= 0 ? " — rupture" : ""}
                  </span>
                  <span className={styles.pickPrice}>{formatPrice(effectivePrice(offer))}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
};
