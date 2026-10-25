import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { buildSeed } from "@src/seed/build.js";
import { COMPLEMENTS_PAR_ARTICLE, complementaritesParRegles, poidsDuRang } from "@src/seed/complementarites.js";
import { Etape } from "@src/models/projet.model.js";

const now = new Date("2026-10-05T12:00:00.000Z");
const id = () => new Types.ObjectId();

describe("règles « acheté avec »", () => {
  it("ne cite que des articles qui ont des photos (et donc des rayons)", () => {
    const articles = new Set(Object.keys(COMPLEMENTS_PAR_ARTICLE));
    for (const cibles of Object.values(COMPLEMENTS_PAR_ARTICLE)) {
      for (const cible of cibles) expect(articles, cible).toContain(cible);
      expect(cibles.length).toBeLessThanOrEqual(5);
    }
  });

  it("cherche la cible au plus près : même catégorie, puis même famille", () => {
    const famille = id();
    const autreFamille = id();
    const categorie = id();
    const ciment = { sousId: id(), categorieId: categorie, familleId: famille, articles: ["ciment"] };
    const sableProche = { sousId: id(), categorieId: categorie, familleId: famille, articles: ["sable"] };
    const sableLoin = { sousId: id(), categorieId: id(), familleId: autreFamille, articles: ["sable"] };
    const graviersFamille = { sousId: id(), categorieId: id(), familleId: famille, articles: ["gravier"] };

    const liens = complementaritesParRegles([ciment, sableLoin, sableProche, graviersFamille], now)
      .filter((l) => String(l.source) === String(ciment.sousId));

    expect(liens.map((l) => [String(l.cible), l.poids])).toEqual([
      [String(sableProche.sousId), poidsDuRang(0)],
      [String(graviersFamille.sousId), poidsDuRang(1)],
    ]);
  });

  it("ne lie jamais un rayon à lui-même", () => {
    const sous = { sousId: id(), categorieId: id(), familleId: id(), articles: ["gravier", "sable"] };

    expect(complementaritesParRegles([sous], now)).toEqual([]);
  });
});

describe("seed de démonstration : personnalisation", () => {
  const seed = buildSeed(now, "Secret@123");

  it("situe chaque catégorie dans le chantier", () => {
    const etapes = new Map(seed.categories.map((c) => [c.nom, c.etape]));

    expect(etapes.get("Gros œuvre")).toBe(Etape.GROS_OEUVRE);
    expect(etapes.get("Plomberie")).toBe(Etape.RESEAUX);
    expect(etapes.get("Outillage")).toBe(Etape.TRANSVERSE);
  });

  it("relie les rayons de la démonstration entre eux", () => {
    const sous = new Map(seed.sousCategories.map((s) => [String(s._id), s.nom]));
    const liens = seed.complementarites.map((c) => [sous.get(String(c.source)), sous.get(String(c.cible))]);

    expect(liens).toContainEqual(["Liants", "Granulats"]);
    expect(liens).toContainEqual(["Peintures", "Enduits et sous-couches"]);
    expect(liens.every(([s, c]) => s && c && s !== c)).toBe(true);
  });

  it("donne un projet au client de démonstration", () => {
    const client = seed.users.find((u) => u.email === "mamadou@btp.com")!;

    expect(client.projet).toMatchObject({ types: ["construction"], avancement: "gros_oeuvre" });
  });
});
