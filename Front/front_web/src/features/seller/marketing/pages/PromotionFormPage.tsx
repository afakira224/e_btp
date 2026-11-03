import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { effectivePrice, formatPrice, productName, type ProductBoutique } from "../../../../entities/product";
import {
  PROMO_LIMITS,
  promotionSummary,
  SHOP_PROMOTION_TYPE_HINTS,
  SHOP_PROMOTION_TYPE_LABELS,
  SHOP_PROMOTION_TYPES,
  type ShopPromotion,
  type ShopPromotionInput,
  type ShopPromotionType,
} from "../../../../entities/promotion";
import { ApiError } from "../../../../shared/api";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { Alert, Button, Choices, Input, Select, TextArea } from "../../../../shared/ui";
import { useResource } from "../../../catalog";
import { fetchShopOffers, sellerPaths, useSellerShop } from "../../shared";
import { createShopPromotion, fetchShopPromotion, updateShopPromotion } from "../api/marketing.api";
import { OfferPicker } from "../components/OfferPicker";
import styles from "../components/Marketing.module.css";

const STEPS = ["Type", "Produits", "Remise et dates", "Lancement"] as const;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** Une date pour un champ datetime-local, à l'heure du navigateur. */
const toLocal = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};

interface Draft {
  type: ShopPromotionType;
  nom: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  offerIds: string[];
  familleId: string;
  categoryId: string;
  excludedOfferIds: string[];
  code: string;
  minAmount: string;
  maxDiscount: string;
  usageLimit: string;
  perCustomerLimit: string;
  stackable: boolean;
  tiers: { minQuantity: string; discountValue: string }[];
  flashQuantity: string;
  flashHours: string;
  start: string;
  end: string;
  /** Début : tout de suite, ou à une date. */
  startMode: "now" | "schedule";
  /** Gardée en brouillon : rien n'est en ligne. */
  asDraft: boolean;
}

const launchOf = (draft: Draft): "now" | "schedule" | "draft" =>
  draft.asDraft ? "draft" : draft.type === "quantity_tiers" ? "now" : draft.startMode;

const blank = (type: ShopPromotionType): Draft => {
  const now = new Date();
  return {
    type,
    nom: "",
    description: "",
    discountType: "percentage",
    discountValue: type === "flash_sale" ? "30" : "10",
    offerIds: [],
    familleId: "",
    categoryId: "",
    excludedOfferIds: [],
    code: "",
    minAmount: "",
    maxDiscount: "",
    usageLimit: "",
    perCustomerLimit: "1",
    stackable: true,
    tiers: [
      { minQuantity: "10", discountValue: "5" },
      { minQuantity: "50", discountValue: "10" },
    ],
    flashQuantity: "",
    flashHours: "24",
    start: toLocal(new Date(now.getTime() + DAY)),
    end: toLocal(new Date(now.getTime() + 8 * DAY)),
    startMode: "now",
    asDraft: false,
  };
};

const fromPromotion = (promo: ShopPromotion): Draft => ({
  ...blank(promo.type),
  nom: promo.nom,
  description: promo.description ?? "",
  discountType: promo.discountType,
  discountValue: String(promo.discountValue),
  offerIds: promo.productBoutiqueIds,
  familleId: promo.target?.familleIds[0] ?? "",
  categoryId: promo.target?.categoryIds[0] ?? "",
  excludedOfferIds: promo.target?.excludedOfferIds ?? [],
  code: promo.code ?? "",
  minAmount: promo.minAmount ? String(promo.minAmount) : "",
  maxDiscount: promo.maxDiscount ? String(promo.maxDiscount) : "",
  usageLimit: promo.usageLimit ? String(promo.usageLimit) : "",
  perCustomerLimit: promo.perCustomerLimit ? String(promo.perCustomerLimit) : "",
  stackable: promo.stackable,
  tiers: promo.tiers.length > 0 ? promo.tiers.map((tier) => ({ minQuantity: String(tier.minQuantity), discountValue: String(tier.discountValue) })) : blank("quantity_tiers").tiers,
  flashQuantity: promo.flashQuantity ? String(promo.flashQuantity) : "",
  flashHours: promo.endDate ? String(Math.round((new Date(promo.endDate).getTime() - new Date(promo.startDate).getTime()) / HOUR)) : "24",
  start: toLocal(new Date(promo.startDate)),
  end: promo.endDate ? toLocal(new Date(promo.endDate)) : toLocal(new Date(Date.now() + 8 * DAY)),
  startMode: "schedule",
  asDraft: promo.status === "draft",
});

const number = (value: string) => (value.trim() === "" ? undefined : Number(value));
const usesOffers = (type: ShopPromotionType) => type === "product_discount" || type === "flash_sale" || type === "quantity_tiers";

/** Le corps envoyé au serveur ; il refait tous les contrôles. */
const toInput = (draft: Draft, confirmHighDiscount: boolean): ShopPromotionInput => {
  const launch = launchOf(draft);
  const start = launch === "now" || (launch === "draft" && draft.startMode === "now") ? new Date() : new Date(draft.start);
  const end = draft.type === "flash_sale" ? new Date(start.getTime() + Number(draft.flashHours) * HOUR) : new Date(draft.end);
  return {
    type: draft.type,
    nom: draft.nom.trim(),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.type === "coupon" ? { discountType: draft.discountType } : {}),
    ...(draft.type !== "quantity_tiers" && draft.type !== "free_shipping" ? { discountValue: Number(draft.discountValue) } : {}),
    startDate: start.toISOString(),
    ...(draft.type !== "quantity_tiers" ? { endDate: end.toISOString() } : {}),
    ...(usesOffers(draft.type) ? { productBoutiqueIds: draft.offerIds } : {}),
    ...(draft.type === "shop_discount"
      ? {
          familleIds: draft.familleId ? [draft.familleId] : [],
          categoryIds: draft.categoryId ? [draft.categoryId] : [],
          excludedOfferIds: draft.excludedOfferIds,
        }
      : {}),
    ...(draft.type === "coupon"
      ? {
          code: draft.code.trim().toUpperCase(),
          minAmount: number(draft.minAmount),
          maxDiscount: number(draft.maxDiscount),
          usageLimit: number(draft.usageLimit),
          perCustomerLimit: number(draft.perCustomerLimit),
          stackable: draft.stackable,
        }
      : {}),
    ...(draft.type === "free_shipping" ? { minAmount: number(draft.minAmount) ?? 0 } : {}),
    ...(draft.type === "quantity_tiers" ? { tiers: draft.tiers.map((tier) => ({ minQuantity: Number(tier.minQuantity), discountValue: Number(tier.discountValue) })) } : {}),
    ...(draft.type === "flash_sale" && draft.flashQuantity ? { flashQuantity: Number(draft.flashQuantity) } : {}),
    confirmHighDiscount,
    launch,
  };
};

/** Ce qui manque à une étape pour passer à la suivante (le serveur refait tous les contrôles). */
const stepIssue = (draft: Draft, step: number): string | null => {
  if (step === 1) {
    if (usesOffers(draft.type) && draft.offerIds.length === 0) return "Choisissez au moins un produit.";
    if (draft.type === "coupon" && !/^[A-Z0-9]{4,20}$/.test(draft.code.trim().toUpperCase())) return "Le code fait de 4 à 20 lettres ou chiffres.";
  }
  if (step === 2) {
    if (draft.type === "quantity_tiers") {
      if (draft.tiers.some((tier) => !(Number(tier.minQuantity) >= 2) || !(Number(tier.discountValue) >= 1))) return "Chaque palier : une quantité de 2 au moins et une remise.";
    } else if (draft.type !== "free_shipping") {
      const value = Number(draft.discountValue);
      if (draft.discountType === "percentage" && !(value >= PROMO_LIMITS.minPercent && value <= PROMO_LIMITS.maxPercent)) {
        return `La remise va de ${PROMO_LIMITS.minPercent} à ${PROMO_LIMITS.maxPercent} %.`;
      }
      if (draft.discountType === "fixed" && !(value > 0)) return "Indiquez un montant de remise.";
    }
    if (draft.type === "free_shipping" && !(Number(draft.minAmount) > 0)) return "Indiquez le montant à partir duquel la livraison est offerte.";
    if (draft.type === "flash_sale") {
      const hours = Number(draft.flashHours);
      if (!(hours >= PROMO_LIMITS.flashHours.min && hours <= PROMO_LIMITS.flashHours.max)) return "Une vente flash dure de 2 à 72 heures.";
    } else if (draft.type !== "quantity_tiers" && new Date(draft.end) <= (draft.startMode === "now" ? new Date() : new Date(draft.start))) {
      return "La fin vient après le début.";
    }
  }
  if (step === 3 && draft.nom.trim().length < 2) return "Donnez un nom à la promotion (vos clients le liront).";
  return null;
};

// ─────────────────────────────────────────────
//  Nouvelle promotion ou modification — 4 étapes :
//  type, produits (ou cible), remise et dates, lancement. Lancée tout de
//  suite, programmée, ou gardée en brouillon : aucune validation.
// ─────────────────────────────────────────────
export const PromotionFormPage = () => {
  const { shop } = useSellerShop();
  const { promotionId } = useParams<{ promotionId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const typeParam = params.get("type") as ShopPromotionType | null;
  const editing = !!promotionId;

  const [draft, setDraft] = useState<Draft>(() => blank(typeParam && SHOP_PROMOTION_TYPES.includes(typeParam) ? typeParam : "product_discount"));
  const [step, setStep] = useState(editing || typeParam ? 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useDocumentTitle(`${editing ? "Modifier la promotion" : "Nouvelle promotion"} — ${shop.nom}`);

  const loadOffers = useCallback((signal: AbortSignal) => fetchShopOffers(shop.id, 1, 100, signal), [shop.id]);
  const offers = useResource(loadOffers, null, shop.id);
  const items: ProductBoutique[] = useMemo(() => offers.data?.items ?? [], [offers.data]);

  const loadPromo = useCallback(
    (signal: AbortSignal) => (promotionId ? fetchShopPromotion(shop.id, promotionId, signal) : Promise.resolve(null)),
    [shop.id, promotionId]
  );
  const existing = useResource<ShopPromotion | null>(loadPromo, null, promotionId ?? "new");
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (existing.data) setDraft(fromPromotion(existing.data));
  }, [existing.data]);

  const families = useMemo(() => {
    const map = new Map<string, string>();
    for (const offer of items) for (const famille of offer.product?.familles ?? []) map.set(famille.id, famille.nom);
    return [...map].map(([value, label]) => ({ value, label }));
  }, [items]);
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const offer of items) for (const categorie of offer.product?.categories ?? []) map.set(categorie.id, categorie.nom);
    return [...map].map(([value, label]) => ({ value, label }));
  }, [items]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const issue = stepIssue(draft, step);
  const percent = draft.discountType === "percentage" ? Number(draft.discountValue) : 0;
  const high = percent > PROMO_LIMITS.confirmAbove || draft.tiers.some((tier) => draft.type === "quantity_tiers" && Number(tier.discountValue) > PROMO_LIMITS.confirmAbove);
  const maxOffers = PROMO_LIMITS.maxOffers[draft.type];
  const maxDays = PROMO_LIMITS.maxDays[draft.type];

  const submit = async () => {
    if (high && !window.confirm("Remise de plus de 50 % : vérifiez le montant. La confirmer ?")) return;
    setBusy(true);
    setError(null);
    try {
      const input = toInput(draft, high);
      const { message } = editing ? await updateShopPromotion(shop.id, promotionId, input) : await createShopPromotion(shop.id, input);
      navigate(sellerPaths.promotions(shop.id, launchOf(draft) === "now" ? undefined : "scheduled"), { state: { feedback: message } });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "L'enregistrement a échoué. Réessayez.");
      setBusy(false);
    }
  };

  const firstOffer = items.find((offer) => offer.id === draft.offerIds[0]);
  const previewPrice = firstOffer && draft.discountType === "percentage" ? Math.round(effectivePrice(firstOffer) * (1 - percent / 100)) : null;

  if (existing.error) return <Alert tone="danger">{existing.error}</Alert>;

  return (
    <div className={styles.page}>
      <Link to={sellerPaths.promotions(shop.id)} className={styles.hint}>
        ← Promotions
      </Link>
      <ol className={styles.steps} aria-label="Étapes">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? styles.stepOn : styles.step} aria-current={index === step ? "step" : undefined}>
            {label}
          </li>
        ))}
      </ol>

      <div className={styles.form}>
        {step === 0 ? (
          <Choices
            legend="Quel type de promotion ?"
            options={SHOP_PROMOTION_TYPES.map((type) => ({ value: type, label: SHOP_PROMOTION_TYPE_LABELS[type], hint: SHOP_PROMOTION_TYPE_HINTS[type] }))}
            value={draft.type}
            onChange={(value) => setDraft({ ...blank(value as ShopPromotionType), nom: draft.nom })}
          />
        ) : null}

        {step === 1 ? (
          <>
            <p className={styles.eyebrow}>{SHOP_PROMOTION_TYPE_LABELS[draft.type]}</p>
            {usesOffers(draft.type) ? (
              <OfferPicker
                offers={items}
                value={draft.offerIds}
                onChange={(ids) => set("offerIds", ids)}
                max={maxOffers}
                label={draft.type === "quantity_tiers" ? "Le produit vendu par quantité" : "Produits en promotion"}
              />
            ) : null}
            {draft.type === "shop_discount" ? (
              <>
                <p className={styles.hint}>Toute la boutique par défaut ; vous pouvez limiter à une famille ou une catégorie, et exclure des produits.</p>
                <div className={styles.row}>
                  <Select label="Famille" value={draft.familleId} onChange={(event) => set("familleId", event.target.value)} options={[{ value: "", label: "Toutes" }, ...families]} />
                  <Select label="Catégorie" value={draft.categoryId} onChange={(event) => set("categoryId", event.target.value)} options={[{ value: "", label: "Toutes" }, ...categories]} />
                </div>
                <OfferPicker offers={items} value={draft.excludedOfferIds} onChange={(ids) => set("excludedOfferIds", ids)} label="Produits exclus (facultatif)" />
              </>
            ) : null}
            {draft.type === "coupon" ? (
              <>
                <Input label="Code" value={draft.code} onChange={(event) => set("code", event.target.value.toUpperCase())} placeholder="Ex. CHANTIER10" hint="4 à 20 lettres ou chiffres ; il ne vaut que sur vos articles." />
                <div className={styles.row}>
                  <Input label="Montant minimum d'achat (GNF)" type="number" min={0} value={draft.minAmount} onChange={(event) => set("minAmount", event.target.value)} />
                  <Input label="Utilisations au total" type="number" min={1} value={draft.usageLimit} onChange={(event) => set("usageLimit", event.target.value)} hint="Vide : sans limite." />
                  <Input label="Utilisations par client" type="number" min={1} value={draft.perCustomerLimit} onChange={(event) => set("perCustomerLimit", event.target.value)} />
                </div>
                <Choices
                  legend="Avec les autres promotions"
                  inline
                  options={[
                    { value: "yes", label: "Cumulable", hint: "Le code vaut aussi sur les produits déjà remisés." },
                    { value: "no", label: "Non cumulable", hint: "Le code ignore les produits déjà remisés." },
                  ]}
                  value={draft.stackable ? "yes" : "no"}
                  onChange={(value) => set("stackable", value === "yes")}
                />
              </>
            ) : null}
            {draft.type === "free_shipping" ? <p className={styles.hint}>La livraison offerte vaut pour tous vos produits ; le montant se règle à l'étape suivante.</p> : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            {draft.type === "quantity_tiers" ? (
              <fieldset className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={styles.eyebrow}>{`Paliers (${PROMO_LIMITS.maxTiers} au plus)`}</legend>
                {draft.tiers.map((tier, index) => (
                  <div key={index} className={styles.row}>
                    <Input
                      label={`À partir de (unités)`}
                      type="number"
                      min={2}
                      value={tier.minQuantity}
                      onChange={(event) => set("tiers", draft.tiers.map((other, at) => (at === index ? { ...other, minQuantity: event.target.value } : other)))}
                    />
                    <Input
                      label="Remise (%)"
                      type="number"
                      min={1}
                      max={70}
                      value={tier.discountValue}
                      onChange={(event) => set("tiers", draft.tiers.map((other, at) => (at === index ? { ...other, discountValue: event.target.value } : other)))}
                    />
                  </div>
                ))}
                <div className={styles.actions}>
                  {draft.tiers.length < PROMO_LIMITS.maxTiers ? (
                    <Button variant="secondary" onClick={() => set("tiers", [...draft.tiers, { minQuantity: "", discountValue: "" }])}>
                      Ajouter un palier
                    </Button>
                  ) : null}
                  {draft.tiers.length > 1 ? (
                    <Button variant="ghost" onClick={() => set("tiers", draft.tiers.slice(0, -1))}>
                      Retirer le dernier
                    </Button>
                  ) : null}
                </div>
                <p className={styles.hint}>Sans date de fin : le prix par quantité reste jusqu'à ce que vous l'arrêtiez.</p>
              </fieldset>
            ) : draft.type === "free_shipping" ? (
              <Input label="Livraison offerte dès (GNF)" type="number" min={1} value={draft.minAmount} onChange={(event) => set("minAmount", event.target.value)} hint="Sur la part du panier chez vous, remises comprises." />
            ) : (
              <div className={styles.row}>
                {draft.type === "coupon" ? (
                  <Select
                    label="Type de remise"
                    value={draft.discountType}
                    onChange={(event) => set("discountType", event.target.value as Draft["discountType"])}
                    options={[
                      { value: "percentage", label: "Pourcentage" },
                      { value: "fixed", label: "Montant fixe (GNF)" },
                    ]}
                  />
                ) : null}
                <Input
                  label={draft.discountType === "fixed" ? "Remise (GNF)" : "Remise (%)"}
                  type="number"
                  min={draft.discountType === "fixed" ? 1 : PROMO_LIMITS.minPercent}
                  max={draft.discountType === "fixed" ? undefined : PROMO_LIMITS.maxPercent}
                  value={draft.discountValue}
                  onChange={(event) => set("discountValue", event.target.value)}
                  hint={draft.discountType === "fixed" ? undefined : `${PROMO_LIMITS.minPercent} à ${PROMO_LIMITS.maxPercent} %.`}
                />
                {draft.type === "coupon" && draft.discountType === "percentage" ? (
                  <Input label="Remise maximale (GNF)" type="number" min={1} value={draft.maxDiscount} onChange={(event) => set("maxDiscount", event.target.value)} hint="Vide : sans plafond." />
                ) : null}
                {draft.type === "flash_sale" ? (
                  <Input label="Quantité au prix flash" type="number" min={1} value={draft.flashQuantity} onChange={(event) => set("flashQuantity", event.target.value)} hint="Vide : tout le stock." />
                ) : null}
              </div>
            )}

            {draft.type !== "quantity_tiers" ? (
              <>
                <Choices
                  legend="Quand commence-t-elle ?"
                  inline
                  options={[
                    { value: "now", label: "Maintenant" },
                    { value: "schedule", label: "À une date" },
                  ]}
                  value={draft.startMode}
                  onChange={(value) => set("startMode", value === "now" ? "now" : "schedule")}
                />
                <div className={styles.row}>
                  {draft.startMode !== "now" ? <Input label="Début" type="datetime-local" value={draft.start} onChange={(event) => set("start", event.target.value)} /> : null}
                  {draft.type === "flash_sale" ? (
                    <Input label="Durée (heures)" type="number" min={2} max={72} value={draft.flashHours} onChange={(event) => set("flashHours", event.target.value)} hint="De 2 à 72 heures." />
                  ) : (
                    <Input label="Fin" type="datetime-local" value={draft.end} onChange={(event) => set("end", event.target.value)} hint={maxDays ? `${maxDays} jours au plus.` : undefined} />
                  )}
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Input label="Nom de la promotion" value={draft.nom} onChange={(event) => set("nom", event.target.value)} placeholder="Ex. Semaine du ciment" maxLength={80} />
            <TextArea label="Description (facultatif)" value={draft.description} onChange={(event) => set("description", event.target.value)} rows={3} />
            <div className={styles.preview}>
              <span className={styles.eyebrow}>Aperçu</span>
              <div className={styles.previewLine}>
                <span>{SHOP_PROMOTION_TYPE_LABELS[draft.type]}</span>
                <strong>
                  {promotionSummary(
                    {
                      type: draft.type,
                      discountType: draft.discountType,
                      discountValue: Number(draft.discountValue) || 0,
                      code: draft.code,
                      minAmount: Number(draft.minAmount) || 0,
                      tiers: draft.tiers.map((tier) => ({ minQuantity: Number(tier.minQuantity), discountValue: Number(tier.discountValue) })),
                      flashQuantity: Number(draft.flashQuantity) || null,
                    },
                    formatPrice
                  )}
                </strong>
              </div>
              {usesOffers(draft.type) ? <div className={styles.previewLine}><span>Produits</span><span>{draft.offerIds.length}</span></div> : null}
              {firstOffer && previewPrice !== null && draft.type !== "quantity_tiers" ? (
                <div className={styles.previewLine}>
                  <span>{productName(firstOffer)}</span>
                  <span>{`${formatPrice(previewPrice)} au lieu de ${formatPrice(effectivePrice(firstOffer))}`}</span>
                </div>
              ) : null}
              <p className={styles.hint}>Le prix barré affiché est le plus bas pratiqué sur 30 jours : si vous avez baissé votre prix récemment, la remise affichée peut être plus petite.</p>
            </div>
            <Choices
              legend="Lancement"
              options={[
                launchOf({ ...draft, asDraft: false }) === "now"
                  ? { value: "go", label: "Lancer maintenant", hint: "En ligne dès l'enregistrement." }
                  : { value: "go", label: "Programmer", hint: "Elle démarrera seule à la date choisie." },
                { value: "draft", label: "Garder en brouillon", hint: "Rien n'est en ligne ; vous la lancerez plus tard." },
              ]}
              value={draft.asDraft ? "draft" : "go"}
              onChange={(value) => set("asDraft", value === "draft")}
            />
          </>
        ) : null}

        {issue ? <p className={styles.hint} role="status">{issue}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className={styles.actions}>
          {step > (editing ? 1 : 0) ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}>
              ← Précédent
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!!issue || (offers.isLoading && step === 1)}>
              Suivant →
            </Button>
          ) : (
            <Button onClick={() => void submit()} isLoading={busy} disabled={!!issue}>
              {launchOf(draft) === "draft" ? "Enregistrer le brouillon" : launchOf(draft) === "now" ? "Lancer la promotion" : "Programmer la promotion"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
