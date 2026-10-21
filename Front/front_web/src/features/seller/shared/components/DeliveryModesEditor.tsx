import { useId } from "react";
import {
  DELIVERY_MODE_HINTS,
  DELIVERY_MODE_LABELS,
  DELIVERY_MODES,
  DeliveryMode,
  formatFee,
} from "../../../../entities/delivery";
import { Input } from "../../../../shared/ui";
import { parseFee, type DeliveryDraft } from "../validation/delivery.rules";
import styles from "./DeliveryModesEditor.module.css";

interface DeliveryModesEditorProps {
  legend: string;
  value: DeliveryDraft;
  onChange: (next: DeliveryDraft) => void;
  onBlur?: ((field: keyof DeliveryDraft) => void) | undefined;
  errors?: Partial<Record<keyof DeliveryDraft, string | undefined>> | undefined;
  /** Adresse de retrait : sans elle, le retrait en boutique ne peut pas être proposé. */
  shopAddress?: string | undefined;
  disabled?: boolean;
}

// ─────────────────────────────────────────────
//  Les trois modes, activables séparément, et le tarif du prix fixe.
//  Le champ du tarif n'apparaît qu'avec le mode qui l'exige : un champ
//  inutile à l'écran est un champ que l'on croit devoir remplir.
//  Partagé par les réglages de la boutique et la personnalisation d'un produit.
// ─────────────────────────────────────────────
export const DeliveryModesEditor = ({
  legend,
  value,
  onChange,
  onBlur,
  errors = {},
  shopAddress,
  disabled = false,
}: DeliveryModesEditorProps) => {
  const errorId = useId();
  const hasAddress = Boolean(shopAddress?.trim());

  const toggle = (mode: DeliveryMode, checked: boolean) => {
    const modes = checked
      ? DELIVERY_MODES.filter((candidate) => candidate === mode || value.modes.includes(candidate))
      : value.modes.filter((candidate) => candidate !== mode);
    onChange({ ...value, modes });
  };

  const fee = parseFee(value.flatRateFee);

  return (
    <fieldset
      className={styles.editor}
      aria-describedby={errors.modes ? errorId : undefined}
      onBlur={(event) => {
        // Quitter le groupe de cases, pas passer de l'une à l'autre.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.("modes");
      }}
    >
      <legend className={styles.legend}>{legend}</legend>

      <ul className={styles.modes}>
        {DELIVERY_MODES.map((mode) => {
          const checked = value.modes.includes(mode);
          // Sans adresse, le retrait ne peut qu'être retiré, pas ajouté.
          const locked = mode === DeliveryMode.PICKUP && !hasAddress && !checked;
          const preview =
            mode === DeliveryMode.FLAT_RATE ? (fee !== null && fee > 0 ? formatFee(fee) : "Tarif à définir") : "Gratuit";

          return (
            <li key={mode} className={[styles.mode, checked ? styles.on : ""].filter(Boolean).join(" ")}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || locked}
                  onChange={(event) => toggle(mode, event.target.checked)}
                />
                <span className={styles.text}>
                  <span className={styles.name}>{DELIVERY_MODE_LABELS[mode]}</span>
                  <span className={styles.hint}>
                    {mode === DeliveryMode.PICKUP
                      ? hasAddress
                        ? `${DELIVERY_MODE_HINTS[mode]} Adresse : ${shopAddress}.`
                        : "Renseignez l'adresse de la boutique pour proposer le retrait."
                      : DELIVERY_MODE_HINTS[mode]}
                  </span>
                </span>
                <span className={styles.fee}>{checked ? preview : "Désactivé"}</span>
              </label>

              {mode === DeliveryMode.FLAT_RATE && checked ? (
                <div className={styles.feeField}>
                  <Input
                    label="Tarif par livraison (GNF)"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="25000"
                    value={value.flatRateFee}
                    disabled={disabled}
                    error={errors.flatRateFee}
                    hint="Facturé une fois par commande et par boutique, quel que soit le nombre d'articles."
                    onChange={(event) => onChange({ ...value, flatRateFee: event.target.value })}
                    onBlur={() => onBlur?.("flatRateFee")}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {errors.modes ? (
        <p id={errorId} className={styles.error} role="alert">
          {errors.modes}
        </p>
      ) : null}
    </fieldset>
  );
};
