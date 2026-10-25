import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import mongoose, { type Model } from "mongoose";
import { DB_CONNECT } from "../db/db.js";
import { Address } from "../models/address.model.js";
import { Cart } from "../models/cart.model.js";
import { Categorie } from "../models/categorie.model.js";
import { Complementarite } from "../models/complementarite.model.js";
import { Famille } from "../models/famille.model.js";
import { Order } from "../models/order.model.js";
import { Product, productBoutique } from "../models/product.model.js";
import { Promotion } from "../models/promotion.model.js";
import { RecentlyViewed } from "../models/recentlyViewed.model.js";
import { Review } from "../models/review.model.js";
import { Shop } from "../models/boutique.model.js";
import { SousCategorie } from "../models/sousCategorie.model.js";
import { EntitiesLogin, User } from "../models/user.model.js";
import { Wishlist } from "../models/wishlist.model.js";
import { buildSeed, type SeedData } from "./build.js";
import { expandCatalog, generateProducts, plannedProducts, volumeFromEnv, type ExpandedCatalog, type VolumeOptions } from "./volume.js";

// ─────────────────────────────────────────────
//  Seed de développement : remplit la base avec le catalogue de
//  démonstration (familles, boutiques, produits et offres à 5 photos,
//  promotions, avis, compte client avec adresses et commandes).
//
//    npm run seed          base vide uniquement (refuse sinon)
//    npm run seed:reset    vide d'abord les collections du seed
//    npm run seed:volume   vide, puis catalogue de volume : 100 familles,
//                          300 catégories, 15 000 sous-catégories,
//                          5 250 000 produits et offres (réglable par
//                          SEED_FAMILLES, SEED_CATEGORIES_PAR_FAMILLE,
//                          SEED_SOUS_PAR_CATEGORIE, SEED_PRODUITS_PAR_SOUS)
//
//  Jamais en production. Chaque document est validé par son schéma
//  Mongoose avant l'insertion ; les dates sont celles calculées par
//  buildSeed (createdAt conservé, d'où l'insertion directe).
// ─────────────────────────────────────────────

dotenv.config();

const volume = process.argv.includes("--volume");
const reset = volume || process.argv.includes("--reset");
const password = process.env.SEED_PASSWORD ?? "Secret@123";

// Ordre d'insertion : les références pointent toujours vers des documents déjà présents.
const plan: [keyof SeedData, Model<any>][] = [
  ["users", User],
  ["logins", EntitiesLogin],
  ["familles", Famille],
  ["categories", Categorie],
  ["sousCategories", SousCategorie],
  ["complementarites", Complementarite],
  ["shops", Shop],
  ["products", Product],
  ["productBoutiques", productBoutique],
  ["promotions", Promotion],
  ["reviews", Review],
  ["addresses", Address],
  ["orders", Order],
  ["carts", Cart],
  ["wishlists", Wishlist],
  ["recentlyViewed", RecentlyViewed],
];

async function insert(model: Model<any>, docs: Record<string, unknown>[]) {
  if (docs.length === 0) return;
  const valid = [];
  for (const doc of docs) {
    const hydrated = new model(doc);
    await hydrated.validate();
    valid.push(hydrated.toObject({ depopulate: true }));
  }
  // Insertion directe : Mongoose écraserait createdAt avec l'heure courante.
  // Par lots, pour les 15 000 sous-catégories du mode volume.
  for (let i = 0; i < valid.length; i += 5_000) {
    await model.collection.insertMany(valid.slice(i, i + 5_000), { ordered: false });
  }
}

/**
 * Produits et offres du catalogue de volume, par lots de 10 000 : insertion
 * directe (le premier lot est validé par les schémas), progression affichée.
 */
async function insertVolume(catalog: ExpandedCatalog, options: VolumeOptions, now: Date) {
  const total = plannedProducts(catalog, options);
  const started = Date.now();
  console.log(`\nCatalogue de volume : ${total.toLocaleString("fr-FR")} produits et autant d'offres à créer…`);
  let products: Record<string, unknown>[] = [];
  let offers: Record<string, unknown>[] = [];
  let done = 0;
  let validated = false;

  const flush = async () => {
    if (!products.length) return;
    if (!validated) {
      await new Product(products[0]).validate();
      await new productBoutique(offers[0]).validate();
      validated = true;
    }
    await Product.collection.insertMany(products, { ordered: false });
    await productBoutique.collection.insertMany(offers, { ordered: false });
    done += products.length;
    products = [];
    offers = [];
    const seconds = Math.max((Date.now() - started) / 1000, 1);
    const rate = done / seconds;
    const left = Math.ceil((total - done) / Math.max(rate, 1) / 60);
    process.stdout.write(`\r  ${done.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")} produits — ${Math.round(rate).toLocaleString("fr-FR")}/s — reste ~${left} min   `);
  };

  for (const chunk of generateProducts(catalog, options, now)) {
    products.push(...chunk.products);
    offers.push(...chunk.offers);
    if (products.length >= 10_000) await flush();
  }
  await flush();
  console.log(`\n  Terminé en ${Math.max(1, Math.round((Date.now() - started) / 60_000))} min.`);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Le seed de développement est interdit en production.");
  }

  const images = path.join(process.cwd(), "uploads", "seed", "products");
  if (!fs.existsSync(images)) {
    throw new Error(`Photos du seed introuvables (${images}). Lancez « bash design/render.sh --only-products » depuis Front/apk.`);
  }

  await DB_CONNECT();

  const existing = await Famille.countDocuments();
  if (existing > 0 && !reset) {
    throw new Error("La base contient déjà un catalogue. Relancez avec « npm run seed:reset » pour la vider et la remplir à nouveau.");
  }
  if (reset) {
    for (const [, model] of plan) await model.collection.deleteMany({});
    // Les sessions ouvertes pointent vers des comptes supprimés.
    await mongoose.connection.collection("sessions").deleteMany({});
    console.log("Collections du seed vidées.");
  }

  const now = new Date();
  const data = buildSeed(now, password);
  const options = volumeFromEnv(process.env);
  const catalog = volume ? expandCatalog(data, options, now, password) : null;
  if (catalog) {
    // Le catalogue de volume remplace taxonomie, boutiques et comptes ; le reste est conservé.
    Object.assign(data, {
      familles: catalog.familles,
      categories: catalog.categories,
      sousCategories: catalog.sousCategories,
      complementarites: catalog.complementarites,
      shops: catalog.shops,
      users: catalog.users,
      logins: catalog.logins,
    });
  }

  // Le pre("save") de EntitiesLogin ne s'applique pas à l'insertion directe : on hache ici,
  // une seule fois par mot de passe distinct (bcrypt est volontairement lent).
  const hashes = new Map<string, string>();
  for (const login of data.logins) {
    if (!hashes.has(login.password)) hashes.set(login.password, await bcrypt.hash(login.password, 12));
    login.password = hashes.get(login.password)!;
  }

  for (const [key, model] of plan) {
    await insert(model, data[key]);
    console.log(`  ${String(data[key].length).padStart(6)}  ${key}`);
  }

  if (catalog) await insertVolume(catalog, options, now);

  console.log("\nSeed terminé. Comptes de développement (mot de passe : SEED_PASSWORD ou Secret@123) :");
  const shown = data.users.slice(0, 12);
  for (const user of shown) console.log(`  ${String(user.role).padEnd(6)} ${user.email}`);
  if (data.users.length > shown.length) {
    console.log(`  … et ${data.users.length - shown.length} autres gérants de boutique (gerant.boutique-NNN@btp.com)`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(`\nSeed interrompu : ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
