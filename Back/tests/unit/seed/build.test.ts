import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeed, IMAGES_PER_PRODUCT } from "@src/seed/build.js";
import { LEGACY_DELIVERY_FEES, isDeliveryMode } from "@src/models/delivery.model.js";

const now = new Date("2026-10-05T12:00:00.000Z");
const seed = buildSeed(now, "Secret@123");
const ids = (docs: { _id: unknown }[]) => new Set(docs.map((d) => String(d._id)));

describe("seed de développement", () => {
  it("donne 5 photos à chaque produit et à chaque offre, et les fichiers existent", () => {
    for (const doc of [...seed.products, ...seed.productBoutiques]) {
      const images = doc.urlImages as string[];
      expect(images).toHaveLength(IMAGES_PER_PRODUCT);
      for (const url of images) {
        expect(fs.existsSync(path.join(process.cwd(), url)), url).toBe(true);
      }
    }
  });

  it("relie chaque entité à des documents existants", () => {
    const familles = ids(seed.familles);
    const categories = ids(seed.categories);
    const sous = ids(seed.sousCategories);
    const shops = ids(seed.shops);
    const products = ids(seed.products);
    const offers = ids(seed.productBoutiques);
    const users = ids(seed.users);

    for (const c of seed.categories) expect(familles.has(String(c.familleId))).toBe(true);
    for (const s of seed.sousCategories) expect(categories.has(String(s.categorieId))).toBe(true);
    for (const p of seed.products) {
      expect(familles.has(String(p.familleId))).toBe(true);
      expect(categories.has(String(p.categoryId))).toBe(true);
      expect(sous.has(String(p.sousCategoryId))).toBe(true);
    }
    for (const o of seed.productBoutiques) {
      expect(shops.has(String(o.boutiqueId))).toBe(true);
      expect(products.has(String(o.productId))).toBe(true);
    }
    for (const s of seed.shops) expect(users.has(String(s.ownerId))).toBe(true);
    for (const l of seed.logins) expect(users.has(String(l.entityId))).toBe(true);
    for (const p of seed.promotions) for (const o of p.productBoutiqueIds as unknown[]) expect(offers.has(String(o))).toBe(true);
  });

  it("garde le catalogue complet de la démonstration", () => {
    expect(seed.familles).toHaveLength(2);
    expect(seed.categories).toHaveLength(6);
    expect(seed.sousCategories).toHaveLength(22);
    expect(seed.shops).toHaveLength(6);
    expect(seed.products).toHaveLength(32);
    expect(seed.productBoutiques).toHaveLength(32);
  });

  it("met la vente flash en cours au moment du seed", () => {
    const flash = seed.promotions.find((p) => p.type === "flash_sale")!;
    expect((flash.startDate as Date).getTime()).toBeLessThan(now.getTime());
    expect((flash.endDate as Date).getTime()).toBeGreaterThan(now.getTime());
  });

  it("calcule les montants des commandes comme l'API", () => {
    for (const order of seed.orders) {
      const items = order.items as { price: number; quantity: number }[];
      const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
      expect(order.subtotal).toBe(subtotal);
      // Modes actuels : somme des livraisons par boutique, comme au checkout.
      // Anciens modes (standard, express) : frais d'époque, sans détail.
      const deliveries = order.deliveries as { fee: number }[];
      const expectedFee = isDeliveryMode(order.deliveryMethod)
        ? deliveries.reduce((sum, d) => sum + d.fee, 0)
        : LEGACY_DELIVERY_FEES[order.deliveryMethod as keyof typeof LEGACY_DELIVERY_FEES];
      expect(order.shippingFee).toBe(expectedFee);
      expect(order.amount).toBe(subtotal + (order.shippingFee as number));
      expect((order.statusHistory as { status: string }[]).at(-1)?.status).toBe(order.status);
    }
  });

  it("n'a qu'un compte par e-mail et une seule adresse par défaut", () => {
    const emails = seed.users.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
    expect(seed.addresses.filter((a) => a.isDefault)).toHaveLength(1);
  });
});
