import { describe, it, expect } from "vitest";
import { toReviewResponseDto } from "../../../../src/shared/interfaces/Review.interfaces.js";
import { CREATED_AT, UPDATED_AT, makeReview, makeUser } from "../../../helpers/factories.js";

describe("toReviewResponseDto", () => {
  it("mappe l'avis et sérialise les identifiants", () => {
    const review = makeReview({ rating: 5, comment: "Parfait", verifiedPurchase: true });

    const dto = toReviewResponseDto(review);

    expect(dto).toEqual({
      id: review._id.toString(),
      userId: review.userId.toString(),
      userName: undefined,
      productBoutiqueId: review.productBoutiqueId.toString(),
      rating: 5,
      comment: "Parfait",
      verifiedPurchase: true,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it("compose userName à partir du prénom et du nom", () => {
    const user = makeUser({ prenom: "Aïssatou", nom: "Bah" });
    const review = makeReview({ userId: user._id });

    expect(toReviewResponseDto(review, user).userName).toBe("Aïssatou Bah");
  });

  it("tolère un prénom ou un nom manquant", () => {
    const sansNom = makeUser({ prenom: "Aïssatou", nom: undefined });
    const sansPrenom = makeUser({ prenom: undefined, nom: "Bah" });

    expect(toReviewResponseDto(makeReview(), sansNom).userName).toBe("Aïssatou");
    expect(toReviewResponseDto(makeReview(), sansPrenom).userName).toBe("Bah");
  });

  it("renvoie userName indéfini plutôt qu'une chaîne vide", () => {
    const anonyme = makeUser({ prenom: undefined, nom: undefined });

    expect(toReviewResponseDto(makeReview(), anonyme).userName).toBeUndefined();
  });

  it("renvoie userName indéfini quand aucun utilisateur n'est fourni", () => {
    expect(toReviewResponseDto(makeReview()).userName).toBeUndefined();
  });
});
