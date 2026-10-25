import { useCallback, useState, type ReactNode } from "react";
import {
  CATALOG_SIZE_LABELS,
  CatalogSize,
  SELLER_EXPERIENCE_LABELS,
  SELLER_TYPE_LABELS,
  SellerExperience,
  SellerType,
  type ShopRequest,
} from "../../../../entities/shop-request";
import type { Famille } from "../../../../entities/taxonomy";
import { Alert, Button, Choices, Input, TextArea, type ChoiceOption } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { fetchFamilles, useResource } from "../../../catalog";
import { submitShopRequest } from "../../shared";
import {
  shopRequestSchema,
  toInput,
  type ShopRequestValues,
} from "../validation/shopRequest.schema";
import styles from "./ShopRequestForm.module.css";

const options = <T extends string>(labels: Record<T, string>, values: Record<string, T>): ChoiceOption[] =>
  Object.values(values).map((value) => ({ value, label: labels[value] }));

const SELLER_TYPE_OPTIONS: ChoiceOption[] = [
  { value: SellerType.PARTICULIER, label: SELLER_TYPE_LABELS.particulier, hint: "Vous vendez en votre nom propre." },
  { value: SellerType.ENTREPRISE, label: SELLER_TYPE_LABELS.entreprise, hint: "Société ou établissement immatriculé au RCCM." },
];
const EXPERIENCE_OPTIONS = options(SELLER_EXPERIENCE_LABELS, SellerExperience);
const CATALOG_OPTIONS = options(CATALOG_SIZE_LABELS, CatalogSize);
const STORE_OPTIONS: ChoiceOption[] = [
  { value: "oui", label: "Oui", hint: "Les clients pourront y retirer leurs achats." },
  { value: "non", label: "Non", hint: "Vous livrez uniquement." },
];

const Section = ({ index, title, lede, children }: { index: string; title: string; lede: string; children: ReactNode }) => (
  <section className={styles.section} aria-labelledby={`section-${index}`}>
    <header className={styles.sectionHead}>
      <span className={styles.sectionIndex} aria-hidden="true">
        {index}
      </span>
      <div>
        <h2 id={`section-${index}`} className={styles.sectionTitle}>
          {title}
        </h2>
        <p className={styles.sectionLede}>{lede}</p>
      </div>
    </header>
    <div className={styles.fields}>{children}</div>
  </section>
);

interface ShopRequestFormProps {
  initialValues: ShopRequestValues;
  /** Email du compte : utilisé quand aucun email de boutique n'est donné. */
  accountEmail: string;
  onSubmitted: (request: ShopRequest) => void;
}

// ─────────────────────────────────────────────
//  Questionnaire d'ouverture de boutique, en quatre temps : la boutique,
//  le vendeur, le retrait, un mot pour l'équipe. Chaque réponse sert à
//  l'administration pour décider ; nom, présentation, adresse et email
//  deviennent ceux de la boutique une fois approuvée.
// ─────────────────────────────────────────────
export const ShopRequestForm = ({ initialValues, accountEmail, onSubmitted }: ShopRequestFormProps) => {
  const [serverError, setServerError] = useState<string | null>(null);

  const loadFamilles = useCallback((signal: AbortSignal) => fetchFamilles(signal), []);
  const familles = useResource<Famille[]>(loadFamilles, [], "familles");
  const familleOptions: ChoiceOption[] = familles.data.map((famille) => ({
    value: famille.id,
    label: famille.nom,
    hint: famille.description,
  }));

  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit } = useForm<ShopRequestValues>({
    initialValues,
    schema: shopRequestSchema,
    onSubmit: async (submitted) => {
      setServerError(null);
      try {
        onSubmitted(await submitShopRequest(toInput(submitted)));
      } catch (caught) {
        // 409 : demande déjà en cours ou nom pris ; 400 : domaine inconnu.
        setServerError((caught as Error).message);
      }
    },
  });

  const text = <K extends "nom" | "rccm" | "adresse" | "email">(name: K) => ({
    name,
    value: values[name],
    error: errorOf(name),
    disabled: isSubmitting,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(name, event.target.value),
    onBlur: () => handleBlur(name),
  });

  const area = <K extends "description" | "message">(name: K) => ({
    name,
    value: values[name],
    error: errorOf(name),
    disabled: isSubmitting,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setValue(name, event.target.value),
    onBlur: () => handleBlur(name),
  });

  const choice = <K extends "sellerType" | "experience" | "catalogSize" | "hasPhysicalStore">(name: K) => ({
    value: values[name],
    error: errorOf(name),
    disabled: isSubmitting,
    onChange: (value: string) => setValue(name, value),
    onBlur: () => handleBlur(name),
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

      <Section index="A" title="Votre boutique" lede="Ce que les clients verront sur votre vitrine.">
        <Input label="Nom de la boutique" index="01" placeholder="Quincaillerie Kipé" maxLength={100} {...text("nom")} />
        <TextArea
          label="Présentation"
          index="02"
          rows={5}
          maxLength={1000}
          placeholder="Ce que vous vendez, pour quels chantiers, ce qui vous distingue."
          hint="Affichée sur la page de votre boutique."
          {...area("description")}
        />
        {familles.error ? (
          <Alert tone="danger">Les domaines du catalogue n'ont pas pu être chargés : {familles.error}</Alert>
        ) : (
          <Choices
            multiple
            legend="Domaines d'activité"
            index="03"
            hint={familles.isLoading ? "Chargement des domaines…" : "Plusieurs choix possibles."}
            options={familleOptions}
            value={values.familleIds}
            error={errorOf("familleIds")}
            disabled={isSubmitting || familles.isLoading}
            onChange={(next) => setValue("familleIds", next)}
            onBlur={() => handleBlur("familleIds")}
          />
        )}
      </Section>

      <Section index="B" title="Votre activité" lede="Pour que l'équipe sache à qui elle ouvre une boutique.">
        <Choices legend="Vous vendez en tant que" index="04" inline options={SELLER_TYPE_OPTIONS} {...choice("sellerType")} />
        {values.sellerType === SellerType.ENTREPRISE ? (
          <Input
            label="Numéro RCCM"
            index="05"
            placeholder="GN.TCC.2024.B.01234"
            hint="Registre du commerce et du crédit mobilier de l'entreprise."
            maxLength={50}
            {...text("rccm")}
          />
        ) : null}
        <Choices legend="Depuis combien de temps exercez-vous ?" index="06" options={EXPERIENCE_OPTIONS} {...choice("experience")} />
        <Choices legend="Combien de produits comptez-vous vendre ?" index="07" options={CATALOG_OPTIONS} {...choice("catalogSize")} />
      </Section>

      <Section index="C" title="Retrait et contact" lede="Où vous trouver, comment vous joindre.">
        <Choices legend="Avez-vous un point de vente ?" index="08" inline options={STORE_OPTIONS} {...choice("hasPhysicalStore")} />
        <Input
          label="Adresse de la boutique"
          index="09"
          placeholder="Kipé, Ratoma, Conakry"
          hint="Adresse de retrait en boutique, affichée aux clients qui choisissent ce mode."
          autoComplete="street-address"
          maxLength={255}
          {...text("adresse")}
        />
        <Input
          label="Email de la boutique"
          index="10"
          type="email"
          optional
          placeholder={accountEmail}
          hint={`À défaut, celui de votre compte : ${accountEmail}.`}
          autoComplete="email"
          {...text("email")}
        />
      </Section>

      <Section index="D" title="Un mot pour l'équipe" lede="Tout ce qui peut aider à examiner votre demande.">
        <TextArea
          label="Message"
          index="11"
          optional
          rows={4}
          maxLength={1000}
          placeholder="Vos références, vos zones de livraison, vos horaires…"
          {...area("message")}
        />
      </Section>

      <div className={styles.terms}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={values.acceptTerms}
            disabled={isSubmitting}
            aria-invalid={errorOf("acceptTerms") ? true : undefined}
            onChange={(event) => setValue("acceptTerms", event.target.checked)}
            onBlur={() => handleBlur("acceptTerms")}
          />
          <span>
            J'accepte les conditions de vente de la plateforme : je vends des produits conformes à leur
            description, au prix affiché, et je traite les commandes que je reçois.
          </span>
        </label>
        {errorOf("acceptTerms") ? (
          <span className={styles.error} role="alert">
            {errorOf("acceptTerms")}
          </span>
        ) : null}
      </div>

      <div className={styles.actions}>
        <Button type="submit" isLoading={isSubmitting}>
          Envoyer ma demande
        </Button>
      </div>
    </form>
  );
};
