import { useMemo, useState } from "react";
import type { Address, AddressInput } from "../../../../entities/address";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { addressSchema, type AddressValues } from "../validation/address.schema";
import styles from "./AddressForm.module.css";

const LABEL_SUGGESTIONS = ["Maison", "Bureau", "Chantier"];

interface AddressFormProps {
  /** Adresse à modifier ; absente pour une création. */
  initial?: Address | undefined;
  /** Destinataire proposé par défaut : le titulaire du compte. */
  defaultRecipient: string;
  defaultPhone?: string | undefined;
  /** Case « par défaut » verrouillée : première adresse, ou déjà par défaut. */
  forceDefault: boolean;
  onSubmit: (input: AddressInput) => Promise<void>;
  onCancel: () => void;
}

const toValues = (
  address: Address | undefined,
  recipient: string,
  phone: string | undefined,
  forceDefault: boolean
): AddressValues => ({
  label: address?.label ?? "",
  destinataire: address?.destinataire ?? recipient,
  telephone: address?.telephone ?? phone ?? "",
  adresse: address?.adresse ?? "",
  commune: address?.commune ?? "",
  ville: address?.ville ?? "Conakry",
  pays: address?.pays ?? "Guinée",
  isDefault: address?.isDefault ?? forceDefault,
});

/**
 * Champs facultatifs vides : omis à la création, envoyés vides à la
 * modification. Le back ignore un champ absent (`if (label !== undefined)`) :
 * l'omettre en modification empêcherait d'effacer un nom d'adresse.
 */
const toInput = (values: AddressValues, isUpdate: boolean): AddressInput => {
  const optional = (value: string) => value.trim() || (isUpdate ? "" : undefined);
  return {
    label: optional(values.label),
    destinataire: optional(values.destinataire),
    telephone: values.telephone.trim(),
    adresse: values.adresse.trim(),
    commune: optional(values.commune),
    ville: values.ville.trim(),
    pays: values.pays.trim() || "Guinée",
    isDefault: values.isDefault,
  };
};

export const AddressForm = ({
  initial,
  defaultRecipient,
  defaultPhone,
  forceDefault,
  onSubmit,
  onCancel,
}: AddressFormProps) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const initialValues = useMemo(
    () => toValues(initial, defaultRecipient, defaultPhone, forceDefault),
    [initial, defaultRecipient, defaultPhone, forceDefault]
  );

  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit } = useForm<AddressValues>({
    initialValues,
    schema: addressSchema,
    onSubmit: async (submitted) => {
      setServerError(null);
      try {
        await onSubmit(toInput(submitted, initial !== undefined));
      } catch (caught) {
        setServerError((caught as Error).message);
      }
    },
  });

  const field = <K extends Exclude<keyof AddressValues, "isDefault">>(name: K) => ({
    name,
    value: values[name],
    error: errorOf(name),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(name, event.target.value),
    onBlur: () => handleBlur(name),
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

      <div className={styles.labelField}>
        <Input label="Nom de l'adresse" optional placeholder="Maison, chantier…" {...field("label")} />
        <div className={styles.suggestions} aria-label="Suggestions de nom">
          {LABEL_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={[
                styles.suggestion,
                values.label === suggestion ? styles.suggestionOn : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={values.label === suggestion}
              onClick={() => setValue("label", values.label === suggestion ? "" : suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <Input label="Destinataire" optional autoComplete="name" {...field("destinataire")} />
        <Input
          label="Téléphone du destinataire"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="Le livreur appellera ce numéro."
          {...field("telephone")}
        />
      </div>

      <Input
        label="Adresse"
        autoComplete="street-address"
        placeholder="Quartier, rue, repère (face à la mosquée…)"
        {...field("adresse")}
      />

      <div className={styles.row}>
        <Input label="Commune" optional placeholder="Ratoma, Matoto…" {...field("commune")} />
        <Input label="Ville" autoComplete="address-level2" {...field("ville")} />
      </div>

      <Input label="Pays" autoComplete="country-name" {...field("pays")} />

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={values.isDefault}
          disabled={forceDefault}
          onChange={(event) => setValue("isDefault", event.target.checked)}
        />
        <span>
          Utiliser comme adresse par défaut
          {forceDefault ? (
            <span className={styles.checkHint}>
              {initial?.isDefault
                ? " — pour en changer, choisissez une autre adresse par défaut."
                : " — c'est votre première adresse."}
            </span>
          ) : null}
        </span>
      </label>

      <div className={styles.actions}>
        <Button type="submit" isLoading={isSubmitting}>
          {initial ? "Enregistrer les modifications" : "Ajouter l'adresse"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Annuler
        </Button>
      </div>
    </form>
  );
};
