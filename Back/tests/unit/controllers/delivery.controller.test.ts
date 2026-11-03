import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
});

vi.mock("../../../src/models/cart.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Cart: mockModel() };
});

// Livraison offerte : promotions des boutiques lues par le moteur de prix.
vi.mock("../../../src/models/promotion.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/promotion.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Promotion: mockModel() };
});

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import { Shop } from "../../../src/models/boutique.model.js";
import { Product, productBoutique } from "../../../src/models/product.model.js";
import { Cart } from "../../../src/models/cart.model.js";
import { DeliveryMethod } from "../../../src/models/delivery.model.js";
import { Promotion, PromotionScope, PromotionType } from "../../../src/models/promotion.model.js";
import {
  getDeliveryQuote,
  getShopDelivery,
  updateShopDelivery,
} from "../../../src/controllers/delivery.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse } from "../../helpers/express.mock.js";
import {
  makeCart,
  makeCartItem,
  makeProduct,
  makeProductBoutique,
  makeShop,
  makeShopPromotion,
  oid,
} from "../../helpers/factories.js";

const { PICKUP, FREE, FLAT_RATE } = DeliveryMethod;

const ShopMock = Shop as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const CartMock = Cart as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;

const ownerId = oid();
const OWNER = { id: ownerId.toString(), entityType: "shop" };
const OTHER_SELLER = { id: oid().toString(), entityType: "shop" };
const ADMIN = { id: oid().toString(), entityType: "admin" };

beforeEach(() => {
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  ShopMock.findById.mockReturnValue(mockQuery(null));
  ShopMock.find.mockReturnValue(mockQuery([]));
  PbMock.find.mockReturnValue(mockQuery([]));
  PbMock.countDocuments.mockReturnValue(mockQuery(0));
  ProductMock.find.mockReturnValue(mockQuery([]));
  CartMock.findOne.mockReturnValue(mockQuery(null));
  PromotionMock.find.mockReturnValue(mockQuery([]));
});

const update = async (shop: ReturnType<typeof makeShop>, body: Record<string, unknown>, user = OWNER) => {
  const res = mockResponse();
  await updateShopDelivery(mockRequest({ params: { id: shop._id.toString() }, body, user }), res);
  return res;
};

// ─────────────────────────────────────────────
describe("getShopDelivery", () => {
  it("renvoie les réglages, leurs frais et leur portée", async () => {
    const shop = makeShop({ delivery: { modes: [FLAT_RATE, PICKUP], flatRateFee: 30_000 } });
    ShopMock.findById.mockReturnValue(mockQuery(shop));
    // 12 offres dont 3 personnalisées.
    PbMock.countDocuments.mockImplementation((filter: Record<string, unknown>) =>
      mockQuery("delivery.useShopSettings" in filter ? 3 : 12)
    );
    const res = mockResponse();

    await getShopDelivery(mockRequest({ params: { id: shop._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      boutiqueId: shop._id.toString(),
      adresse: shop.adresse,
      modes: [PICKUP, FLAT_RATE],
      flatRateFee: 30_000,
      options: [
        { method: PICKUP, fee: 0 },
        { method: FLAT_RATE, fee: 30_000 },
      ],
      currency: "GNF",
      inheritingProducts: 9,
      customProducts: 3,
    });
  });

  it("donne ses réglages par défaut à une boutique antérieure à la migration", async () => {
    const legacy = makeShop();
    delete (legacy as any).delivery;
    ShopMock.findById.mockReturnValue(mockQuery(legacy));
    const res = mockResponse();

    await getShopDelivery(mockRequest({ params: { id: legacy._id.toString() } }), res);

    expect(res.body.data.modes).toEqual([PICKUP, FLAT_RATE]);
    expect(res.body.data.flatRateFee).toBe(25_000);
  });

  it("renvoie 404 quand la boutique est introuvable", async () => {
    const res = mockResponse();

    await getShopDelivery(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────
describe("updateShopDelivery", () => {
  let shop: ReturnType<typeof makeShop>;

  beforeEach(() => {
    shop = makeShop({ ownerId, adresse: "Matam, Conakry", delivery: { modes: [PICKUP], flatRateFee: null } });
    ShopMock.findById.mockReturnValue(mockQuery(shop));
  });

  it("active le retrait en boutique", async () => {
    const res = await update(shop, { modes: [PICKUP] });

    expect(res.statusCode).toBe(200);
    expect(shop.delivery).toEqual({ modes: [PICKUP], flatRateFee: null });
    expect(shop.save).toHaveBeenCalled();
  });

  it("active la livraison gratuite", async () => {
    const res = await update(shop, { modes: [FREE] });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.options).toEqual([{ method: FREE, fee: 0 }]);
  });

  it("active la livraison à prix fixe avec un tarif valide", async () => {
    const res = await update(shop, { modes: [FLAT_RATE, PICKUP], flatRateFee: 40_000 });

    expect(res.statusCode).toBe(200);
    expect(shop.delivery).toEqual({ modes: [PICKUP, FLAT_RATE], flatRateFee: 40_000 });
    expect(res.body.message).toBe("Livraison de la boutique mise à jour.");
  });

  it("n'enregistre pas de tarif quand le prix fixe est désactivé", async () => {
    await update(shop, { modes: [FREE], flatRateFee: 40_000 });

    expect(shop.delivery.flatRateFee).toBeNull();
  });

  it.each([
    [{ modes: [FLAT_RATE] }, "Le tarif de la livraison à prix fixe est requis quand ce mode est activé."],
    [{ modes: [FLAT_RATE], flatRateFee: 0 }, /supérieur à 0/],
    [{ modes: [] }, /au moins un mode/],
  ])("refuse %j", async (body, message) => {
    const res = await update(shop, body);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(message);
    expect(shop.save).not.toHaveBeenCalled();
  });

  it("refuse le retrait pour une boutique sans adresse", async () => {
    shop.adresse = undefined as unknown as string;

    const res = await update(shop, { modes: [PICKUP] });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/adresse de la boutique/);
  });

  it("interdit à un vendeur de modifier la boutique d'un autre", async () => {
    const res = await update(shop, { modes: [FREE] }, OTHER_SELLER);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Vous ne pouvez gérer que vos propres boutiques.");
    expect(shop.save).not.toHaveBeenCalled();
    expect(shop.delivery).toEqual({ modes: [PICKUP], flatRateFee: null });
  });

  it("refuse une requête sans identité", async () => {
    const res = mockResponse();

    await updateShopDelivery(mockRequest({ params: { id: shop._id.toString() }, body: { modes: [FREE] } }), res);

    expect(res.statusCode).toBe(403);
  });

  it("autorise un administrateur", async () => {
    const res = await update(shop, { modes: [FREE] }, ADMIN);

    expect(res.statusCode).toBe(200);
  });

  it("renvoie 422 quand la validation de forme échoue", async () => {
    vi.mocked(validationResult).mockReturnValueOnce({
      isEmpty: () => false,
      array: () => [{ msg: "Le tarif de livraison doit être un nombre entier positif de GNF." }],
    } as any);

    const res = await update(shop, { modes: [FLAT_RATE], flatRateFee: -5 });

    expect(res.statusCode).toBe(422);
    expect(shop.save).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand la boutique est introuvable", async () => {
    ShopMock.findById.mockReturnValue(mockQuery(null));

    const res = await update(shop, { modes: [FREE] });

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────
describe("getDeliveryQuote", () => {
  const userId = oid().toString();
  const quote = async (body: Record<string, unknown> = {}) => {
    const res = mockResponse();
    await getDeliveryQuote(mockRequest({ params: { userId }, body }), res);
    return res;
  };

  it("renvoie un devis vide pour un panier vide", async () => {
    const res = await quote();

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ groups: [], shippingFee: 0, ready: false, total: 0 });
  });

  it("calcule une livraison par boutique et le total côté serveur", async () => {
    const depot = makeShop({ nom: "Dépôt", delivery: { modes: [PICKUP, FLAT_RATE], flatRateFee: 50_000 } });
    const coloris = makeShop({ nom: "Coloris", delivery: { modes: [FREE], flatRateFee: null } });
    const ciment = makeProduct({ name: "Ciment" });
    const peinture = makeProduct({ name: "Peinture" });
    const pbCiment = makeProductBoutique({ boutiqueId: depot._id, productId: ciment._id, price: 9_000, discountPrice: null });
    const pbPeinture = makeProductBoutique({ boutiqueId: coloris._id, productId: peinture._id, price: 20_000, discountPrice: null });
    CartMock.findOne.mockReturnValue(
      mockQuery(
        makeCart({
          items: [
            makeCartItem({ productBoutiqueId: pbCiment._id, quantity: 40 }),
            makeCartItem({ productBoutiqueId: pbPeinture._id, quantity: 2 }),
          ],
          amount: 400_000,
        })
      )
    );
    PbMock.find.mockReturnValue(mockQuery([pbCiment, pbPeinture]));
    ProductMock.find.mockReturnValue(mockQuery([ciment, peinture]));
    ShopMock.find.mockReturnValue(mockQuery([depot, coloris]));

    const res = await quote({ deliveries: [{ boutiqueId: depot._id.toString(), method: FLAT_RATE }] });

    const data = res.body.data;
    expect(data.groups.map((g: any) => [g.boutiqueNom, g.selectedMethod, g.fee])).toEqual([
      ["Dépôt", FLAT_RATE, 50_000],
      // Seul mode proposé : retenu d'office.
      ["Coloris", FREE, 0],
    ]);
    expect(data.groups[0].items).toEqual([
      { productBoutiqueId: pbCiment._id.toString(), productName: "Ciment", quantity: 40 },
    ]);
    expect(data.shippingFee).toBe(50_000);
    expect(data.subtotal).toBe(400_000);
    expect(data.total).toBe(450_000);
    expect(data.ready).toBe(true);
  });

  /** Un panier d'une boutique livrée à prix fixe (25 000). */
  const oneShop = (opts: { price: number; discountPrice?: number | null; quantity: number; amount?: number }) => {
    const shop = makeShop({ nom: "Dépôt", delivery: { modes: [FLAT_RATE], flatRateFee: 25_000 } });
    const pb = makeProductBoutique({ boutiqueId: shop._id, price: opts.price, discountPrice: opts.discountPrice ?? null });
    CartMock.findOne.mockReturnValue(
      mockQuery(
        makeCart({
          items: [makeCartItem({ productBoutiqueId: pb._id, quantity: opts.quantity, price: opts.price })],
          amount: opts.amount ?? opts.price * opts.quantity,
        })
      )
    );
    PbMock.find.mockReturnValue(mockQuery([pb]));
    ShopMock.find.mockReturnValue(mockQuery([shop]));
    return { shop, pb };
  };

  const freeFrom = (boutiqueId: unknown, minAmount: number) =>
    makeShopPromotion({
      type: PromotionType.FREE_SHIPPING,
      scope: PromotionScope.CART,
      nom: "Livraison offerte dès 100 000",
      minAmount,
      boutiqueId,
      productBoutiqueIds: [],
      startDate: new Date("2000-01-01"),
      endDate: new Date("2999-01-01"),
    });

  it("calcule le sous-total aux prix du moment, pas au montant enregistré du panier", async () => {
    // Le panier a gardé 10 000 ; une remise a fait passer l'offre à 8 000.
    oneShop({ price: 10_000, discountPrice: 8_000, quantity: 3, amount: 30_000 });

    const res = await quote();

    expect(res.body.data.subtotal).toBe(24_000);
    expect(res.body.data.total).toBe(49_000);
  });

  it("offre la livraison quand la part de la boutique atteint le seuil", async () => {
    const { shop } = oneShop({ price: 50_000, quantity: 2 });
    PromotionMock.find.mockReturnValue(mockQuery([freeFrom(shop._id, 100_000)]));

    const res = await quote();

    const group = res.body.data.groups[0];
    expect(group.fee).toBe(0);
    expect(group.freeShipping).toEqual({ threshold: 100_000, applied: true, remaining: 0, label: "Livraison offerte dès 100 000" });
    expect(res.body.data.shippingFee).toBe(0);
    expect(res.body.data.total).toBe(100_000);
    const filter = PromotionMock.find.mock.calls[0]![0];
    expect(filter).toMatchObject({ type: PromotionType.FREE_SHIPPING, actif: true });
    expect(filter.boutiqueId.$in.map(String)).toEqual([String(shop._id)]);
  });

  it("dit ce qu'il reste à ajouter sous le seuil, et garde les frais", async () => {
    const { shop } = oneShop({ price: 30_000, quantity: 2 });
    PromotionMock.find.mockReturnValue(mockQuery([freeFrom(shop._id, 100_000)]));

    const res = await quote();

    const group = res.body.data.groups[0];
    expect(group.fee).toBe(25_000);
    expect(group.freeShipping).toMatchObject({ applied: false, remaining: 40_000 });
    expect(res.body.data.total).toBe(85_000);
  });

  it("retient le seuil le plus bas quand la boutique en a lancé deux", async () => {
    const { shop } = oneShop({ price: 30_000, quantity: 2 });
    PromotionMock.find.mockReturnValue(mockQuery([freeFrom(shop._id, 100_000), freeFrom(shop._id, 50_000)]));

    const res = await quote();

    expect(res.body.data.groups[0].freeShipping).toMatchObject({ threshold: 50_000, applied: true });
  });

  it("ignore une livraison offerte en pause", async () => {
    const { shop } = oneShop({ price: 60_000, quantity: 2 });
    PromotionMock.find.mockReturnValue(mockQuery([freeFrom(shop._id, 100_000)].map((promo) => Object.assign(promo, { status: "paused" }))));

    const res = await quote();

    expect(res.body.data.groups[0].fee).toBe(25_000);
    expect(res.body.data.groups[0].freeShipping).toBeUndefined();
  });

  it("ignore une offre retirée de la vente", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(makeCart({ items: [makeCartItem()], amount: 1_000 })));

    const res = await quote();

    expect(res.body.data.groups).toEqual([]);
  });
});
