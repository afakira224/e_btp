import { useMemo, useState } from "react";
import type { ShopDeliveryOverview } from "../../../../entities/delivery";
import type { Shop } from "../../../../entities/shop";
import { Alert, Button } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import {
  DeliveryModesEditor,
  saveShopDelivery,
  toDraft,
  toSettingsInput,
} from "../../shared";
import { shopDeliverySchema, type ShopDeliveryValues } from "../validation/shopDelivery.schema";
import styles from "./ShopDeliveryForm.module.css";

interface ShopDeliveryFormProps {
  shop: Shop;
  /** Réglages enregistrés : point de départ du formulaire. */
  saved: ShopDeliveryOverview;
  onSaved: (overview: ShopDeliveryOverview) => void;
}

const sameDraft = (a: ShopDeliveryValues, b: ShopDeliveryValues) =>
  a.modes.join() === b.modes.join() && a.flatRateFee.trim() === b.flatRateFee.trim();

export const ShopDeliveryForm = ({ shop, saved, onSaved }: ShopDeliveryFormProps) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const initialValues = useMemo(() => toDraft(saved), [saved]);
  const schema = useMemo(() => shopDeliverySchema(shop.adresse), [shop.adresse]);

  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit, reset } =
    useForm<ShopDeliveryValues>({
      initialValues,
      schema,
      onSubmit: async (submitted) => {
        setServerError(null);
        try {
          onSaved(await saveShopDelivery(shop.id, toSettingsInput(submitted)));
        } catch (caught) {
          // 400 : règle métier (tarif, adresse) ; 403 : boutique d'un autre.
          setServerError((caught as Error).message);
        }
      },
    });

  const dirty = !sameDraft(values, initialValues);

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

      <DeliveryModesEditor
        legend="Modes proposés par défaut"
        value={values}
        shopAddress={shop.adresse}
        disabled={isSubmitting}
        errors={{ modes: errorOf("modes"), flatRateFee: errorOf("flatRateFee") }}
        onBlur={handleBlur}
        onChange={(next) => {
          if (next.modes !== values.modes) setValue("modes", next.modes);
          if (next.flatRateFee !== values.flatRateFee) setValue("flatRateFee", next.flatRateFee);
        }}
      />

      <div className={styles.actions}>
        <Button type="submit" isLoading={isSubmitting} disabled={!dirty}>
          Enregistrer
        </Button>
        {dirty ? (
          <Button type="button" variant="ghost" onClick={reset} disabled={isSubmitting}>
            Annuler les modifications
          </Button>
        ) : null}
        <span className={styles.state} aria-live="polite">
          {dirty ? "Modifications non enregistrées" : "À jour"}
        </span>
      </div>
    </form>
  );
};
