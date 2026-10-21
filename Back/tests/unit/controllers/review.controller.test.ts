import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../../src/models/review.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Review: mockModel() };
});

vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
});

vi.mock("../../../src/models/user.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { User: mockModel() };
});

vi.mock("../../../src/models/order.model.js", async () => {
  // Seul le modèle Mongoose est simulé : enums et constantes restent réels.
  const actual = await import("../../../src/models/order.model.js");
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
import { Review } from "../../../src/models/review.model.js";
import { productBoutique } from "../../../src/models/product.model.js";
import { User } from "../../../src/models/user.model.js";
import { Order, OrderStatus } from "../../../src/models/order.model.js";
import {
  createReview,
  deleteReview,
  getReviewById,
  getReviewSummary,
  getReviews,
  updateReview,
} from "../../../src/controllers/review.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import {
  makeOrder,
  makeProductBoutique,
  makeReview,
  makeUser,
  oid,
} from "../../helpers/factories.js";

const ReviewMock = Review as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;
const OrderMock = Order as unknown as Record<string, any>;

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  UserMock.findById.mockReturnValue(mockQuery(makeUser()));
  UserMock.find.mockReturnValue(mockQuery([]));
  PbMock.findById.mockReturnValue(mockQuery(makeProductBoutique()));
  ReviewMock.find.mockReturnValue(mockQuery([]));
  ReviewMock.findOne.mockReturnValue(mockQuery(null));
  ReviewMock.findById.mockReturnValue(mockQuery(null));
  ReviewMock.countDocuments.mockReturnValue(mockQuery(0));
  ReviewMock.create.mockImplementation(async (docs: any[]) => [makeReview(docs[0])]);
  OrderMock.findOne.mockReturnValue(mockQuery(null));
});

// ─────────────────────────────────────────────
describe("createReview", () => {
  const body = () => ({
    userId: oid().toString(),
    productBoutiqueId: oid().toString(),
    rating: 4,
    comment: "Bon produit",
  });

  it("renvoie 422 et annule la transaction quand la validation échoue", async () => {
    failValidation(["La note est requise."]);
    const res = mockResponse();

    await createReview(mockRequest(), res);

    expect(res.statusCode).toBe(422);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(ReviewMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand l'utilisateur est introuvable", async () => {
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createReview(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Utilisateur introuvable");
  });

  it("renvoie 404 quand le produit en boutique est introuvable", async () => {
    PbMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createReview(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Produit en boutique introuvable");
  });

  it("renvoie 409 quand l'utilisateur a déjà noté ce produit", async () => {
    ReviewMock.findOne.mockReturnValue(mockQuery(makeReview()));
    const res = mockResponse();

    await createReview(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toContain("déjà laissé un avis");
    expect(ReviewMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 201 avec l'avis créé", async () => {
    const res = mockResponse();

    await createReview(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.data.rating).toBe(4);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("marque l'achat comme vérifié quand une commande non annulée contient le produit", async () => {
    const b = body();
    OrderMock.findOne.mockReturnValue(mockQuery(makeOrder()));

    await createReview(mockRequest({ body: b }), mockResponse());

    expect(OrderMock.findOne).toHaveBeenCalledWith({
      userId: b.userId,
      "items.productBoutiqueId": b.productBoutiqueId,
      status: { $ne: OrderStatus.CANCELLED },
    });
    expect(ReviewMock.create.mock.calls[0]![0][0].verifiedPurchase).toBe(true);
  });

  it("laisse verifiedPurchase à false sans commande correspondante", async () => {
    OrderMock.findOne.mockReturnValue(mockQuery(null));

    await createReview(mockRequest({ body: body() }), mockResponse());

    expect(ReviewMock.create.mock.calls[0]![0][0].verifiedPurchase).toBe(false);
  });

  it("recalcule la note moyenne du produit après création", async () => {
    const pb = makeProductBoutique({ rating: 0, reviewsCount: 0 });
    PbMock.findById.mockReturnValue(mockQuery(pb));
    ReviewMock.find.mockReturnValue(
      mockQuery([makeReview({ rating: 5 }), makeReview({ rating: 4 }), makeReview({ rating: 4 })])
    );

    await createReview(mockRequest({ body: body() }), mockResponse());

    // (5 + 4 + 4) / 3 = 4.333… → arrondi à une décimale
    expect(pb.rating).toBe(4.3);
    expect(pb.reviewsCount).toBe(3);
    expect(pb.save).toHaveBeenCalledWith({ session });
  });

  it("renvoie 500 et annule la transaction en cas d'erreur", async () => {
    ReviewMock.create.mockRejectedValue(new Error("violation d'index unique"));
    const res = mockResponse();

    await createReview(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(500);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("getReviews", () => {
  it("pagine avec les valeurs par défaut (page 1, 10 par page)", async () => {
    const query = mockQuery([]);
    ReviewMock.find.mockReturnValue(query);
    ReviewMock.countDocuments.mockReturnValue(mockQuery(0));
    const res = mockResponse();

    await getReviews(mockRequest(), res);

    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.body.data.page).toBe(1);
  });

  it("calcule le décalage à partir de la page demandée", async () => {
    const query = mockQuery([]);
    ReviewMock.find.mockReturnValue(query);

    await getReviews(mockRequest({ query: { page: "3", limit: "5" } }), mockResponse());

    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  it("plafonne la taille de page à 100", async () => {
    const query = mockQuery([]);
    ReviewMock.find.mockReturnValue(query);

    await getReviews(mockRequest({ query: { limit: "500" } }), mockResponse());

    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it("ramène une page inférieure à 1 sur la première page", async () => {
    const query = mockQuery([]);
    ReviewMock.find.mockReturnValue(query);

    await getReviews(mockRequest({ query: { page: "0" } }), mockResponse());

    expect(query.skip).toHaveBeenCalledWith(0);
  });

  it("filtre par produit et par utilisateur quand ils sont fournis", async () => {
    const productBoutiqueId = oid().toString();
    const userId = oid().toString();

    await getReviews(mockRequest({ query: { productBoutiqueId, userId } }), mockResponse());

    expect(ReviewMock.find).toHaveBeenCalledWith({ productBoutiqueId, userId });
  });

  it("n'applique aucun filtre quand la requête est vide", async () => {
    await getReviews(mockRequest(), mockResponse());

    expect(ReviewMock.find).toHaveBeenCalledWith({});
  });

  it("associe chaque avis à son auteur et calcule le nombre de pages", async () => {
    const auteur = makeUser({ prenom: "Aïssatou", nom: "Bah" });
    const review = makeReview({ userId: auteur._id });
    ReviewMock.find.mockReturnValue(mockQuery([review]));
    ReviewMock.countDocuments.mockReturnValue(mockQuery(25));
    UserMock.find.mockReturnValue(mockQuery([auteur]));
    const res = mockResponse();

    await getReviews(mockRequest({ query: { limit: "10" } }), res);

    expect(res.body.data.total).toBe(25);
    expect(res.body.data.totalPages).toBe(3);
    expect(res.body.data.reviews[0].userName).toBe("Aïssatou Bah");
  });

  it("renvoie 500 en cas d'erreur", async () => {
    ReviewMock.find.mockImplementation(() => {
      throw new Error("index manquant");
    });
    const res = mockResponse();

    await getReviews(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getReviewById", () => {
  it("renvoie l'avis et son auteur", async () => {
    const auteur = makeUser({ prenom: "Fatoumata", nom: "Camara" });
    const review = makeReview({ userId: auteur._id, rating: 5 });
    ReviewMock.findById.mockReturnValue(mockQuery(review));
    UserMock.findById.mockReturnValue(mockQuery(auteur));
    const res = mockResponse();

    await getReviewById(mockRequest({ params: { id: review._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.rating).toBe(5);
    expect(res.body.data.userName).toBe("Fatoumata Camara");
  });

  it("renvoie 404 quand l'avis est introuvable", async () => {
    ReviewMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getReviewById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Avis non trouvé");
  });

  it("tolère un auteur supprimé", async () => {
    ReviewMock.findById.mockReturnValue(mockQuery(makeReview()));
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getReviewById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.userName).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
describe("updateReview", () => {
  it("renvoie 404 quand l'avis n'existe pas", async () => {
    ReviewMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateReview(mockRequest({ params: { id: oid().toString() }, body: {} }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    const review = makeReview({ rating: 3, comment: "Correct" });
    ReviewMock.findById.mockReturnValue(mockQuery(review));
    const res = mockResponse();

    await updateReview(
      mockRequest({ params: { id: review._id.toString() }, body: { rating: 5 } }),
      res
    );

    expect(review.rating).toBe(5);
    expect(review.comment).toBe("Correct");
    expect(review.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("recalcule la note agrégée du produit après modification", async () => {
    const pb = makeProductBoutique({ rating: 3, reviewsCount: 1 });
    const review = makeReview({ productBoutiqueId: pb._id, rating: 3 });
    ReviewMock.findById.mockReturnValue(mockQuery(review));
    PbMock.findById.mockReturnValue(mockQuery(pb));
    ReviewMock.find.mockReturnValue(mockQuery([makeReview({ rating: 5 }), makeReview({ rating: 4 })]));

    await updateReview(
      mockRequest({ params: { id: review._id.toString() }, body: { rating: 5 } }),
      mockResponse()
    );

    expect(pb.rating).toBe(4.5);
    expect(pb.reviewsCount).toBe(2);
  });
});

// ─────────────────────────────────────────────
describe("deleteReview", () => {
  it("effectue une suppression logique et recalcule la note", async () => {
    const pb = makeProductBoutique({ rating: 4, reviewsCount: 2 });
    const review = makeReview({ productBoutiqueId: pb._id });
    ReviewMock.findById.mockReturnValue(mockQuery(review));
    PbMock.findById.mockReturnValue(mockQuery(pb));
    ReviewMock.find.mockReturnValue(mockQuery([makeReview({ rating: 3 })]));
    const res = mockResponse();

    await deleteReview(mockRequest({ params: { id: review._id.toString() } }), res);

    expect(review.deletedAt).toBeInstanceOf(Date);
    expect(review.save).toHaveBeenCalledWith({ session });
    expect(pb.rating).toBe(3);
    expect(pb.reviewsCount).toBe(1);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("remet la note à zéro quand plus aucun avis ne subsiste", async () => {
    const pb = makeProductBoutique({ rating: 4.5, reviewsCount: 1 });
    const review = makeReview({ productBoutiqueId: pb._id });
    ReviewMock.findById.mockReturnValue(mockQuery(review));
    PbMock.findById.mockReturnValue(mockQuery(pb));
    ReviewMock.find.mockReturnValue(mockQuery([]));

    await deleteReview(mockRequest({ params: { id: review._id.toString() } }), mockResponse());

    expect(pb.rating).toBe(0);
    expect(pb.reviewsCount).toBe(0);
  });

  it("renvoie 404 quand l'avis est introuvable", async () => {
    ReviewMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteReview(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────
describe("getReviewSummary", () => {
  it("calcule la moyenne, le total et la répartition", async () => {
    const productBoutiqueId = oid().toString();
    ReviewMock.find.mockReturnValue(
      mockQuery([
        makeReview({ rating: 5 }),
        makeReview({ rating: 5 }),
        makeReview({ rating: 4 }),
        makeReview({ rating: 1 }),
      ])
    );
    const res = mockResponse();

    await getReviewSummary(mockRequest({ params: { productBoutiqueId } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      productBoutiqueId,
      average: 3.8, // (5+5+4+1)/4 = 3.75 → 3.8
      total: 4,
      distribution: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 },
    });
  });

  it("renvoie un résumé neutre quand il n'y a aucun avis", async () => {
    ReviewMock.find.mockReturnValue(mockQuery([]));
    const res = mockResponse();

    await getReviewSummary(mockRequest({ params: { productBoutiqueId: oid().toString() } }), res);

    expect(res.body.data.average).toBe(0);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });

  it("renvoie 422 quand la validation échoue", async () => {
    failValidation(["Identifiant de produit en boutique invalide."]);
    const res = mockResponse();

    await getReviewSummary(mockRequest(), res);

    expect(res.statusCode).toBe(422);
  });
});
