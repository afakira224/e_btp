import { describe, expect, it } from "vitest";
import { apprendreDesCommandes, rayonsComplementaires } from "@src/shared/recommandation/complements.js";

describe("apprendreDesCommandes", () => {
  it("lie deux rayons achetés ensemble dans assez de commandes", () => {
    const liens = apprendreDesCommandes(
      [["ciment", "sable"], ["ciment", "sable", "fer"], ["ciment"], ["ciment", "sable"]],
      { supportMin: 2, parSource: 5 }
    );

    // 3 commandes de ciment sur 4 contiennent du sable.
    expect(liens).toContainEqual({ source: "ciment", cible: "sable", poids: 0.75 });
    expect(liens).toContainEqual({ source: "sable", cible: "ciment", poids: 1 });
    // Fer : une seule commande, du hasard.
    expect(liens.some((l) => l.cible === "fer" || l.source === "fer")).toBe(false);
  });

  it("compte un rayon une seule fois par commande", () => {
    const liens = apprendreDesCommandes([["ciment", "ciment", "sable"], ["ciment", "sable"]], { supportMin: 2, parSource: 5 });

    expect(liens).toContainEqual({ source: "ciment", cible: "sable", poids: 1 });
  });

  it("garde les cibles les plus fréquentes d'une source", () => {
    const commandes = [
      ["a", "b"], ["a", "b"], ["a", "b"],
      ["a", "c"], ["a", "c"],
      ["a", "d"], ["a", "d"],
    ];
    const liens = apprendreDesCommandes(commandes, { supportMin: 2, parSource: 2 }).filter((l) => l.source === "a");

    expect(liens.map((l) => l.cible)).toEqual(["b", "c"]);
  });
});

describe("rayonsComplementaires", () => {
  const liens = [
    { source: "ciment", cible: "sable", poids: 1 },
    { source: "ciment", cible: "sable", poids: 0.4 }, // appris, plus faible que la règle
    { source: "ciment", cible: "gravier", poids: 0.85 },
    { source: "fer", cible: "gravier", poids: 0.7 },
    { source: "fer", cible: "ciment", poids: 1 },
    { source: "carrelage", cible: "colle", poids: 1 },
  ];

  it("additionne les liens de plusieurs sources et ne propose pas les sources elles-mêmes", () => {
    const rayons = rayonsComplementaires(liens, ["ciment", "fer"], 5);

    expect(rayons).toEqual([
      { source: "ciment", cible: "gravier", poids: 1.55 },
      { source: "ciment", cible: "sable", poids: 1 },
    ]);
  });

  it("garde le meilleur poids d'un même lien (règle ou commandes)", () => {
    expect(rayonsComplementaires(liens, ["ciment"], 1)).toEqual([{ source: "ciment", cible: "sable", poids: 1 }]);
  });

  it("ignore les liens d'autres rayons", () => {
    expect(rayonsComplementaires(liens, ["peinture"], 5)).toEqual([]);
  });
});
