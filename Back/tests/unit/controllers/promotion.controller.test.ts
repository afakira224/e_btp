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
  PromotionType,
} from "../../../src/models/promotion.model.js";
import { Cart } from "../../../src/models/cart.model.js";
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
import { makeCart, makeCartItem, makePromotion, oid } from "../../helpers/factories.js";

const PromotionMock = Promotion as unknown as Record<string, any>;
const CartMock = Cart as unknown as Record<string, any>;

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
      type: PromotionType.COUPON,
      scope: PromotionScope.CART,
    });
  });

  it("convertit le filtre actif en booléen", async () => {
    await getPromotions(mockRequest({ query: { actif: "true" } }), mockResponse());
    expect(PromotionMock.find).toHaveBeenLastCalledWith({ actif: true });

    await getPromotions(mockRequest({ query: { actif: "false" } }), mockResponse());
    expect(PromotionMock.find).toHaveBeenLastCalledWith({ actif: false });
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

  it("renvoie 400 quand le coupon est expiré", async () => {
    PromotionMock.findOne.mockReturnValue(
      mockQuery(activePromo({ endDate: new Date("2001-01-01") }))
    );
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("n'est pas valide");
  });

  it("renvoie 400 quand la limite d'utilisation est atteinte", async () => {
    PromotionMock.findOne.mockReturnValue(
      mockQuery(activePromo({ usageLimit: 2, usedCount: 2 }))
    );
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
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
    CartMock.findOne.mockReturnValue(
      mockQuery(makeCart({ items: [makeCartItem({ quantity: 1, price: 10_000 })], amount: 10_000 }))
    );
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Montant minimum non atteint pour ce coupon (requis : 50000).");
  });

  it("calcule la réduction sur un panier éligible sans modifier le panier", async () => {
    const cart = makeCart({
      items: [makeCartItem({ quantity: 2, price: 10_000 })],
      amount: 20_000,
    });
    PromotionMock.findOne.mockReturnValue(mockQuery(activePromo({ discountValue: 10 })));
    CartMock.findOne.mockReturnValue(mockQuery(cart));
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
    CartMock.findOne.mockReturnValue(
      mockQuery(makeCart({ items: [makeCartItem({ quantity: 1, price: 20_000 })], amount: 20_000 }))
    );
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
    CartMock.findOne.mockReturnValue(
      mockQuery(makeCart({ items: [makeCartItem({ quantity: 1, price: 10_000 })], amount: 10_000 }))
    );
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Aucun article du panier n'est éligible à ce coupon.");
  });

  it("applique la réduction aux seules lignes ciblées", async () => {
    const cible = makeCartItem({ quantity: 1, price: 10_000 });
    const autre = makeCartItem({ quantity: 1, price: 30_000 });
    PromotionMock.findOne.mockReturnValue(
      mockQuery(
        activePromo({
          scope: PromotionScope.PRODUCT_BOUTIQUE,
          productBoutiqueIds: [cible.productBoutiqueId],
          discountValue: 20,
        })
      )
    );
    CartMock.findOne.mockReturnValue(mockQuery(makeCart({ items: [cible, autre], amount: 40_000 })));
    const res = mockResponse();

    await applyCoupon(mockRequest({ body: { userId: oid().toString(), code: "RENTREE10" } }), res);

    expect(res.body.data.discountAmount).toBe(2_000); // 20 % de 10 000
    expect(res.body.data.totalAfter).toBe(38_000);
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

    expect(PromotionMock.find).toHaveBeenCalledWith({
      type: PromotionType.FLASH_SALE,
      actif: true,
    });
    expect(query.sort).toHaveBeenCalledWith({ endDate: 1 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].nom).toBe("Flash en cours");
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
