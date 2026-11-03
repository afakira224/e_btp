import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../../src/models/promotion.model.js", async () => {
  // Seul le modèle Mongoose est simulé : enums et constantes restent réels.
  const actual = await import("../../../src/models/promotion.model.js");
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Promotion: mockModel() };
});

vi.mock("../../../src/models/cart.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Cart: mockModel() };
});

// Prix du moment des offres du panier, boutique d'un code, codes déjà utilisés par le client.
vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
});

vi.mock("../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../src/models/order.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/order.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Order: mockModel() };
});

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import {
  DiscountType,
  Promotion,
  PromotionScope,
  PromotionStatus,
  PromotionType,
} from "../../../src/models/promotion.model.js";
import { Cart } from "../../../src/models/cart.model.js";
import { productBoutique } from "../../../src/models/product.model.js";
import { Shop } from "../../../src/models/boutique.model.js";
import { Order } from "../../../src/models/order.model.js";
import {
  applyCoupon,
  createPromotion,
  deletePromotion,
  getActiveFlashSales,
  getPromotionById,
  getPromotions,
  updatePromotion,
} from "../../../src/controllers/promotion.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import {
  makeCart,
  makeCartItem,
  makeProductBoutique,
  makePromotion,
  makeShop,
  makeShopPromotion,
  oid,
} from "../../helpers/factories.js";

const PromotionMock = Promotion as unknown as Record<string, any>;
const CartMock = Cart as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const ShopMock = Shop as unknown as Record<string, any>;
const OrderMock = Order as unknown as Record<string, any>;

/**
 * Panier dont chaque ligne pointe sur une offre au même prix (aucune
 * promotion depuis l'ajout) ; les offres sont rendues par productBoutique.find.
 */
const cartOf = (lines: { price: number; quantity: number; boutiqueId?: unknown; discountPrice?: number | null }[]) => {
  const offers = lines.map((line) =>
    makeProductBoutique({ price: line.price, discountPrice: line.discountPrice ?? null, ...(line.boutiqueId ? { boutiqueId: line.boutiqueId } : {}) })
  );
  const cart = makeCart({
    items: lines.map((line, index) => makeCartItem({ productBoutiqueId: offers[index]!._id, quantity: line.quantity, price: line.price })),
    amount: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
  });
  CartMock.findOne.mockReturnValue(mockQuery(cart));
  PbMock.find.mockReturnValue(mockQuery(offers));
  return { cart, offers };
};

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

/** Corps valide pour la création d'un coupon panier. */
const validBody = () => ({
  nom: "Promo rentrée",
  type: PromotionType.COUPON,
  scope: PromotionScope.CART,
  discountType: DiscountType.PERCENTAGE,
  discountValue: 10,
  code: "rentree10",
  startDate: "2026-09-01T00:00:00.000Z",
  endDate: "2026-09-30T00:00:00.000Z",
});

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  PromotionMock.find.mockReturnValue(mockQuery([]));
  PromotionMock.findOne.mockReturnValue(mockQuery(null));
  PromotionMock.findById.mockReturnValue(mockQuery(null));
  PromotionMock.countDocuments.mockReturnValue(mockQuery(0));
  PromotionMock.create.mockImplementation(async (docs: any[]) => [makePromotion(docs[0])]);
  CartMock.findOne.mockReturnValue(mockQuery(null));
  PbMock.find.mockReturnValue(mockQuery([]));
  ShopMock.find.mockReturnValue(mockQuery([]));
  ShopMock.findById.mockReturnValue(mockQuery(null));
  OrderMock.countDocuments.mockReturnValue(mockQuery(0));
});

// ─────────────────────────────────────────────
describe("createPromotion", () => {
  it("renvoie 422 quand la validation échoue", async () => {
    failValidation(["Le nom de la promotion est requis."]);
    const res = mockResponse();

    await createPromotion(mockRequest(), res);

    expect(res.statusCode).toBe(422);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("renvoie 201 pour une promotion valide", async () => {
    const res = mockResponse();

    await createPromotion(mockRequest({ body: validBody() }), res);

    expect(res.statusCode).toBe(201);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("normalise le code en majuscules", async () => {
    await createPromotion(mockRequest({ body: validBody() }), mockResponse());

    expect(PromotionMock.create.mock.calls[0]![0][0].code).toBe("RENTREE10");
  });

  it("refuse une date de fin antérieure ou égale à la date de début", async () => {
    const res = mockResponse();

    await createPromotion(
      mockRequest({
        body: { ...validBody(), startDate: "2026-09-30T00:00:00.000Z", endDate: "2026-09-01T00:00:00.000Z" },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("La date de fin doit être postérieure à la date de début.");
    expect(PromotionMock.create).not.toHaveBeenCalled();
  });

  it("refuse un pourcentage supérieur à 100", async () => {
    const res = mockResponse();

    await createPromotion(mockRequest({ body: { ...validBody(), discountValue: 120 } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Un pourcentage de réduction ne peut pas dépasser 100.");
  });

  it("autorise un montant fixe supérieur à 100", async () => {
    const res = mockResponse();

    await createPromotion(
      mockRequest({
        body: { ...validBody(), discountType: DiscountType.FIXED, discountValue: 50_000 },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
  });

  it("exige un code pour une promotion de type coupon", async () => {
    const body: Record<string, unknown> = validBody();
    delete body.code;
    const res = mockResponse();

    await createPromotion(mockRequest({ body }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Un code est requis pour une promotion de type coupon.");
  });

  it("n'exige pas de code pour une vente flash", async () => {
    const body: Record<string, unknown> = { ...validBody(), type: PromotionType.FLASH_SALE };
    delete body.code;
    const res = mockResponse();

    await createPromotion(mockRequest({ body }), res);

    expect(res.statusCode).toBe(201);
    expect(PromotionMock.create.mock.calls[0]![0][0].code).toBeNull();
  });

  it("exige au moins un produit ciblé pour une promotion produit", async () => {
    const res = mockResponse();

    await createPromotion(
      mockRequest({ body: { ...validBody(), scope: PromotionScope.PRODUCT_BOUTIQUE } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Au moins un produit en boutique doit être ciblé.");
  });

  it("ignore les produits ciblés quand la cible est le panier", async () => {
    await createPromotion(
      mockRequest({ body: { ...validBody(), productBoutiqueIds: [oid().toString()] } }),
      mockResponse()
    );

    expect(PromotionMock.create.mock.calls[0]![0][0].productBoutiqueIds).toEqual([]);
  });

  it("renvoie 409 quand le code existe déjà", async () => {
    PromotionMock.findOne.mockReturnValue(mockQuery(makePromotion({ code: "RENTREE10" })));
    const res = mockResponse();

    await createPromotion(mockRequest({ body: validBody() }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Ce code promotionnel existe déjà.");
    expect(PromotionMock.create).not.toHaveBeenCalled();
  });

  it("active la promotion par défaut", async () => {
    await createPromotion(mockRequest({ body: validBody() }), mockResponse());

    expect(PromotionMock.create.mock.calls[0]![0][0].actif).toBe(true);
  });

  it("respecte actif: false quand il est fourni", async () => {
    await createPromotion(mockRequest({ body: { ...validBody(), actif: false } }), mockResponse());

    expect(PromotionMock.create.mock.calls[0]![0][0].actif).toBe(false);
  });
});

// ─────────────────────────────────────────────
describe("getPromotions", () => {
  it("pagine avec les valeurs par défaut", async () => {
    const query = mockQuery([]);
    PromotionMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getPromotions(mockRequest(), res);

    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.body.data.page).toBe(1);
  });

  it("filtre par type et par cible", async () => {
    await getPromotions(
      mockRequest({ query: { type: PromotionType.COUPON, scope: PromotionScope.CART } }),
      mockResponse()
    );

    expect(PromotionMock.find).toHaveBeenCalledWith({
      boutiqueId: null,
      type: PromotionType.COUPON,
      scope: PromotionScope.CART,
    });
  });

  it("convertit le filtre actif en booléen", async () => {
    await getPromotions(mockRequest({ query: { actif: "true" } }), mockResponse());
    expect(PromotionMock.find).toHaveBeenLastCalledWith({ boutiqueId: null, actif: true });

    await getPromotions(mockRequest({ query: { actif: "false" } }), mockResponse());
    expect(PromotionMock.find).toHaveBeenLastCalledWith({ boutiqueId: null, actif: false });
  });

  it("ne liste jamais les promotions des boutiques (ni leurs codes)", async () => {
    await getPromotions(mockRequest(), mockResponse());

    expect(PromotionMock.find).toHaveBeenCalledWith({ boutiqueId: null });
    expect(PromotionMock.countDocuments).toHaveBeenCalledWith({ boutiqueId: null });
  });

  it("ne conserve que les promotions actives avec activeNow=true", async () => {
    const active = makePromotion({
      nom: "En cours",
      startDate: new Date("2000-01-01"),
      endDate: new Date("2999-01-01"),
    });
    const expiree = makePromotion({
      nom: "Expirée",
      startDate: new Date("2000-01-01"),
      endDate: new Date("2001-01-01"),
    });
    PromotionMock.find.mockReturnValue(mockQuery([active, expiree]));
    PromotionMock.countDocuments.mockReturnValue(mockQuery(2));
    const res = mockResponse();

    await getPromotions(mockRequest({ query: { activeNow: "true" } }), res);

    expect(res.body.data.promotions).toHaveLength(1);
    expect(res.body.data.promotions[0].nom).toBe("En cours");
    // Le total reste celui de la requête, non filtré côté application.
    expect(res.body.data.total).toBe(2);
  });

  it("calcule le nombre de pages", async () => {
    PromotionMock.countDocuments.mockReturnValue(mockQuery(31));
    const res = mockResponse();

    await getPromotions(mockRequest({ query: { limit: "10" } }), res);

    expect(res.body.data.totalPages).toBe(4);
  });
});

// ─────────────────────────────────────────────
describe("getPromotionById", () => {
  it("renvoie la promotion demandée", async () => {
    const promo = makePromotion({ nom: "Black Friday" });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    const res = mockResponse();

    await getPromotionById(mockRequest({ params: { id: promo._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.nom).toBe("Black Friday");
  });

  it("renvoie 404 quand la promotion est introuvable", async () => {
    PromotionMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getPromotionById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Promotion non trouvée");
  });
});

// ─────────────────────────────────────────────
describe("getPromotionById — promotion de boutique", () => {
  it("renvoie 404 pour une promotion de boutique, lue depuis l'espace de sa boutique", async () => {
    PromotionMock.findById.mockReturnValue(mockQuery(makeShopPromotion()));
    const res = mockResponse();

    await getPromotionById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Promotion non trouvée");
  });
});

describe("updatePromotion — promotion de boutique", () => {
  it("refuse en 403 de modifier la promotion d'une boutique", async () => {
    const promo = makeShopPromotion({ nom: "Remise d'octobre" });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    const res = mockResponse();

    await updatePromotion(mockRequest({ params: { id: promo._id.toString() }, body: { nom: "Changée" } }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Une promotion de boutique se gère depuis l'espace de sa boutique.");
    expect(promo.nom).toBe("Remise d'octobre");
    expect(promo.save).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

describe("deletePromotion — promotion de boutique", () => {
  it("refuse en 403 de supprimer la promotion d'une boutique", async () => {
    const promo = makeShopPromotion();
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    const res = mockResponse();

    await deletePromotion(mockRequest({ params: { id: promo._id.toString() } }), res);

    expect(res.statusCode).toBe(403);
    expect(promo.deletedAt).toBeNull();
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

describe("updatePromotion", () => {
  it("renvoie 404 quand la promotion n'existe pas", async () => {
    PromotionMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updatePromotion(mockRequest({ params: { id: oid().toString() }, body: {} }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    const promo = makePromotion({ nom: "Ancien nom", discountValue: 10 });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    const res = mockResponse();

    await updatePromotion(
      mockRequest({ params: { id: promo._id.toString() }, body: { nom: "Nouveau nom" } }),
      res
    );

    expect(promo.nom).toBe("Nouveau nom");
    expect(promo.discountValue).toBe(10);
    expect(promo.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("normalise le nouveau code en majuscules", async () => {
    const promo = makePromotion({ code: "ANCIEN" });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));

    await updatePromotion(
      mockRequest({ params: { id: promo._id.toString() }, body: { code: " nouveau " } }),
      mockResponse()
    );

    expect(promo.code).toBe("NOUVEAU");
  });

  it("renvoie 409 quand le nouveau code appartient à une autre promotion", async () => {
    const promo = makePromotion({ code: "ANCIEN" });
    const id = promo._id.toString();
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    PromotionMock.findOne.mockReturnValue(mockQuery(makePromotion({ code: "DEJAPRIS" })));
    const res = mockResponse();

    await updatePromotion(mockRequest({ params: { id }, body: { code: "dejapris" } }), res);

    expect(PromotionMock.findOne).toHaveBeenCalledWith({
      code: "DEJAPRIS",
      _id: { $ne: id },
    });
    expect(res.statusCode).toBe(409);
    expect(promo.save).not.toHaveBeenCalled();
  });

  it("ne vérifie pas l'unicité quand le code est inchangé", async () => {
    const promo = makePromotion({ code: "RENTREE10" });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));

    await updatePromotion(
      mockRequest({ params: { id: promo._id.toString() }, body: { code: "rentree10" } }),
      mockResponse()
    );

    expect(PromotionMock.findOne).not.toHaveBeenCalled();
  });

  it("refuse un état final dont la date de fin précède la date de début", async () => {
    const promo = makePromotion({
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-30"),
    });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    const res = mockResponse();

    await updatePromotion(
      mockRequest({
        params: { id: promo._id.toString() },
        body: { endDate: new Date("2026-08-01") },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("La date de fin doit être postérieure à la date de début.");
    expect(promo.save).not.toHaveBeenCalled();
  });

  it("refuse un pourcentage final supérieur à 100", async () => {
    const promo = makePromotion({ discountType: DiscountType.PERCENTAGE });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    const res = mockResponse();

    await updatePromotion(
      mockRequest({ params: { id: promo._id.toString() }, body: { discountValue: 150 } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Un pourcentage de réduction ne peut pas dépasser 100.");
  });

  it("refuse de retirer le code d'un coupon", async () => {
    const promo = makePromotion({ type: PromotionType.COUPON, code: "RENTREE10" });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    const res = mockResponse();

    await updatePromotion(
      mockRequest({ params: { id: promo._id.toString() }, body: { code: null } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Un code est requis pour une promotion de type coupon.");
  });

  it("refuse une cible produit sans produit ciblé", async () => {
    const promo = makePromotion({ scope: PromotionScope.CART, productBoutiqueIds: [] });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    const res = mockResponse();

    await updatePromotion(
      mockRequest({
        params: { id: promo._id.toString() },
        body: { scope: PromotionScope.PRODUCT_BOUTIQUE },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Au moins un produit en boutique doit être ciblé.");
  });
});

// ─────────────────────────────────────────────
describe("deletePromotion", () => {
  it("effectue une suppression logique", async () => {
    const promo = makePromotion();
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    const res = mockResponse();

    await deletePromotion(mockRequest({ params: { id: promo._id.toString() } }), res);

    expect(promo.deletedAt).toBeInstanceOf(Date);
    expect(promo.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("renvoie 404 quand la promotion est introuvable", async () => {
    PromotionMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deletePromotion(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("applyCoupon", () => {
  const activePromo = (over: Record<string, unknown> = {}) =>
    makePromotion({
      code: "RENTREE10",
      startDate: new Date("2000-01-01"),
      endDate: new Date("2999-01-01"),
      ...over,
    });

  it("renvoie 404 quand le coupon n'existe pas", async () => {
    PromotionMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "INCONNU" } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Coupon introuvable");
  });

  it("recherche le coupon en majuscules et sans espaces", async () => {
    PromotionMock.findOne.mockReturnValue(mockQuery(null));

    await applyCoupon(
      mockRequest({ body: { userId: oid().toString(), code: " rentree10 " } }),
      mockResponse()
    );

    expect(PromotionMock.findOne).toHaveBeenCalledWith({ code: "RENTREE10" });
  });

  it("renvoie 400 quand le coupon est en pause", async () => {
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo({ status: PromotionStatus.PAUSED })));
    cartOf([{ quantity: 1, price: 10_000 }]);
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Ce coupon n'est pas valide (inactif, expiré ou épuisé).");
  });

  it("renvoie 400 quand le coupon est expiré", async () => {
    PromotionMock.findOne.mockReturnValue(
      mockQuery(activePromo({ endDate: new Date("2001-01-01") }))
    );
    cartOf([{ quantity: 1, price: 10_000 }]);
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Ce coupon n'est pas valide (inactif, expiré ou épuisé).");
  });

  it("renvoie 400 quand la limite d'utilisation est atteinte", async () => {
    PromotionMock.findOne.mockReturnValue(
      mockQuery(activePromo({ usageLimit: 2, usedCount: 2 }))
    );
    cartOf([{ quantity: 1, price: 10_000 }]);
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Ce coupon n'est pas valide (inactif, expiré ou épuisé).");
  });

  it("renvoie 400 quand le panier est vide", async () => {
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo()));
    CartMock.findOne.mockReturnValue(mockQuery(makeCart({ items: [] })));
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Le panier est vide.");
  });

  it("renvoie 400 quand le montant minimum n'est pas atteint", async () => {
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo({ minAmount: 50_000 })));
    cartOf([{ quantity: 1, price: 10_000 }]);
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Montant minimum non atteint pour ce coupon (requis : 50000).");
  });

  it("calcule la réduction sur un panier éligible sans modifier le panier", async () => {
    const { cart } = cartOf([{ quantity: 2, price: 10_000 }]);
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo({ discountValue: 10 })));
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalBefore).toBe(20_000);
    expect(res.body.data.discountAmount).toBe(2_000);
    expect(res.body.data.totalAfter).toBe(18_000);
    expect(res.body.data.promotion.code).toBe("RENTREE10");
    expect(cart.save).not.toHaveBeenCalled(); // le panier n'est jamais modifié ici
  });

  it("plafonne la réduction à maxDiscount", async () => {
    PromotionMock.findOne.mockReturnValue(
      mockQuery(activePromo({ discountValue: 50, maxDiscount: 5_000 }))
    );
    cartOf([{ quantity: 1, price: 20_000 }]);
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.body.data.discountAmount).toBe(5_000);
    expect(res.body.data.totalAfter).toBe(15_000);
  });

  it("renvoie 400 quand aucun article n'est éligible", async () => {
    PromotionMock.findOne.mockReturnValue(
      mockQuery(
        activePromo({
          scope: PromotionScope.PRODUCT_BOUTIQUE,
          productBoutiqueIds: [oid()], // ne correspond à aucune ligne du panier
        })
      )
    );
    cartOf([{ quantity: 1, price: 10_000 }]);
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Aucun article de la commande n'est éligible à ce coupon.");
  });

  it("applique la réduction aux seules lignes ciblées", async () => {
    const { offers } = cartOf([
      { quantity: 1, price: 10_000 },
      { quantity: 1, price: 30_000 },
    ]);
    PromotionMock.findOne.mockReturnValue(
      mockQuery(
        activePromo({
          scope: PromotionScope.PRODUCT_BOUTIQUE,
          productBoutiqueIds: [offers[0]!._id],
          discountValue: 20,
        })
      )
    );
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.body.data.discountAmount).toBe(2_000); // 20 % de 10 000
    expect(res.body.data.totalAfter).toBe(38_000);
  });

  it("calcule la réduction aux prix du moment, pas au montant enregistré du panier", async () => {
    // Une remise a fait passer l'offre de 10 000 à 8 000 depuis l'ajout.
    const { cart } = cartOf([{ quantity: 2, price: 10_000, discountPrice: 8_000 }]);
    cart.amount = 20_000;
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo({ discountValue: 10 })));
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.body.data.totalBefore).toBe(16_000);
    expect(res.body.data.discountAmount).toBe(1_600);
  });

  it("ne fait porter un code de boutique que sur ses articles, et nomme la boutique", async () => {
    const coloris = makeShop({ nom: "Coloris" });
    cartOf([
      { quantity: 1, price: 30_000 },
      { quantity: 1, price: 10_000, boutiqueId: coloris._id },
    ]);
    PromotionMock.findOne.mockReturnValue(
      mockQuery(activePromo({ boutiqueId: coloris._id, discountValue: 10, perCustomerLimit: 1 }))
    );
    ShopMock.findById.mockReturnValue(mockQuery(coloris));
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.discountAmount).toBe(1_000);
    expect(res.body.data.totalBefore).toBe(40_000);
    expect(res.body.data.totalAfter).toBe(39_000);
    expect(res.body.data.boutique).toEqual({ id: String(coloris._id), nom: "Coloris" });
  });

  it("refuse un code de boutique quand le panier n'a aucun de ses articles", async () => {
    cartOf([{ quantity: 1, price: 30_000 }]);
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo({ boutiqueId: oid() })));
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Ce code ne vaut que chez la boutique qui l'a créé : ajoutez un de ses articles.");
  });

  it("exclut les articles déjà en promotion d'un code non cumulable", async () => {
    const shopId = oid();
    cartOf([
      { quantity: 1, price: 10_000, discountPrice: 9_000, boutiqueId: shopId },
      { quantity: 1, price: 20_000, boutiqueId: shopId },
    ]);
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo({ boutiqueId: shopId, discountValue: 10, stackable: false })));
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.body.data.discountAmount).toBe(2_000); // 10 % des seuls 20 000 sans promotion
  });

  it("refuse un code déjà utilisé autant de fois que permis par client", async () => {
    const userId = oid().toString();
    cartOf([{ quantity: 1, price: 30_000 }]);
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo({ perCustomerLimit: 1 })));
    OrderMock.countDocuments.mockReturnValueOnce(mockQuery(1));
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId, code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Vous avez déjà utilisé ce code.");
    expect(String(OrderMock.countDocuments.mock.calls[0]![0].userId)).toBe(userId);
  });

  it("ne compte pas les utilisations d'un code sans limite par client", async () => {
    cartOf([{ quantity: 1, price: 30_000 }]);
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo()));

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), mockResponse());

    expect(OrderMock.countDocuments).not.toHaveBeenCalled();
  });

  it("renvoie 500 en cas d'erreur", async () => {
    PromotionMock.findOne.mockImplementation(() => {
      throw new Error("base indisponible");
    });
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getActiveFlashSales", () => {
  it("ne renvoie que les ventes flash réellement actives", async () => {
    const enCours = makePromotion({
      nom: "Flash en cours",
      type: PromotionType.FLASH_SALE,
      startDate: new Date("2000-01-01"),
      endDate: new Date("2999-01-01"),
    });
    const aVenir = makePromotion({
      nom: "Flash à venir",
      type: PromotionType.FLASH_SALE,
      startDate: new Date("2999-01-01"),
      endDate: new Date("2999-02-01"),
    });
    const query = mockQuery([enCours, aVenir]);
    PromotionMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getActiveFlashSales(mockRequest(), res);

    const filter = PromotionMock.find.mock.calls[0]![0];
    expect(filter).toMatchObject({
      type: PromotionType.FLASH_SALE,
      actif: true,
      status: { $nin: [PromotionStatus.DRAFT, PromotionStatus.PAUSED, PromotionStatus.STOPPED] },
    });
    expect(filter.startDate.$lte).toBeInstanceOf(Date);
    expect(filter.endDate.$gte).toBeInstanceOf(Date);
    expect(query.sort).toHaveBeenCalledWith({ endDate: 1 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].nom).toBe("Flash en cours");
  });

  it("montre la vente flash d'une boutique avec son nom et ce qu'il en reste, jamais un code", async () => {
    const shop = makeShop({ nom: "Coloris" });
    const flash = makeShopPromotion({
      nom: "Flash peinture",
      type: PromotionType.FLASH_SALE,
      boutiqueId: shop._id,
      code: "SECRET",
      flashQuantity: 10,
      flashSold: 7,
      startDate: new Date("2000-01-01"),
      endDate: new Date("2999-01-01"),
    });
    PromotionMock.find.mockReturnValue(mockQuery([flash]));
    ShopMock.find.mockReturnValue(mockQuery([shop]));
    const res = mockResponse();

    await getActiveFlashSales(mockRequest(), res);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      nom: "Flash peinture",
      code: null,
      boutique: { id: String(shop._id), nom: "Coloris" },
      flashLeft: 3,
    });
  });

  it("écarte une vente flash dont toute la quantité est vendue", async () => {
    const flash = makeShopPromotion({
      type: PromotionType.FLASH_SALE,
      flashQuantity: 5,
      flashSold: 5,
      startDate: new Date("2000-01-01"),
      endDate: new Date("2999-01-01"),
    });
    PromotionMock.find.mockReturnValue(mockQuery([flash]));

    const res = mockResponse();
    await getActiveFlashSales(mockRequest(), res);

    expect(res.body.data).toEqual([]);
  });

  it("n'ajoute ni boutique ni reste à une vente flash de la plateforme sans quantité", async () => {
    PromotionMock.find.mockReturnValue(
      mockQuery([makePromotion({ type: PromotionType.FLASH_SALE, startDate: new Date("2000-01-01"), endDate: new Date("2999-01-01") })])
    );
    const res = mockResponse();

    await getActiveFlashSales(mockRequest(), res);

    expect(res.body.data[0]).not.toHaveProperty("boutique");
    expect(res.body.data[0]).not.toHaveProperty("flashLeft");
    expect(res.body.data[0].code).toBeNull();
  });

  it("renvoie une liste vide quand aucune vente flash n'est active", async () => {
    PromotionMock.find.mockReturnValue(mockQuery([]));
    const res = mockResponse();

    await getActiveFlashSales(mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("renvoie 500 en cas d'erreur", async () => {
    PromotionMock.find.mockImplementation(() => {
      throw new Error("panne");
    });
    const res = mockResponse();

    await getActiveFlashSales(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
//  Régression corrigée (promotion.controller.ts, createPromotion / updatePromotion /
//  deletePromotion) : une remise ou une vente flash de la plateforme change le
//  prix au checkout (priceLines lit les promotions en vigueur), mais aucune de
//  ces écritures n'appelle recomputeForPromotion. Le prix affiché des offres
//  (discountPrice, promo) reste celui d'avant jusqu'à un passage de date ou un
//  redémarrage : le panier montre un prix, le checkout en facture un autre
//  (409 après une suppression). Ces tests gardent le
// correctif.
// ─────────────────────────────────────────────
describe("régressions — prix des offres après une écriture de l'administration", () => {
  it("recalcule le prix des offres visées par une vente flash de la plateforme créée en cours", async () => {
    const offerId = oid().toString();

    await createPromotion(
      mockRequest({
        body: {
          nom: "Flash de la plateforme",
          type: PromotionType.FLASH_SALE,
          scope: PromotionScope.PRODUCT_BOUTIQUE,
          discountValue: 30,
          startDate: new Date(Date.now() - 3600_000).toISOString(),
          endDate: new Date(Date.now() + 3600_000).toISOString(),
          productBoutiqueIds: [offerId],
        },
      }),
      mockResponse()
    );

    expect(PbMock.find).toHaveBeenCalledWith(expect.objectContaining({ _id: { $in: [expect.anything()] } }));
  });

  it("rend leur prix aux offres d'une vente flash de la plateforme supprimée", async () => {
    const promo = makePromotion({ type: PromotionType.FLASH_SALE, scope: PromotionScope.PRODUCT_BOUTIQUE, productBoutiqueIds: [oid()], code: null });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));

    await deletePromotion(mockRequest({ params: { id: promo._id.toString() } }), mockResponse());

    expect(PbMock.find).toHaveBeenCalled();
  });
});
