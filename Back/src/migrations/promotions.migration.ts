import dotenv from "dotenv";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { DB_CONNECT } from "../db/db.js";
import { PriceHistory } from "../models/priceHistory.model.js";
import { productBoutique } from "../models/product.model.js";
import { DiscountType, Promotion, PromotionScope, PromotionStatus, PromotionType } from "../models/promotion.model.js";
import { recomputeAllPromotedOffers, recomputeSalesCounts } from "../shared/services/pricing.service.js";

// ─────────────────────────────────────────────
//  Migration : prix remisés écrits à la main → promotions de boutique
//
//    npm run migrate:promotions
//
//  Avant le moteur de prix, une boutique écrivait elle-même `discountPrice`,
//  sans date ni prix de référence. Chaque offre dans ce cas reçoit une remise
//  produit de sa boutique, du même pourcentage, pour 30 jours à partir de la
//  migration ; chaque offre sans historique reçoit son prix actuel comme
//  premier prix connu. Puis les prix sont recalculés. Rejouable : une offre
//  déjà convertie n'a plus de `discountPrice` sans promotion.
// ─────────────────────────────────────────────

const DAY = 24 * 3600 * 1000;

export const migrateManualDiscounts = async (now = new Date()): Promise<{ promotions: number; histories: number; priced: number }> => {
  const offers = await productBoutique.find({ discountPrice: { $ne: null }, promo: null });
  let promotions = 0;
  for (const offer of offers) {
    if (offer.discountPrice == null || offer.discountPrice >= offer.price) continue;
    const percent = Math.round(((offer.price - offer.discountPrice) / offer.price) * 100);
    if (percent < 1) continue;
    await Promotion.create({
      boutiqueId: offer.boutiqueId,
      status: PromotionStatus.ACTIVE,
      nom: `Remise de ${percent} %`,
      type: PromotionType.PRODUCT_DISCOUNT,
      scope: PromotionScope.PRODUCT_BOUTIQUE,
      discountType: DiscountType.PERCENTAGE,
      discountValue: Math.min(70, percent),
      startDate: now,
      endDate: new Date(now.getTime() + 30 * DAY),
      productBoutiqueIds: [offer._id],
      actif: true,
    });
    promotions += 1;
  }

  const withHistory = new Set((await PriceHistory.distinct("productBoutiqueId")).map(String));
  const missing = await productBoutique.find({}).select("_id price createdAt");
  const docs = missing
    .filter((offer) => !withHistory.has(String(offer._id)))
    .map((offer) => ({ productBoutiqueId: offer._id, price: offer.price, from: offer.createdAt ?? now, to: null }));
  for (let i = 0; i < docs.length; i += 5_000) await PriceHistory.insertMany(docs.slice(i, i + 5_000), { ordered: false });

  const priced = await recomputeAllPromotedOffers(now);
  await recomputeSalesCounts(now);
  return { promotions, histories: docs.length, priced };
};

const main = async () => {
  dotenv.config();
  await DB_CONNECT();
  const result = await migrateManualDiscounts();
  console.log(`${result.promotions} remise(s) convertie(s), ${result.histories} historique(s) créé(s), ${result.priced} offre(s) recalculée(s).`);
  await mongoose.connection.close();
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
