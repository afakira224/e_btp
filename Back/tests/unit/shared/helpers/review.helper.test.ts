import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../../src/models/review.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/review.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Review: mockModel() };
});

vi.mock("../../../../src/models/product.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/product.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, productBoutique: mockModel() };
});

import { productBoutique } from "../../../../src/models/product.model.js";
import { Review } from "../../../../src/models/review.model.js";
import { recomputeRating, VISIBLE_REVIEW } from "../../../../src/shared/helpers/review.helper.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { mockSession } from "../../../helpers/express.mock.js";
import { makeProductBoutique, makeReview } from "../../../helpers/factories.js";

const ReviewMock = Review as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;

let offer: ReturnType<typeof makeProductBoutique>;

beforeEach(() => {
  offer = makeProductBoutique({ rating: 0, reviewsCount: 0 });
  ReviewMock.find.mockReturnValue(mockQuery([]));
  PbMock.findById.mockReturnValue(mockQuery(offer));
});

describe("recomputeRating", () => {
  it("ne compte que les avis visibles : un avis masqué par la modération sort de la note", async () => {
    await recomputeRating(offer._id);

    expect(VISIBLE_REVIEW).toEqual({ hiddenAt: null });
    expect(ReviewMock.find).toHaveBeenCalledWith({ productBoutiqueId: offer._id, hiddenAt: null });
  });

  it("enregistre la moyenne arrondie à une décimale et le nombre d'avis", async () => {
    ReviewMock.find.mockReturnValue(mockQuery([makeReview({ rating: 5 }), makeReview({ rating: 4 }), makeReview({ rating: 4 })]));

    await recomputeRating(offer._id);

    expect(offer.rating).toBe(4.3);
    expect(offer.reviewsCount).toBe(3);
    expect(offer.save).toHaveBeenCalledWith({});
  });

  it("remet la note à zéro quand plus aucun avis n'est visible", async () => {
    offer.rating = 4.5;
    offer.reviewsCount = 12;

    await recomputeRating(offer._id);

    expect(offer.rating).toBe(0);
    expect(offer.reviewsCount).toBe(0);
  });

  it("lit et écrit dans la transaction quand il y en a une", async () => {
    const session = mockSession();
    const reviews = mockQuery([makeReview({ rating: 3 })]);
    const offerQuery = mockQuery(offer);
    ReviewMock.find.mockReturnValue(reviews);
    PbMock.findById.mockReturnValue(offerQuery);

    await recomputeRating(String(offer._id), session as any);

    expect(reviews.session).toHaveBeenCalledWith(session);
    expect(offerQuery.session).toHaveBeenCalledWith(session);
    expect(offer.save).toHaveBeenCalledWith({ session });
  });

  it("ne fait rien quand l'offre a disparu", async () => {
    PbMock.findById.mockReturnValue(mockQuery(null));

    await expect(recomputeRating(offer._id)).resolves.toBeUndefined();
    expect(offer.save).not.toHaveBeenCalled();
  });
});
