import { describe, expect, it } from "vitest";
import {
  DECROISSANCE_VUES,
  POIDS,
  determinerEtapes,
  diversifier,
  enumerer,
  etapesDuProjet,
  poidsParOffre,
  regrouper,
} from "@src/shared/recommandation/profil.js";
import { AvancementChantier, Etape, TypeProjet, type IProjet } from "@src/models/projet.model.js";

const vide = { commandes: [], panier: [], favoris: [], vus: [] };
const projet = (types: TypeProjet[], avancement: AvancementChantier | null = null): IProjet => ({
  types, avancement, renseigneLe: new Date("2026-10-01"),
});

describe("poidsParOffre", () => {
  it("pèse un achat plus qu'un panier, un favori ou une vue", () => {
    const poids = poidsParOffre({ commandes: ["a"], panier: ["b"], favoris: ["c"], vus: ["d"] });

    expect(poids.get("a")).toBe(POIDS.commande);
    expect(poids.get("b")).toBe(POIDS.panier);
    expect(poids.get("c")).toBe(POIDS.favori);
    expect(poids.get("d")).toBe(POIDS.vue);
  });

  it("fait compter moins les vues anciennes", () => {
    const poids = poidsParOffre({ ...vide, vus: ["recent", "ancien"] });

    expect(poids.get("ancien")).toBeCloseTo(POIDS.vue * DECROISSANCE_VUES);
    expect(poids.get("recent")!).toBeGreaterThan(poids.get("ancien")!);
  });

  it("additionne les actions sur une même offre", () => {
    const poids = poidsParOffre({ ...vide, panier: ["a"], vus: ["a"] });

    expect(poids.get("a")).toBe(POIDS.panier + POIDS.vue);
  });
});

describe("regrouper", () => {
  it("reporte les poids sur les rayons, du plus fort au plus faible, sans les offres inconnues", () => {
    const poids = new Map([["a", 2], ["b", 6], ["c", 1], ["inconnue", 9]]);
    const rayon: Record<string, string> = { a: "ciment", b: "sable", c: "ciment" };

    expect(regrouper(poids, (id) => rayon[id])).toEqual([["sable", 6], ["ciment", 3]]);
  });
});

describe("determinerEtapes", () => {
  it("sans projet ni activité : aucune étape", () => {
    expect(determinerEtapes(null, [])).toEqual({ actuelle: null, suivante: null, source: null });
  });

  it("part de l'avancement déclaré", () => {
    const etapes = determinerEtapes(projet([TypeProjet.CONSTRUCTION], AvancementChantier.GROS_OEUVRE), []);

    expect(etapes).toEqual({ actuelle: Etape.GROS_OEUVRE, suivante: Etape.RESEAUX, source: "projet" });
  });

  it("« pas commencé » vaut gros œuvre", () => {
    expect(determinerEtapes(projet([], AvancementChantier.PAS_COMMENCE), []).actuelle).toBe(Etape.GROS_OEUVRE);
  });

  it("un achat d'une étape plus avancée fait avancer le chantier", () => {
    const etapes = determinerEtapes(projet([TypeProjet.CONSTRUCTION], AvancementChantier.GROS_OEUVRE), [
      [Etape.GROS_OEUVRE, 20],
      [Etape.REVETEMENTS, POIDS.panier],
    ]);

    expect(etapes).toEqual({ actuelle: Etape.REVETEMENTS, suivante: Etape.FINITIONS, source: "activite" });
  });

  it("de simples vues ne font pas avancer un chantier déclaré", () => {
    const etapes = determinerEtapes(projet([], AvancementChantier.GROS_OEUVRE), [[Etape.FINITIONS, POIDS.vue]]);

    expect(etapes.actuelle).toBe(Etape.GROS_OEUVRE);
  });

  it("sans réponse ni achat : l'étape qui l'intéresse le plus", () => {
    const etapes = determinerEtapes(null, [[Etape.RESEAUX, 3], [Etape.GROS_OEUVRE, 2]]);

    expect(etapes).toEqual({ actuelle: Etape.RESEAUX, suivante: Etape.REVETEMENTS, source: "activite" });
  });

  it("ignore les rayons « transverse » (outillage) pour situer le chantier", () => {
    expect(determinerEtapes(null, [[Etape.TRANSVERSE, 30]]).actuelle).toBeNull();
  });

  it("sans avancement ni activité : la première étape des types déclarés", () => {
    const etapes = determinerEtapes(projet([TypeProjet.SALLE_DE_BAIN_CUISINE]), []);

    expect(etapes).toEqual({ actuelle: Etape.RESEAUX, suivante: Etape.REVETEMENTS, source: "projet" });
  });

  it("après les finitions, pas d'étape suivante", () => {
    expect(determinerEtapes(projet([], AvancementChantier.FINITIONS), []).suivante).toBeNull();
  });
});

describe("etapesDuProjet", () => {
  it("réunit les étapes des types déclarés, sans doublon", () => {
    expect(etapesDuProjet(projet([TypeProjet.RENOVATION, TypeProjet.PEINTURE_FINITIONS]))).toEqual([
      Etape.REVETEMENTS,
      Etape.FINITIONS,
    ]);
    expect(etapesDuProjet(null)).toEqual([]);
  });
});

describe("diversifier", () => {
  it("prend un produit de chaque rayon à tour de rôle", () => {
    const items = ["c1", "c2", "c3", "s1", "s2", "g1"];
    const rayon = (x: string) => x[0]!;

    expect(diversifier(items, rayon, 5)).toEqual(["c1", "s1", "g1", "c2", "s2"]);
  });

  it("s'arrête quand il n'y a plus rien", () => {
    expect(diversifier(["a1"], (x) => x[0]!, 10)).toEqual(["a1"]);
  });
});

describe("enumerer", () => {
  it("forme une liste en français", () => {
    expect(enumerer([])).toBe("");
    expect(enumerer(["Ciments"])).toBe("Ciments");
    expect(enumerer(["Ciments", "Sables", "Graviers"])).toBe("Ciments, Sables et Graviers");
  });
});
