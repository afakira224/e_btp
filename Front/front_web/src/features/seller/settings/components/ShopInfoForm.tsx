import { useEffect, useId, useMemo, useState } from "react";
import type { Shop } from "../../../../entities/shop";
import { assetUrl } from "../../../../shared/config/env";
import { Alert, Button, Input, TextArea } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { updateShopInfo } from "../../shared";
import { LOGO_TYPES, shopInfoSchema, valuesOf, type ShopInfoValues } from "../validation/shopInfo.schema";
import styles from "./ShopInfoForm.module.css";

interface ShopInfoFormProps {
  shop: Shop;
  onSaved: (shop: Shop) => void;
}

const sameText = (a: string, b: string) => a.trim() === b.trim();

// ─────────────────────────────────────────────
//  Informations de la boutique : ce que les clients lisent sur sa vitrine
//  et sur chaque produit. Le logo part avec le reste, en multipart.
// ─────────────────────────────────────────────
export const ShopInfoForm = ({ shop, onSaved }: ShopInfoFormProps) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const initialValues = useMemo(() => valuesOf(shop), [shop]);
  const logoInputId = useId();

  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit, reset } =
    useForm<ShopInfoValues>({
      initialValues,
      schema: shopInfoSchema,
      onSubmit: async (submitted) => {
        setServerError(null);
        try {
          onSaved(
            await updateShopInfo(shop.id, {
              nom: submitted.nom.trim(),
              description: submitted.description.trim(),
              email: submitted.email.trim(),
              adresse: submitted.adresse.trim(),
              logo: submitted.logo,
              removeLogo: submitted.removeLogo,
            })
          );
        } catch (caught) {
          // 400 : adresse retirée alors que le retrait est proposé.
          setServerError((caught as Error).message);
        }
      },
    });

  // Aperçu du logo choisi, libéré dès qu'il ne sert plus.
  const preview = useMemo(() => (values.logo ? URL.createObjectURL(values.logo) : null), [values.logo]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const currentLogo = values.removeLogo ? null : (preview ?? assetUrl(shop.logo) ?? null);

  const dirty =
    !sameText(values.nom, initialValues.nom) ||
    !sameText(values.description, initialValues.description) ||
    !sameText(values.email, initialValues.email) ||
    !sameText(values.adresse, initialValues.adresse) ||
    values.logo !== null ||
    values.removeLogo;

  const text = <K extends "nom" | "email" | "adresse">(name: K) => ({
    name,
    value: values[name],
    error: errorOf(name),
    disabled: isSubmitting,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(name, event.target.value),
    onBlur: () => handleBlur(name),
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

      <div className={styles.logoField}>
        <span className={styles.logo} aria-hidden="true">
          {currentLogo ? <img src={currentLogo} alt="" /> : <span className={styles.logoEmpty}>Aucun logo</span>}
        </span>
        <div className={styles.logoActions}>
          <label className={styles.label} htmlFor={logoInputId}>
            Logo
          </label>
          <input
            id={logoInputId}
            className={styles.file}
            type="file"
            accept={LOGO_TYPES.join(",")}
            disabled={isSubmitting}
            aria-invalid={errorOf("logo") ? true : undefined}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setValue("logo", file);
              setValue("removeLogo", false);
              handleBlur("logo");
              // Rechoisir le même fichier doit redéclencher l'événement.
              event.target.value = "";
            }}
          />
          <span className={styles.hint}>JPEG, PNG, WebP ou GIF, 5 Mo au plus. Format carré conseillé.</span>
          {errorOf("logo") ? (
            <span className={styles.error} role="alert">
              {errorOf("logo")}
            </span>
          ) : null}
          {values.logo || (shop.logo && !values.removeLogo) ? (
            <button
              type="button"
              className={styles.textButton}
              disabled={isSubmitting}
              onClick={() => {
                setValue("logo", null);
                setValue("removeLogo", Boolean(shop.logo) && !values.logo);
              }}
            >
              {values.logo ? "Annuler ce choix" : "Retirer le logo"}
            </button>
          ) : values.removeLogo ? (
            <button
              type="button"
              className={styles.textButton}
              disabled={isSubmitting}
              onClick={() => setValue("removeLogo", false)}
            >
              Garder le logo actuel
            </button>
          ) : null}
        </div>
      </div>

      <Input label="Nom de la boutique" maxLength={100} {...text("nom")} />
      <TextArea
        label="Présentation"
        rows={5}
        maxLength={1000}
        value={values.description}
        error={errorOf("description")}
        disabled={isSubmitting}
        hint="Affichée en tête de votre vitrine."
        onChange={(event) => setValue("description", event.target.value)}
        onBlur={() => handleBlur("description")}
      />
      <Input
        label="Email de contact"
        type="email"
        autoComplete="email"
        hint="Visible des clients sur votre vitrine."
        {...text("email")}
      />
      <Input
        label="Adresse"
        autoComplete="street-address"
        maxLength={255}
        hint="Adresse de retrait en boutique. Elle ne peut être retirée tant que ce mode est proposé."
        {...text("adresse")}
      />

      <div className={styles.actions}>
        <Button type="submit" isLoading={isSubmitting} disabled={!dirty}>
          Enregistrer
        </Button>
        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              setServerError(null);
            }}
            disabled={isSubmitting}
          >
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
