import dotenv from "dotenv";
import mongoose, { Types } from "mongoose";
import { pathToFileURL } from "node:url";
import { DB_CONNECT } from "../db/db.js";
import { Order, ORDER_STATUSES_WITHOUT_SALE } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { Complementarite, OrigineComplementarite } from "../models/complementarite.model.js";
import { apprendreDesCommandes, APPRENTISSAGE_PAR_DEFAUT, type LienRayons } from "../shared/recommandation/complements.js";

// ─────────────────────────────────────────────
//  Apprentissage « souvent achetés avec »
//
//    npm run reco:complements
//
//  Lit les commandes (hors annulées), regarde quels rayons sont achetés
//  ensemble et remplace les liens d'origine « commandes ». Les règles
//  posées à la main (« regle ») ne sont jamais touchées. À relancer
//  régulièrement (une fois par nuit suffit) : le calcul repart de zéro.
// ─────────────────────────────────────────────

/** Rayons de chaque commande, lus par lots pour ne pas tout charger. */
export const rayonsDesCommandes = async (lot = 2_000): Promise<string[][]> => {
  const commandes: string[][] = [];
  const rayonDuProduit = new Map<string, string>();
  let page: Types.ObjectId[][] = [];

  const traduire = async () => {
    const inconnus = [...new Set(page.flat().map(String))].filter((id) => !rayonDuProduit.has(id));
    if (inconnus.length) {
      const produits = await Product.find({ _id: { $in: inconnus.map((id) => new Types.ObjectId(id)) } })
        .select("sousCategoryId")
        .lean();
      for (const p of produits) rayonDuProduit.set(String(p._id), String(p.sousCategoryId));
    }
    for (const produits of page) commandes.push(produits.flatMap((id) => rayonDuProduit.get(String(id)) ?? []));
    page = [];
  };

  const curseur = Order.find({ status: { $nin: ORDER_STATUSES_WITHOUT_SALE } }).select("items.productId").lean().cursor();
  for await (const commande of curseur) {
    page.push(commande.items.flatMap((i) => (i.productId ? [i.productId] : [])));
    if (page.length >= lot) await traduire();
  }
  await traduire();
  return commandes;
};

/** Remplace les liens appris par ceux du dernier calcul. */
export const enregistrerLiensAppris = async (liens: LienRayons[], now = new Date()): Promise<number> => {
  await Complementarite.deleteMany({ origine: OrigineComplementarite.COMMANDES });
  if (liens.length === 0) return 0;
  await Complementarite.insertMany(
    liens.map((l) => ({
      source: new Types.ObjectId(l.source), cible: new Types.ObjectId(l.cible), poids: l.poids,
      origine: OrigineComplementarite.COMMANDES, createdAt: now, updatedAt: now,
    })),
    { ordered: false }
  );
  return liens.length;
};

const main = async () => {
  dotenv.config();
  await DB_CONNECT();
  try {
    const commandes = await rayonsDesCommandes();
    const liens = apprendreDesCommandes(commandes, APPRENTISSAGE_PAR_DEFAUT);
    const total = await enregistrerLiensAppris(liens);
    console.log(`${commandes.length} commandes lues, ${total} liens « acheté avec » appris (au moins ${APPRENTISSAGE_PAR_DEFAUT.supportMin} commandes en commun).`);
  } finally {
    await mongoose.disconnect();
  }
};

// Exécuté seulement en ligne de commande, pas à l'import (tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Apprentissage interrompu : ${(error as Error).message}`);
    process.exit(1);
  });
}
