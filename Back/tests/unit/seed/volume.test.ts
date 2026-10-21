import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeed } from "@src/seed/build.js";
import { DEFAULT_VOLUME, expandCatalog, generateProducts, plannedProducts, volumeFromEnv } from "@src/seed/volume.js";

const now = new Date("2026-10-05T12:00:00.000Z");
const small = { familles: 5, categoriesParFamille: 3, sousParCategorie: 6, produitsParSous: 8 };

describe("seed de volume", () => {
  it("atteint exactement les quantités demandées par défaut", () => {
    const catalog = expandCatalog(buildSeed(now), DEFAULT_VOLUME, now, "Secret@123");
    expect(catalog.familles).toHaveLength(100);
    expect(catalog.categories).toHaveLength(300);
    expect(catalog.sousCategories).toHaveLength(15_000);
    // 350 produits par sous-catégorie, dont les 32 de la démonstration déjà présents.
    expect(plannedProducts(catalog, DEFAULT_VOLUME) + 32).toBe(5_250_000);
  }, 30_000);

  it("complète chaque famille, catégorie et sous-catégorie", () => {
    const base = buildSeed(now);
    const catalog = expandCatalog(base, small, now, "Secret@123");
    for (const f of catalog.familles) {
      expect(catalog.categories.filter((c) => String(c.familleId) === String(f._id))).toHaveLength(3);
    }
    for (const c of catalog.categories) {
      expect(catalog.sousCategories.filter((s) => String(s.categorieId) === String(c._id))).toHaveLength(6);
    }
    const generated = [...generateProducts(catalog, small, now)].flatMap((chunk) => chunk.products);
    const perSous = new Map<string, number>();
    for (const p of [...base.products, ...generated]) {
      perSous.set(String(p.sousCategoryId), (perSous.get(String(p.sousCategoryId)) ?? 0) + 1);
    }
    expect(perSous.size).toBe(catalog.sousCategories.length);
    for (const count of perSous.values()) expect(count).toBe(8);
  });

  it("respecte les contraintes d'unicité des schémas", () => {
    const catalog = expandCatalog(buildSeed(now), DEFAULT_VOLUME, now, "Secret@123");
    const familleNames = catalog.familles.map((f) => f.nom);
    expect(new Set(familleNames).size).toBe(familleNames.length);
    const catKeys = catalog.categories.map((c) => `${c.familleId}|${c.nom}`);
    expect(new Set(catKeys).size).toBe(catKeys.length);
    const sousKeys = catalog.sousCategories.map((s) => `${s.categorieId}|${s.nom}`);
    expect(new Set(sousKeys).size).toBe(sousKeys.length);
    const emails = catalog.users.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  }, 30_000);

  it("donne à chaque produit et offre 5 photos existantes, assorties à son rayon", () => {
    const catalog = expandCatalog(buildSeed(now), small, now, "Secret@123");
    const shops = new Set(catalog.shops.map((s) => String(s._id)));
    for (const chunk of generateProducts(catalog, small, now)) {
      chunk.products.forEach((p, i) => {
        const images = p.urlImages as string[];
        expect(images).toHaveLength(5);
        for (const url of images) expect(fs.existsSync(path.join(process.cwd(), url)), url).toBe(true);
        const offer = chunk.offers[i]!;
        expect(offer.productId).toBe(p._id);
        expect(shops.has(String(offer.boutiqueId))).toBe(true);
        expect(offer.price as number).toBeGreaterThan(0);
        if (offer.discountPrice != null) expect(offer.discountPrice as number).toBeLessThan(offer.price as number);
      });
    }
  });

  it("produit les mêmes données à chaque lancement", () => {
    const run = () => {
      const catalog = expandCatalog(buildSeed(now), small, now, "x");
      return [...generateProducts(catalog, small, now)].flatMap((c) => c.offers.map((o) => `${o.price}|${o.stock}`));
    };
    expect(run()).toEqual(run());
  });

  it("lit les réglages dans l'environnement", () => {
    expect(volumeFromEnv({ SEED_FAMILLES: "10", SEED_PRODUITS_PAR_SOUS: "abc" })).toEqual({ ...DEFAULT_VOLUME, familles: 10 });
  });
});
