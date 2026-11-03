import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  BOOST_GOAL_HINTS,
  BOOST_GOAL_LABELS,
  BOOST_RELATION_LABELS,
  CONAKRY_COMMUNES,
  CUSTOMER_TYPE_LABELS,
  INLAND_CITIES,
  type BoostEstimate,
  type BoostGoal,
  type BoostInput,
  type BoostKind,
  type BoostRelation,
} from "../../../../entities/boost";
import { effectivePrice, formatPrice, productName, type ProductBoutique } from "../../../../entities/product";
import type { ShopPromotion } from "../../../../entities/promotion";
import { ApiError } from "../../../../shared/api";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { Alert, Button, Choices, Input, Select, Thumbnail } from "../../../../shared/ui";
import { useResource } from "../../../catalog";
import { fetchShopOffers, sellerPaths, useSellerShop } from "../../shared";
import { createBoost, estimateBoost, fetchShopPromotions } from "../api/marketing.api";
import { OfferPicker } from "../components/OfferPicker";
import styles from "../components/Marketing.module.css";

const integer = new Intl.NumberFormat("fr-FR");
const range = ([low, high]: [number, number]) => (low === high ? integer.format(low) : `${integer.format(low)} à ${integer.format(high)}`);

const BUDGETS = [10_000, 20_000, 50_000, 100_000];

/** Un code ou une livraison offerte n'ont pas de produit à montrer. */
const boostablePromos = (promos: readonly ShopPromotion[]) =>
  promos.filter((promo) => (promo.status === "active" || promo.status === "scheduled") && promo.type !== "coupon" && promo.type !== "free_shipping");

const toggle = (list: readonly string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

// ─────────────────────────────────────────────
//  Booster — /ma-boutique/:boutiqueId/mise-en-avant/booster
//  Comme « Booster la publication » : quoi montrer (une promotion ou des
//  produits), l'objectif, l'audience, le budget et la durée. L'estimation
//  se recalcule à chaque changement ; le budget est réservé sur les
//  crédits au lancement, ce qui n'est pas dépensé revient à la fin.
// ─────────────────────────────────────────────
export const BoostFormPage = () => {
  const { shop } = useSellerShop();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromPromotion = params.get("promotion");
  const fromOffers = params.get("produits")?.split(",").filter(Boolean) ?? [];

  const [kind, setKind] = useState<BoostKind>(fromPromotion ? "promotion" : fromOffers.length > 0 ? "product" : "promotion");
  const [promotionId, setPromotionId] = useState(fromPromotion ?? "");
  const [offerIds, setOfferIds] = useState<string[]>(fromOffers);
  const [goal, setGoal] = useState<BoostGoal>("visits");
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [communes, setCommunes] = useState<string[]>([]);
  const [villes, setVilles] = useState<string[]>([]);
  const [customerTypes, setCustomerTypes] = useState<string[]>([]);
  const [relation, setRelation] = useState<BoostRelation>("all");
  const [dailyBudget, setDailyBudget] = useState("20000");
  const [days, setDays] = useState("7");
  const [estimate, setEstimate] = useState<BoostEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(`Booster — ${shop.nom}`);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const [active, scheduled, offers] = await Promise.all([
        fetchShopPromotions(shop.id, "active", signal),
        fetchShopPromotions(shop.id, "scheduled", signal),
        fetchShopOffers(shop.id, 1, 100, signal),
      ]);
      return { promotions: boostablePromos([...active.promotions, ...scheduled.promotions]), offers: offers.items, blocked: active.promotionsBlockedUntil };
    },
    [shop.id]
  );
  const data = useResource<{ promotions: ShopPromotion[]; offers: ProductBoutique[]; blocked: string | null } | null>(load, null, shop.id);
  const promotions = useMemo(() => data.data?.promotions ?? [], [data.data]);
  const offers = data.data?.offers ?? [];

  // Pas de promotion à booster : on passe aux produits.
  useEffect(() => {
    if (!data.data) return;
    // oxlint-disable-next-line react/set-state-in-effect
    if (kind === "promotion" && promotions.length === 0) setKind("product");
    else if (kind === "promotion" && !promotionId && promotions[0]) setPromotionId(promotions[0].id);
  }, [data.data, kind, promotions, promotionId]);

  const input: BoostInput = useMemo(
    () => ({
      kind,
      ...(kind === "promotion" ? { promotionId } : { productBoutiqueIds: offerIds }),
      goal,
      audience: mode === "auto" ? { mode } : { mode, communes, villes, customerTypes, relation, interestFamilleIds: [] },
      dailyBudget: Number(dailyBudget) || 0,
      days: Number(days) || 1,
    }),
    [kind, promotionId, offerIds, goal, mode, communes, villes, customerTypes, relation, dailyBudget, days]
  );
  const ready = kind === "promotion" ? !!promotionId : offerIds.length > 0;

  // Estimation : recalculée un instant après le dernier changement.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      estimateBoost(shop.id, input)
        .then((result) => {
          if (cancelled) return;
          setEstimate(result);
          setEstimateError(null);
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          setEstimate(null);
          setEstimateError(caught instanceof ApiError ? caught.message : "Estimation impossible.");
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [shop.id, input, ready]);

  const promo = promotions.find((candidate) => candidate.id === promotionId);
  const shown = kind === "promotion" ? offers.filter((offer) => promo?.productBoutiqueIds.includes(offer.id)) : offers.filter((offer) => offerIds.includes(offer.id));
  const previewOffer = shown[0];
  const total = (Number(dailyBudget) || 0) * (estimate?.days ?? (Number(days) || 1));
  const tooLow = estimate ? (Number(dailyBudget) || 0) < estimate.minDailyBudget : false;
  const short = estimate ? total > estimate.credits : false;
  const canLaunch = ready && !!estimate && estimate.audienceOk && !tooLow && !short && !busy && !data.data?.blocked;

  const launch = async () => {
    setBusy(true);
    setError(null);
    try {
      const { message } = await createBoost(shop.id, input);
      navigate(sellerPaths.boosts(shop.id), { state: { feedback: message } });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Le boost n'a pas été lancé.");
      setBusy(false);
    }
  };

  if (data.error) return <Alert tone="danger">{data.error}</Alert>;
  if (data.isLoading || !data.data) return <div className={styles.skeleton} aria-hidden="true" />;

  return (
    <div className={styles.page}>
      <Link to={sellerPaths.boosts(shop.id)} className={styles.hint}>
        ← Mise en avant
      </Link>
      {data.data.blocked ? <Alert tone="danger">Les promotions et boosts de cette boutique sont suspendus par la modération.</Alert> : null}

      <div className={styles.grid2} style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)" }}>
        <div className={styles.form}>
          <Choices
            legend="Que voulez-vous booster ?"
            inline
            options={[
              { value: "promotion", label: "Une promotion", hint: promotions.length === 0 ? "Aucune promotion en cours à booster." : "Ses produits, avec leur prix barré." },
              { value: "product", label: "Des produits", hint: "Jusqu'à 10, même sans promotion." },
            ]}
            value={kind}
            onChange={(value) => setKind(value as BoostKind)}
          />
          {kind === "promotion" ? (
            promotions.length > 0 ? (
              <Select
                label="Promotion"
                value={promotionId}
                onChange={(event) => setPromotionId(event.target.value)}
                options={promotions.map((candidate) => ({ value: candidate.id, label: `${candidate.nom} — ${candidate.typeLabel}` }))}
                hint={promo?.endDate ? `Le boost s'arrête au plus tard à la fin de la promotion, le ${new Date(promo.endDate).toLocaleDateString("fr-FR")}.` : undefined}
              />
            ) : (
              <p className={styles.empty}>
                Aucune promotion en cours. <Link to={sellerPaths.newPromotion(shop.id)}>Créer une promotion</Link>
              </p>
            )
          ) : (
            <OfferPicker offers={offers} value={offerIds} onChange={setOfferIds} max={10} label="Produits à montrer" />
          )}

          <Choices
            legend="Objectif"
            inline
            options={(Object.keys(BOOST_GOAL_LABELS) as BoostGoal[]).map((value) => ({ value, label: BOOST_GOAL_LABELS[value], hint: BOOST_GOAL_HINTS[value] }))}
            value={goal}
            onChange={(value) => setGoal(value as BoostGoal)}
          />

          <Choices
            legend="Audience"
            inline
            options={[
              { value: "auto", label: "Automatique", hint: "Les clients intéressés par ce type de produit." },
              { value: "custom", label: "Personnalisée", hint: "Choisissez les zones et les clients." },
            ]}
            value={mode}
            onChange={(value) => setMode(value as "auto" | "custom")}
          />
          {mode === "custom" ? (
            <>
              <fieldset className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={styles.eyebrow}>Communes de Conakry</legend>
                <div className={styles.chipRow}>
                  {CONAKRY_COMMUNES.map((commune) => (
                    <button key={commune} type="button" aria-pressed={communes.includes(commune)} className={communes.includes(commune) ? styles.chipOn : styles.chip} onClick={() => setCommunes(toggle(communes, commune))}>
                      {commune}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={styles.eyebrow}>Villes de l'intérieur</legend>
                <div className={styles.chipRow}>
                  {INLAND_CITIES.map((ville) => (
                    <button key={ville} type="button" aria-pressed={villes.includes(ville)} className={villes.includes(ville) ? styles.chipOn : styles.chip} onClick={() => setVilles(toggle(villes, ville))}>
                      {ville}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Choices
                legend="Clients"
                inline
                multiple
                options={(Object.keys(CUSTOMER_TYPE_LABELS) as (keyof typeof CUSTOMER_TYPE_LABELS)[]).map((value) => ({ value, label: CUSTOMER_TYPE_LABELS[value] }))}
                value={customerTypes}
                onChange={setCustomerTypes}
                hint="Aucun coché : les deux."
              />
              <Select
                label="Relation avec la boutique"
                value={relation}
                onChange={(event) => setRelation(event.target.value as BoostRelation)}
                options={(Object.keys(BOOST_RELATION_LABELS) as BoostRelation[]).map((value) => ({ value, label: BOOST_RELATION_LABELS[value] }))}
              />
            </>
          ) : null}

          <fieldset className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={styles.eyebrow}>Budget et durée</legend>
            <div className={styles.chipRow}>
              {BUDGETS.map((value) => (
                <button key={value} type="button" aria-pressed={String(value) === dailyBudget} className={String(value) === dailyBudget ? styles.chipOn : styles.chip} onClick={() => setDailyBudget(String(value))}>
                  {`${formatPrice(value)} / jour`}
                </button>
              ))}
            </div>
            <div className={styles.row}>
              <Input
                label="Budget par jour (GNF)"
                type="number"
                min={estimate?.minDailyBudget ?? 1}
                value={dailyBudget}
                onChange={(event) => setDailyBudget(event.target.value)}
                error={tooLow && estimate ? `${formatPrice(estimate.minDailyBudget)} par jour au minimum.` : undefined}
              />
              <Input
                label="Durée (jours)"
                type="number"
                min={1}
                max={estimate?.maxDays ?? 30}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                hint={estimate ? `${estimate.maxDays} jour${estimate.maxDays > 1 ? "s" : ""} au plus.` : undefined}
              />
            </div>
          </fieldset>
        </div>

        <aside className={styles.sticky}>
          <div className={styles.preview}>
            <span className={styles.eyebrow}>Estimation</span>
            {estimateError ? (
              <Alert tone="warning">{estimateError}</Alert>
            ) : !estimate ? (
              <p className={styles.hint}>{ready ? "Calcul…" : "Choisissez ce que vous boostez."}</p>
            ) : (
              <>
                <div className={styles.previewLine}>
                  <span>Audience</span>
                  <strong>{`${integer.format(estimate.audienceSize)} clients`}</strong>
                </div>
                {!estimate.audienceOk ? (
                  <Alert tone="warning">{`Audience trop petite (moins de ${estimate.minAudience} clients) : élargissez-la, pour ne jamais viser une personne.`}</Alert>
                ) : null}
                <div className={styles.previewLine}>
                  <span>Affichages par jour</span>
                  <strong>{range(estimate.dailyViews)}</strong>
                </div>
                <div className={styles.previewLine}>
                  <span>Visites par jour</span>
                  <strong>{range(estimate.dailyVisits)}</strong>
                </div>
                <div className={styles.previewLine}>
                  <span>{`Budget total (${estimate.days} jour${estimate.days > 1 ? "s" : ""})`}</span>
                  <strong>{formatPrice(total)}</strong>
                </div>
                <div className={styles.previewLine}>
                  <span>Vos crédits</span>
                  <span>{formatPrice(estimate.credits)}</span>
                </div>
                {short ? (
                  <Alert tone="warning">
                    Crédits insuffisants pour ce budget. <Link to={sellerPaths.boosts(shop.id)}>Recharger</Link>
                  </Alert>
                ) : null}
                <p className={styles.hint}>
                  {goal === "visits"
                    ? `${formatPrice(estimate.costPerVisit)} par visite d'une fiche.`
                    : `${formatPrice(estimate.costPerThousandViews)} les 1 000 affichages.`}{" "}
                  Ce qui n'est pas dépensé revient en crédits.
                </p>
              </>
            )}
          </div>

          {previewOffer ? (
            <div className={styles.mock} aria-label="Aperçu de la place sponsorisée">
              <Thumbnail src={previewOffer.urlImages[0]} alt="" seed={previewOffer.id} />
              <span className={styles.eyebrow}>Sponsorisé</span>
              <strong>{productName(previewOffer)}</strong>
              <span>{formatPrice(effectivePrice(previewOffer))}</span>
            </div>
          ) : null}

          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button fullWidth onClick={() => void launch()} isLoading={busy} disabled={!canLaunch}>
            {`Lancer le boost${estimate ? ` — ${formatPrice(total)}` : ""}`}
          </Button>
        </aside>
      </div>
    </div>
  );
};
