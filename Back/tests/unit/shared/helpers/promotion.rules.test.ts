import { describe, it, expect } from "vitest";
import { DiscountType, PromotionStatus, PromotionType } from "../../../../src/models/promotion.model.js";
import {
  availablePromotionActions,
  checkPromotionAction,
  checkShopPromotionInput,
  discountedPrice,
  isLive,
  isPromotionAction,
  NO_END,
  percentOff,
  PRICE_TYPES,
  PROMO_LIMITS,
  PROMOTION_STATUS_LABELS,
  PROMOTION_TABS,
  PROMOTION_TYPE_LABELS,
  PromotionAction,
  SHOP_PROMOTION_TYPES,
  shownPercent,
  statusAt,
  tierFor,
  unitPriceFor,
  type RulePromotion,
  type ShopPromotionContext,
  type ShopPromotionInput,
} from "../../../../src/shared/helpers/promotion.rules.js";

const T = PromotionType;
const S = PromotionStatus;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);

/** Promotion en cours depuis hier, jusqu'à dans 5 jours. */
const promo = (over: Partial<RulePromotion> = {}): RulePromotion => ({
  type: T.PRODUCT_DISCOUNT,
  status: S.ACTIVE,
  actif: true,
  startDate: at(-DAY),
  endDate: at(5 * DAY),
  ...over,
});

/** Boutique ancienne, sans rien en cours : aucun plafond atteint. */
const context = (over: Partial<ShopPromotionContext> = {}): ShopPromotionContext => ({
  running: 0,
  activeCodes: 0,
  flashThisMonth: 0,
  shopAgeDays: 90,
  deliveredOrders: 20,
  ...over,
});

/** Remise produit valide de 20 % sur une offre, pendant 7 jours, à partir de maintenant. */
const input = (over: Partial<ShopPromotionInput> = {}): ShopPromotionInput => ({
  type: T.PRODUCT_DISCOUNT,
  nom: "Remise d'octobre",
  discountValue: 20,
  startDate: NOW,
  endDate: at(7 * DAY),
  productBoutiqueIds: ["a"],
  ...over,
});

const check = (over: Partial<ShopPromotionInput> = {}, ctx: Partial<ShopPromotionContext> = {}) =>
  checkShopPromotionInput(input(over), context(ctx), NOW);

// ─────────────────────────────────────────────
describe("libellés et constantes", () => {
  it("nomme chaque type et chaque état", () => {
    expect(PROMOTION_TYPE_LABELS).toEqual({
      product_discount: "Remise produit",
      shop_discount: "Promotion boutique",
      coupon: "Code promo",
      flash_sale: "Vente flash",
      quantity_tiers: "Prix par quantité",
      free_shipping: "Livraison offerte",
    });
    expect(PROMOTION_STATUS_LABELS).toEqual({
      draft: "Brouillon",
      scheduled: "Programmée",
      active: "En cours",
      paused: "En pause",
      ended: "Terminée",
      stopped: "Arrêtée",
    });
  });

  it("laisse une boutique lancer les six types ; trois fixent le prix d'une offre", () => {
    expect([...SHOP_PROMOTION_TYPES].sort()).toEqual(Object.values(T).sort());
    expect(PRICE_TYPES).toEqual([T.PRODUCT_DISCOUNT, T.SHOP_DISCOUNT, T.FLASH_SALE]);
  });

  it("range les états dans les onglets de l'espace boutique", () => {
    expect(PROMOTION_TABS).toEqual({ active: [S.ACTIVE, S.PAUSED], scheduled: [S.SCHEDULED, S.DRAFT], ended: [S.ENDED, S.STOPPED] });
  });

  it("reconnaît les actions", () => {
    for (const action of ["launch", "pause", "resume", "extend", "stop"]) expect(isPromotionAction(action)).toBe(true);
    expect(isPromotionAction("delete")).toBe(false);
    expect(isPromotionAction(3)).toBe(false);
  });
});

// ─────────────────────────────────────────────
describe("statusAt / isLive", () => {
  it.each([S.DRAFT, S.PAUSED, S.STOPPED])("garde un choix de la boutique (%s), quelles que soient les dates", (status) => {
    expect(statusAt(promo({ status, startDate: at(-10 * DAY), endDate: at(-DAY) }), NOW)).toBe(status);
    expect(isLive(promo({ status }), NOW)).toBe(false);
  });

  it("dit arrêtée une promotion de la plateforme désactivée", () => {
    expect(statusAt(promo({ actif: false }), NOW)).toBe(S.STOPPED);
  });

  it("suit les dates : programmée, en cours, terminée", () => {
    expect(statusAt(promo({ startDate: at(HOUR) }), NOW)).toBe(S.SCHEDULED);
    expect(statusAt(promo(), NOW)).toBe(S.ACTIVE);
    expect(statusAt(promo({ endDate: at(-1) }), NOW)).toBe(S.ENDED);
  });

  it("n'attend pas le planificateur : une promotion « programmée » dont la date est venue est en cours", () => {
    expect(statusAt(promo({ status: S.SCHEDULED }), NOW)).toBe(S.ACTIVE);
    expect(statusAt(promo({ status: S.ACTIVE, endDate: at(-1) }), NOW)).toBe(S.ENDED);
  });

  it("compte les bornes comme incluses", () => {
    expect(statusAt(promo({ startDate: NOW }), NOW)).toBe(S.ACTIVE);
    expect(statusAt(promo({ endDate: NOW }), NOW)).toBe(S.ACTIVE);
  });

  it("termine une promotion épuisée : limite d'utilisation ou quantité flash", () => {
    expect(statusAt(promo({ usageLimit: 3, usedCount: 3 }), NOW)).toBe(S.ENDED);
    expect(statusAt(promo({ usageLimit: 3, usedCount: 2 }), NOW)).toBe(S.ACTIVE);
    expect(statusAt(promo({ flashQuantity: 10, flashSold: 10 }), NOW)).toBe(S.ENDED);
    expect(statusAt(promo({ flashQuantity: 10, flashSold: 9 }), NOW)).toBe(S.ACTIVE);
  });

  it("prend « en cours » quand l'état n'est pas renseigné (promotion de la plateforme)", () => {
    expect(statusAt(promo({ status: undefined }), NOW)).toBe(S.ACTIVE);
    expect(isLive(promo({ status: undefined }), NOW)).toBe(true);
  });
});

// ─────────────────────────────────────────────
describe("calcul des prix", () => {
  it("applique un pourcentage ou un montant fixe, arrondi, jamais sous zéro", () => {
    expect(discountedPrice(10_000, DiscountType.PERCENTAGE, 20)).toBe(8_000);
    expect(discountedPrice(999, DiscountType.PERCENTAGE, 15)).toBe(849); // 849,15
    expect(discountedPrice(10_000, DiscountType.FIXED, 2_500)).toBe(7_500);
    expect(discountedPrice(1_000, DiscountType.FIXED, 5_000)).toBe(0);
    expect(discountedPrice(10_000, undefined, 10)).toBe(9_000);
  });

  it("calcule la remise affichée en pourcentage entier, arrondi vers le bas", () => {
    expect(percentOff(10_000, 8_000)).toBe(20);
    expect(percentOff(3_000, 2_000)).toBe(33);
    expect(percentOff(10_000, 10_000)).toBe(0);
    expect(percentOff(10_000, 12_000)).toBe(0);
    expect(percentOff(0, 0)).toBe(0);
  });

  it("n'affiche le prix barré qu'à partir de 5 %", () => {
    expect(shownPercent(10_000, 9_500)).toBe(5);
    expect(shownPercent(10_000, 9_501)).toBe(0); // 4,99 %
    expect(shownPercent(10_000, 9_600)).toBe(0);
  });

  it("trouve le palier atteint : le plus généreux parmi ceux atteints", () => {
    const offer = { price: 1_000, quantityTiers: [{ minQuantity: 10, percent: 20 }, { minQuantity: 3, percent: 10 }, { minQuantity: 5, percent: 15 }] };
    expect(tierFor(offer, 2)).toBeNull();
    expect(tierFor(offer, 3)).toEqual({ minQuantity: 3, percent: 10 });
    expect(tierFor(offer, 9)).toEqual({ minQuantity: 5, percent: 15 });
    expect(tierFor(offer, 10)).toEqual({ minQuantity: 10, percent: 20 });
    expect(tierFor({ price: 1_000 }, 50)).toBeNull();
  });

  it("paie le plus bas du prix promotionnel et du palier, jamais leur cumul", () => {
    const offer = { price: 1_000, discountPrice: 900, quantityTiers: [{ minQuantity: 5, percent: 20 }] };
    expect(unitPriceFor(offer, 1)).toBe(900);
    expect(unitPriceFor(offer, 5)).toBe(800); // et non 900 × 0,8
    expect(unitPriceFor({ ...offer, discountPrice: 700 }, 5)).toBe(700);
  });

  it("ignore un prix promotionnel absent ou supérieur au prix de base", () => {
    expect(unitPriceFor({ price: 1_000, discountPrice: null }, 1)).toBe(1_000);
    expect(unitPriceFor({ price: 1_000, discountPrice: 1_200 }, 1)).toBe(1_000);
    expect(unitPriceFor({ price: 1_000, discountPrice: 1_000 }, 1)).toBe(1_000);
  });
});

// ─────────────────────────────────────────────
describe("checkShopPromotionInput — forme", () => {
  it("accepte une remise produit valide", () => {
    expect(check()).toBeNull();
  });

  it("refuse un type inconnu et un nom vide", () => {
    expect(check({ type: "bogus" as PromotionType })).toBe("Type de promotion inconnu.");
    expect(check({ nom: "   " })).toBe("Donnez un nom à la promotion.");
  });

  it.each([T.PRODUCT_DISCOUNT, T.FLASH_SALE, T.QUANTITY_TIERS])("exige au moins une offre (%s)", (type) => {
    expect(check({ type, productBoutiqueIds: [] })).toBe("Choisissez au moins une offre.");
  });

  it("plafonne le nombre d'offres : 50 en remise produit, 10 en vente flash, 1 en prix par quantité", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, index) => String(index));
    expect(check({ productBoutiqueIds: ids(50) })).toBeNull();
    expect(check({ productBoutiqueIds: ids(51) })).toBe("50 offres au plus pour ce type de promotion.");
    expect(check({ type: T.FLASH_SALE, endDate: at(4 * HOUR), flashQuantity: 5, productBoutiqueIds: ids(11) })).toBe(
      "10 offres au plus pour ce type de promotion."
    );
    expect(check({ type: T.QUANTITY_TIERS, tiers: [{ minQuantity: 3, discountValue: 10 }], productBoutiqueIds: ids(2) })).toBe(
      "Un prix par quantité porte sur une seule offre."
    );
  });

  it("n'exige pas d'offre pour une promotion boutique, un code ou la livraison offerte", () => {
    expect(check({ type: T.SHOP_DISCOUNT, productBoutiqueIds: [] })).toBeNull();
    expect(check({ type: T.COUPON, code: "KALOUM10", productBoutiqueIds: [] })).toBeNull();
    expect(check({ type: T.FREE_SHIPPING, minAmount: 100_000, productBoutiqueIds: [], discountValue: undefined })).toBeNull();
  });
});

describe("checkShopPromotionInput — remise", () => {
  it.each([
    [4, "La remise va de 5 à 70 %."],
    [5, null],
    [50, null],
    [70, null],
    [71, "La remise va de 5 à 70 %."],
  ])("remise de %s %% → %s", (value, expected) => {
    expect(check({ discountValue: value, confirmHighDiscount: true })).toBe(expected);
  });

  it("fait confirmer une remise de plus de 50 %", () => {
    expect(check({ discountValue: 50 })).toBeNull();
    expect(check({ discountValue: 51 })).toBe("Une remise de plus de 50 % se confirme : vérifiez-la, puis confirmez.");
    expect(check({ discountValue: 51, confirmHighDiscount: true })).toBeNull();
  });

  it("refuse une remise absente", () => {
    expect(check({ discountValue: undefined })).toBe("La remise va de 5 à 70 %.");
  });

  it("ne donne une remise d'offre qu'en pourcentage ; un code peut être un montant fixe", () => {
    expect(check({ discountType: DiscountType.FIXED, discountValue: 1_000 })).toBe("Une remise d'offre se donne en pourcentage.");
    expect(check({ type: T.COUPON, code: "MOINS5000", discountType: DiscountType.FIXED, discountValue: 5_000 })).toBeNull();
    expect(check({ type: T.COUPON, code: "MOINS5000", discountType: DiscountType.FIXED, discountValue: 0 })).toBe(
      "Indiquez le montant de la remise."
    );
  });

  it("ignore la remise de la livraison offerte", () => {
    expect(check({ type: T.FREE_SHIPPING, minAmount: 50_000, discountValue: 0 })).toBeNull();
  });
});

describe("checkShopPromotionInput — prix par quantité", () => {
  const tiers = (list: { minQuantity: number; discountValue: number }[]) =>
    check({ type: T.QUANTITY_TIERS, tiers: list, endDate: undefined });

  it("accepte 1 à 3 paliers, sans fin", () => {
    expect(tiers([{ minQuantity: 3, discountValue: 5 }])).toBeNull();
    expect(tiers([{ minQuantity: 3, discountValue: 5 }, { minQuantity: 6, discountValue: 10 }, { minQuantity: 12, discountValue: 15 }])).toBeNull();
  });

  it("refuse 0 ou plus de 3 paliers", () => {
    expect(tiers([])).toBe("De 1 à 3 paliers.");
    expect(
      tiers([
        { minQuantity: 2, discountValue: 5 },
        { minQuantity: 3, discountValue: 10 },
        { minQuantity: 4, discountValue: 15 },
        { minQuantity: 5, discountValue: 20 },
      ])
    ).toBe("De 1 à 3 paliers.");
  });

  it("commence à 2 unités, en nombre entier", () => {
    expect(tiers([{ minQuantity: 1, discountValue: 10 }])).toBe("Un palier commence à 2 unités au moins.");
    expect(tiers([{ minQuantity: 2.5, discountValue: 10 }])).toBe("Un palier commence à 2 unités au moins.");
    expect(tiers([{ minQuantity: 2, discountValue: 10 }])).toBeNull();
  });

  it("garde chaque palier entre 5 et 70 %", () => {
    expect(tiers([{ minQuantity: 2, discountValue: 4 }])).toBe("La remise d'un palier va de 5 à 70 %.");
    expect(tiers([{ minQuantity: 2, discountValue: 71 }])).toBe("La remise d'un palier va de 5 à 70 %.");
  });

  it("exige plus d'unités et plus de remise à chaque palier, dans n'importe quel ordre de saisie", () => {
    const message = "Chaque palier demande plus d'unités et donne plus de remise que le précédent.";
    expect(tiers([{ minQuantity: 6, discountValue: 15 }, { minQuantity: 3, discountValue: 10 }])).toBeNull();
    expect(tiers([{ minQuantity: 3, discountValue: 10 }, { minQuantity: 3, discountValue: 15 }])).toBe(message);
    expect(tiers([{ minQuantity: 3, discountValue: 15 }, { minQuantity: 6, discountValue: 15 }])).toBe(message);
    expect(tiers([{ minQuantity: 3, discountValue: 20 }, { minQuantity: 6, discountValue: 10 }])).toBe(message);
  });

  it("ne compte pas dans le plafond des promotions en cours", () => {
    expect(check({ type: T.QUANTITY_TIERS, tiers: [{ minQuantity: 3, discountValue: 10 }] }, { running: 20 })).toBeNull();
  });
});

describe("checkShopPromotionInput — dates", () => {
  it("refuse une date de début invalide ou passée (5 minutes de tolérance)", () => {
    expect(check({ startDate: new Date("n'importe quoi") })).toBe("Date de début invalide.");
    expect(check({ startDate: at(-4 * 60 * 1000) })).toBeNull();
    expect(check({ startDate: at(-6 * 60 * 1000) })).toBe("La date de début est passée.");
  });

  it("exige une fin après le début", () => {
    expect(check({ endDate: undefined })).toBe("Indiquez la date de fin.");
    expect(check({ endDate: new Date("invalide") })).toBe("Indiquez la date de fin.");
    expect(check({ endDate: NOW })).toBe("La fin vient après le début.");
  });

  it.each([
    [T.PRODUCT_DISCOUNT, 30],
    [T.SHOP_DISCOUNT, 30],
    [T.COUPON, 90],
    [T.FREE_SHIPPING, 90],
  ])("limite la durée de %s à %s jours", (type, days) => {
    const extra = { code: "KALOUM10", minAmount: 10_000 };
    expect(check({ type, ...extra, endDate: at(days * DAY) })).toBeNull();
    expect(check({ type, ...extra, endDate: at(days * DAY + 1) })).toBe(`Cette promotion dure ${days} jours au plus.`);
  });

  it("fait durer une vente flash de 2 à 72 heures", () => {
    const flash = (hours: number) => check({ type: T.FLASH_SALE, flashQuantity: 5, endDate: at(hours * HOUR) });
    const message = "Une vente flash dure de 2 à 72 heures.";
    expect(flash(1.99)).toBe(message);
    expect(flash(2)).toBeNull();
    expect(flash(72)).toBeNull();
    expect(flash(72.01)).toBe(message);
  });
});

describe("checkShopPromotionInput — spécificités et plafonds", () => {
  it("contrôle le code : 4 à 20 lettres majuscules ou chiffres", () => {
    const code = (value: string | undefined) => check({ type: T.COUPON, code: value });
    const message = "Le code fait de 4 à 20 lettres ou chiffres.";
    expect(code(undefined)).toBe(message);
    expect(code("ABC")).toBe(message);
    expect(code("ABCD")).toBeNull();
    expect(code("A".repeat(20))).toBeNull();
    expect(code("A".repeat(21))).toBe(message);
    expect(code("abcd")).toBe(message);
    expect(code("AB-CD")).toBe(message);
  });

  it("limite à 5 codes actifs par boutique", () => {
    expect(check({ type: T.COUPON, code: "KALOUM10" }, { activeCodes: 4 })).toBeNull();
    expect(check({ type: T.COUPON, code: "KALOUM10" }, { activeCodes: 5 })).toBe("5 codes actifs au plus par boutique.");
  });

  it("exige le seuil d'une livraison offerte", () => {
    expect(check({ type: T.FREE_SHIPPING, minAmount: 0 })).toBe("Indiquez le montant à partir duquel la livraison est offerte.");
    expect(check({ type: T.FREE_SHIPPING })).toBe("Indiquez le montant à partir duquel la livraison est offerte.");
  });

  describe("vente flash", () => {
    const flash = (over: Partial<ShopPromotionInput> = {}, ctx: Partial<ShopPromotionContext> = {}) =>
      check({ type: T.FLASH_SALE, flashQuantity: 5, endDate: at(4 * HOUR), ...over }, ctx);

    it("exige une quantité entière d'au moins 1", () => {
      const message = "Indiquez la quantité vendue au prix flash.";
      expect(flash({ flashQuantity: undefined })).toBe(message);
      expect(flash({ flashQuantity: 0 })).toBe(message);
      expect(flash({ flashQuantity: 2.5 })).toBe(message);
      expect(flash({ flashQuantity: 1 })).toBeNull();
    });

    it("s'ouvre après 30 jours d'ancienneté et 5 commandes livrées", () => {
      const message = "La vente flash s'ouvre après 30 jours et 5 commandes livrées.";
      expect(flash({}, { shopAgeDays: 29 })).toBe(message);
      expect(flash({}, { deliveredOrders: 4 })).toBe(message);
      expect(flash({}, { shopAgeDays: 30, deliveredOrders: 5 })).toBeNull();
    });

    it("limite à 2 ventes flash par mois", () => {
      expect(flash({}, { flashThisMonth: 1 })).toBeNull();
      expect(flash({}, { flashThisMonth: 2 })).toBe("2 ventes flash par mois au plus.");
    });
  });

  it("limite à 20 promotions en cours ou programmées", () => {
    expect(check({}, { running: 19 })).toBeNull();
    expect(check({}, { running: 20 })).toBe("20 promotions en cours ou programmées au plus.");
  });

  it("expose les limites utilisées par le front", () => {
    expect(PROMO_LIMITS).toMatchObject({
      minPercent: 5,
      maxPercent: 70,
      confirmAbove: 50,
      flashHours: { min: 2, max: 72 },
      flashCooldownDays: 30,
      maxTiers: 3,
      maxRunning: 20,
      maxFlashPerMonth: 2,
      maxActiveCodes: 5,
      seniorityDays: 30,
      seniorityDeliveredOrders: 5,
      referenceDays: 30,
    });
    expect(NO_END.toISOString()).toBe("9999-12-31T00:00:00.000Z");
  });
});

// ─────────────────────────────────────────────
describe("checkPromotionAction", () => {
  const action = (name: PromotionAction, over: Partial<RulePromotion> = {}, endDate?: Date) =>
    checkPromotionAction(name, promo(over), { endDate }, NOW);

  it("ne lance qu'un brouillon", () => {
    expect(action(PromotionAction.LAUNCH, { status: S.DRAFT })).toBeNull();
    expect(action(PromotionAction.LAUNCH)).toBe("Seul un brouillon se lance.");
  });

  it("ne met en pause qu'une promotion en cours", () => {
    expect(action(PromotionAction.PAUSE)).toBeNull();
    expect(action(PromotionAction.PAUSE, { startDate: at(DAY) })).toBe("Seule une promotion en cours se met en pause.");
    expect(action(PromotionAction.PAUSE, { status: S.PAUSED })).toBe("Seule une promotion en cours se met en pause.");
  });

  it("ne reprend qu'une promotion en pause dont la fin n'est pas passée", () => {
    expect(action(PromotionAction.RESUME, { status: S.PAUSED })).toBeNull();
    expect(action(PromotionAction.RESUME)).toBe("Seule une promotion en pause reprend.");
    expect(action(PromotionAction.RESUME, { status: S.PAUSED, endDate: at(-1) })).toBe("Sa date de fin est passée : dupliquez-la plutôt.");
  });

  describe("prolonger", () => {
    it("prolonge une promotion en cours, programmée ou en pause", () => {
      expect(action(PromotionAction.EXTEND, {}, at(10 * DAY))).toBeNull();
      expect(action(PromotionAction.EXTEND, { startDate: at(DAY), endDate: at(3 * DAY) }, at(10 * DAY))).toBeNull();
      expect(action(PromotionAction.EXTEND, { status: S.PAUSED }, at(10 * DAY))).toBeNull();
    });

    it("refuse une promotion terminée, arrêtée ou un brouillon", () => {
      expect(action(PromotionAction.EXTEND, { endDate: at(-1) }, at(DAY))).toBe("Cette promotion est terminée.");
      expect(action(PromotionAction.EXTEND, { status: S.STOPPED }, at(DAY))).toBe("Cette promotion est terminée.");
      expect(action(PromotionAction.EXTEND, { status: S.DRAFT }, at(DAY))).toBe("Cette promotion est terminée.");
    });

    it("refuse un prix par quantité, sans fin", () => {
      expect(action(PromotionAction.EXTEND, { type: T.QUANTITY_TIERS, endDate: NO_END }, at(DAY))).toBe("Un prix par quantité n'a pas de fin.");
    });

    it("exige une nouvelle fin valide, après l'actuelle", () => {
      expect(action(PromotionAction.EXTEND)).toBe("Indiquez la nouvelle date de fin.");
      expect(action(PromotionAction.EXTEND, {}, new Date("invalide"))).toBe("Indiquez la nouvelle date de fin.");
      expect(action(PromotionAction.EXTEND, {}, at(5 * DAY))).toBe("La nouvelle fin vient après l'actuelle.");
    });

    it("garde la durée maximale du type, comptée depuis le début", () => {
      // Commencée hier : 30 jours au plus, donc jusqu'à dans 29 jours.
      expect(action(PromotionAction.EXTEND, {}, at(29 * DAY))).toBeNull();
      expect(action(PromotionAction.EXTEND, {}, at(29 * DAY + 1))).toBe("Cette promotion dure 30 jours au plus.");
      expect(action(PromotionAction.EXTEND, { type: T.COUPON }, at(89 * DAY))).toBeNull();
    });

    it("garde une vente flash sous 72 heures", () => {
      const flash = { type: T.FLASH_SALE, startDate: at(-HOUR), endDate: at(3 * HOUR) };
      expect(action(PromotionAction.EXTEND, flash, at(71 * HOUR))).toBeNull();
      expect(action(PromotionAction.EXTEND, flash, at(71 * HOUR + 1))).toBe("Une vente flash dure 72 heures au plus.");
    });
  });

  it("arrête tout sauf une promotion déjà terminée", () => {
    expect(action(PromotionAction.STOP)).toBeNull();
    expect(action(PromotionAction.STOP, { status: S.DRAFT })).toBeNull();
    expect(action(PromotionAction.STOP, { status: S.PAUSED })).toBeNull();
    expect(action(PromotionAction.STOP, { startDate: at(DAY) })).toBeNull();
    expect(action(PromotionAction.STOP, { endDate: at(-1) })).toBe("Cette promotion est déjà terminée.");
    expect(action(PromotionAction.STOP, { status: S.STOPPED })).toBe("Cette promotion est déjà terminée.");
  });

  it("refuse une action inconnue", () => {
    expect(checkPromotionAction("delete" as PromotionAction, promo(), {}, NOW)).toBe("Action inconnue.");
  });
});

describe("availablePromotionActions", () => {
  const actions = (over: Partial<RulePromotion> = {}) => availablePromotionActions(promo(over), NOW);

  it.each<[string, Partial<RulePromotion>, PromotionAction[]]>([
    ["brouillon", { status: S.DRAFT }, ["launch", "stop"]],
    ["programmée", { startDate: at(DAY) }, ["extend", "stop"]],
    ["en cours", {}, ["pause", "extend", "stop"]],
    ["en pause", { status: S.PAUSED }, ["resume", "extend", "stop"]],
    ["terminée", { endDate: at(-1) }, []],
    ["arrêtée", { status: S.STOPPED }, []],
  ])("propose les bons boutons pour une promotion %s", (_label, over, expected) => {
    expect(actions(over)).toEqual(expected);
  });

  it("ne propose jamais de prolonger un prix par quantité", () => {
    expect(actions({ type: T.QUANTITY_TIERS, endDate: NO_END })).toEqual(["pause", "stop"]);
  });

  it("ne propose pas de reprendre une pause dont la fin est passée", () => {
    expect(actions({ status: S.PAUSED, endDate: at(-1) })).toEqual(["extend", "stop"]);
  });
});
