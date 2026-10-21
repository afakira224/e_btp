import { describe, it, expect } from "vitest";
import { DeliveryMethod } from "../../../../src/models/delivery.model.js";
import {
  buildProductDelivery,
  feeFor,
  quoteDelivery,
  resolveEffectiveDelivery,
  selectionFromBody,
  shopDeliveryOf,
  summaryMethod,
  toOrderDeliveries,
  validateDeliverySettings,
} from "../../../../src/shared/helpers/delivery.helper.js";
import { makeProductBoutique, makeShop } from "../../../helpers/factories.js";

const { PICKUP, FREE, FLAT_RATE } = DeliveryMethod;

const inherit = { useShopSettings: true, modes: [], flatRateFee: null };
const custom = (modes: string[], flatRateFee: number | null = null) => ({
  useShopSettings: false,
  modes,
  flatRateFee,
});

// ─────────────────────────────────────────────
describe("validateDeliverySettings — configuration d'une boutique", () => {
  const shop = makeShop({ adresse: "Matam, Conakry" });

  it("accepte le retrait en boutique quand la boutique a une adresse", () => {
    expect(validateDeliverySettings({ modes: [PICKUP] }, shop)).toBeNull();
  });

  it("accepte la livraison gratuite", () => {
    expect(validateDeliverySettings({ modes: [FREE] }, shop)).toBeNull();
  });

  it("accepte la livraison à prix fixe avec un tarif valide", () => {
    expect(validateDeliverySettings({ modes: [FLAT_RATE], flatRateFee: 25_000 }, shop)).toBeNull();
  });

  it("accepte plusieurs modes simultanément", () => {
    expect(validateDeliverySettings({ modes: [PICKUP, FLAT_RATE], flatRateFee: 25_000 }, shop)).toBeNull();
  });

  it("refuse une configuration sans aucun mode", () => {
    expect(validateDeliverySettings({ modes: [] }, shop)).toMatch(/au moins un mode/);
  });

  it("refuse le prix fixe sans tarif", () => {
    expect(validateDeliverySettings({ modes: [FLAT_RATE] }, shop)).toBe(
      "Le tarif de la livraison à prix fixe est requis quand ce mode est activé."
    );
    expect(validateDeliverySettings({ modes: [FLAT_RATE], flatRateFee: null }, shop)).toMatch(/requis/);
  });

  it.each([-1, 0, 12_500.5, Number.MAX_SAFE_INTEGER + 2])("refuse le tarif %s", (fee) => {
    expect(validateDeliverySettings({ modes: [FLAT_RATE], flatRateFee: fee }, shop)).toMatch(
      /nombre entier de GNF supérieur à 0/
    );
  });

  it("ignore le tarif quand le prix fixe n'est pas actif", () => {
    expect(validateDeliverySettings({ modes: [FREE], flatRateFee: -10 }, shop)).toBeNull();
  });

  it("refuse le retrait pour une boutique sans adresse", () => {
    expect(validateDeliverySettings({ modes: [PICKUP] }, makeShop({ adresse: "  " }))).toMatch(
      /nécessite l'adresse de la boutique/
    );
  });

  it("refuse un mode inconnu", () => {
    expect(validateDeliverySettings({ modes: ["express"] }, shop)).toMatch(/Mode de livraison inconnu : express/);
  });
});

// ─────────────────────────────────────────────
describe("resolveEffectiveDelivery — héritage et personnalisation", () => {
  it("fait hériter un nouveau produit des modes actifs de sa boutique", () => {
    const shop = makeShop({ delivery: { modes: [PICKUP, FLAT_RATE], flatRateFee: 30_000 } });
    const offer = makeProductBoutique({ delivery: inherit });

    expect(resolveEffectiveDelivery(offer, shop)).toEqual({
      source: "shop",
      modes: [PICKUP, FLAT_RATE],
      flatRateFee: 30_000,
    });
  });

  it("reprend le tarif fixe actuel de la boutique", () => {
    const shop = makeShop({ delivery: { modes: [FLAT_RATE], flatRateFee: 30_000 } });
    const offer = makeProductBoutique({ delivery: inherit });

    shop.delivery = { modes: [FLAT_RATE], flatRateFee: 45_000 };

    expect(resolveEffectiveDelivery(offer, shop).flatRateFee).toBe(45_000);
  });

  it("suit une modification des modes de la boutique", () => {
    const shop = makeShop({ delivery: { modes: [PICKUP], flatRateFee: null } });
    const offer = makeProductBoutique({ delivery: inherit });
    expect(resolveEffectiveDelivery(offer, shop).modes).toEqual([PICKUP]);

    shop.delivery = { modes: [FREE, PICKUP], flatRateFee: null };

    expect(resolveEffectiveDelivery(offer, shop).modes).toEqual([PICKUP, FREE]);
  });

  it("applique la configuration personnalisée d'un produit", () => {
    const shop = makeShop({ delivery: { modes: [PICKUP, FLAT_RATE], flatRateFee: 25_000 } });
    const offer = makeProductBoutique({ delivery: custom([FLAT_RATE], 150_000) });

    expect(resolveEffectiveDelivery(offer, shop)).toEqual({
      source: "product",
      modes: [FLAT_RATE],
      flatRateFee: 150_000,
    });
  });

  it("ne laisse pas une modification de la boutique écraser un produit personnalisé", () => {
    const shop = makeShop({ delivery: { modes: [PICKUP, FLAT_RATE], flatRateFee: 25_000 } });
    const offer = makeProductBoutique({ delivery: custom([FREE]) });

    shop.delivery = { modes: [FLAT_RATE], flatRateFee: 99_000 };

    expect(resolveEffectiveDelivery(offer, shop)).toEqual({ source: "product", modes: [FREE], flatRateFee: null });
  });

  it("traite une offre et une boutique antérieures à la migration avec les valeurs par défaut", () => {
    const legacyShop = makeShop();
    const legacyOffer = makeProductBoutique();
    delete (legacyShop as any).delivery;
    delete (legacyOffer as any).delivery;

    expect(shopDeliveryOf(legacyShop)).toEqual({ modes: [PICKUP, FLAT_RATE], flatRateFee: 25_000 });
    expect(resolveEffectiveDelivery(legacyOffer, legacyShop)).toEqual({
      source: "shop",
      modes: [PICKUP, FLAT_RATE],
      flatRateFee: 25_000,
    });
  });
});

// ─────────────────────────────────────────────
describe("buildProductDelivery — saisie du vendeur", () => {
  const shop = makeShop({ adresse: "Kaloum" });

  it("revient à l'héritage et efface la configuration propre", () => {
    expect(buildProductDelivery({ useShopSettings: true, modes: [FREE], flatRateFee: 9 }, shop)).toEqual({
      delivery: inherit,
    });
  });

  it("normalise une configuration personnalisée", () => {
    expect(
      buildProductDelivery({ useShopSettings: false, modes: [FLAT_RATE, PICKUP, PICKUP], flatRateFee: 40_000 }, shop)
    ).toEqual({ delivery: custom([PICKUP, FLAT_RATE], 40_000) });
  });

  it("oublie le tarif quand le prix fixe n'est pas retenu", () => {
    expect(buildProductDelivery({ useShopSettings: false, modes: [FREE], flatRateFee: 40_000 }, shop)).toEqual({
      delivery: custom([FREE], null),
    });
  });

  it("refuse une personnalisation au prix fixe sans tarif", () => {
    expect(buildProductDelivery({ useShopSettings: false, modes: [FLAT_RATE] }, shop)).toEqual({
      error: "Le tarif de la livraison à prix fixe est requis quand ce mode est activé.",
    });
  });

  it("refuse une personnalisation sans mode", () => {
    expect(buildProductDelivery({ useShopSettings: false }, shop)).toHaveProperty("error");
  });
});

// ─────────────────────────────────────────────
describe("feeFor", () => {
  it("ne facture jamais le retrait ni la livraison gratuite", () => {
    expect(feeFor(PICKUP, 25_000)).toBe(0);
    expect(feeFor(FREE, 25_000)).toBe(0);
    expect(feeFor(FLAT_RATE, 25_000)).toBe(25_000);
  });
});

// ─────────────────────────────────────────────
describe("quoteDelivery — panier", () => {
  const depot = makeShop({ nom: "Dépôt Matam", adresse: "Matam", delivery: { modes: [PICKUP, FLAT_RATE], flatRateFee: 50_000 } });
  const coloris = makeShop({ nom: "Coloris", adresse: "Ratoma", delivery: { modes: [PICKUP, FREE], flatRateFee: null } });

  const line = (shop: ReturnType<typeof makeShop>, delivery: object = inherit, quantity = 1) => ({
    offer: makeProductBoutique({ boutiqueId: shop._id, delivery }),
    quantity,
  });

  it("facture le prix fixe une seule fois pour plusieurs produits d'une même boutique", () => {
    const quote = quoteDelivery([line(depot, inherit, 40), line(depot, inherit, 2)], [depot], { all: FLAT_RATE });

    expect(quote.groups).toHaveLength(1);
    expect(quote.groups[0]!.fee).toBe(50_000);
    expect(quote.shippingFee).toBe(50_000);
    expect(quote.ready).toBe(true);
  });

  it("retient le tarif le plus élevé quand un produit a son propre tarif", () => {
    const quote = quoteDelivery(
      [line(depot), line(depot, custom([FLAT_RATE], 150_000))],
      [depot],
      { all: FLAT_RATE }
    );

    expect(quote.groups[0]!.options).toEqual([{ method: FLAT_RATE, fee: 150_000 }]);
    expect(quote.shippingFee).toBe(150_000);
  });

  it("traite séparément les livraisons de deux boutiques", () => {
    const quote = quoteDelivery(
      [line(depot), line(coloris)],
      [depot, coloris],
      { byShop: new Map([[depot._id.toString(), FLAT_RATE], [coloris._id.toString(), FREE]]) }
    );

    expect(quote.groups.map((g) => [g.boutiqueNom, g.selectedMethod, g.fee])).toEqual([
      ["Dépôt Matam", FLAT_RATE, 50_000],
      ["Coloris", FREE, 0],
    ]);
    expect(quote.shippingFee).toBe(50_000);
    expect(quote.ready).toBe(true);
  });

  it("ne propose que les modes acceptés par tous les produits de la boutique", () => {
    const quote = quoteDelivery([line(depot), line(depot, custom([PICKUP]))], [depot]);

    expect(quote.groups[0]!.options).toEqual([{ method: PICKUP, fee: 0 }]);
    // Seul mode commun : il est retenu d'office.
    expect(quote.groups[0]!.selectedMethod).toBe(PICKUP);
  });

  it("refuse un mode non autorisé pour un produit", () => {
    const quote = quoteDelivery([line(depot, custom([PICKUP]))], [depot], { all: FLAT_RATE });

    expect(quote.ready).toBe(false);
    expect(quote.groups[0]!.selectedMethod).toBeNull();
    expect(quote.groups[0]!.error).toBe("« Livraison à prix fixe » n'est pas proposé par Dépôt Matam pour ces articles.");
    expect(quote.shippingFee).toBe(0);
  });

  it("signale des produits sans mode commun", () => {
    const quote = quoteDelivery([line(depot, custom([PICKUP])), line(depot, custom([FREE]))], [depot]);

    expect(quote.ready).toBe(false);
    expect(quote.groups[0]!.error).toMatch(/aucun mode de livraison en commun/);
  });

  it("attend un choix quand plusieurs modes sont possibles", () => {
    const quote = quoteDelivery([line(depot)], [depot]);

    expect(quote.ready).toBe(false);
    expect(quote.groups[0]!.options.map((o) => o.method)).toEqual([PICKUP, FLAT_RATE]);
    expect(quote.groups[0]!.error).toBe("Choisissez un mode de livraison pour Dépôt Matam.");
  });

  it("fait primer le choix par boutique sur le choix commun", () => {
    const quote = quoteDelivery([line(depot)], [depot], {
      all: FLAT_RATE,
      byShop: new Map([[depot._id.toString(), PICKUP]]),
    });

    expect(quote.groups[0]!.selectedMethod).toBe(PICKUP);
  });

  it("signale une boutique disparue", () => {
    const quote = quoteDelivery([line(depot)], [], { all: PICKUP });

    expect(quote.ready).toBe(false);
    expect(quote.groups[0]!.error).toMatch(/n'est plus disponible/);
  });

  it("n'est jamais prêt pour un panier vide", () => {
    expect(quoteDelivery([], []).ready).toBe(false);
  });
});

// ─────────────────────────────────────────────
describe("instantané de commande", () => {
  const depot = makeShop({ nom: "Dépôt Matam", adresse: "Matam", delivery: { modes: [PICKUP, FLAT_RATE], flatRateFee: 50_000 } });

  it("fige le mode, les frais et l'adresse de retrait", () => {
    const quote = quoteDelivery([{ offer: makeProductBoutique({ boutiqueId: depot._id }), quantity: 1 }], [depot], {
      all: PICKUP,
    });

    expect(toOrderDeliveries(quote)).toEqual([
      { boutiqueId: depot._id, boutiqueNom: "Dépôt Matam", method: PICKUP, fee: 0, pickupAdresse: "Matam" },
    ]);
  });

  it("n'enregistre pas d'adresse de retrait pour une livraison", () => {
    const quote = quoteDelivery([{ offer: makeProductBoutique({ boutiqueId: depot._id }), quantity: 1 }], [depot], {
      all: FLAT_RATE,
    });

    expect(toOrderDeliveries(quote)[0]).not.toHaveProperty("pickupAdresse");
  });

  it("résume le mode de la commande", () => {
    expect(summaryMethod([FREE, FREE])).toBe(FREE);
    expect(summaryMethod([FREE, PICKUP])).toBe(DeliveryMethod.MIXED);
  });
});

// ─────────────────────────────────────────────
describe("selectionFromBody", () => {
  it("lit le choix du client et ignore tout montant envoyé", () => {
    const shopId = makeShop()._id.toString();
    const selection = selectionFromBody({
      deliveryMethod: FREE,
      deliveries: [{ boutiqueId: shopId, method: PICKUP, fee: 1 }],
      shippingFee: 0,
    } as never);

    expect(selection.all).toBe(FREE);
    expect([...selection.byShop!.entries()]).toEqual([[shopId, PICKUP]]);
  });

  it("écarte les anciens modes", () => {
    expect(selectionFromBody({ deliveryMethod: "express" }).all).toBeUndefined();
  });
});
