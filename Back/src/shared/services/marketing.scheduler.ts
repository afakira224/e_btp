import { PriceHistory } from "../../models/priceHistory.model.js";
import logger from "../logger/logger.js";
import { grantMonthlyCredits, runBoostTick } from "./boost.service.js";
import { recomputeAllPromotedOffers, recomputeSalesCounts, runPromotionTick } from "./pricing.service.js";

// ─────────────────────────────────────────────
//  Planificateur des promotions et des boosts.
//
//  Toutes les minutes : les promotions qui démarrent ou se terminent, et le
//  prix des offres concernées ; les boosts arrivés à leur fin (budget rendu).
//  Une fois par jour : les meilleures ventes, l'historique des prix de plus
//  de 90 jours, les crédits offerts le 1er du mois.
// ─────────────────────────────────────────────

const DAY = 24 * 3600 * 1000;
let timer: NodeJS.Timeout | null = null;

export const runMarketingDaily = async (now = new Date()): Promise<void> => {
  await recomputeSalesCounts(now);
  await PriceHistory.deleteMany({ to: { $lt: new Date(now.getTime() - 90 * DAY) } });
  const granted = await grantMonthlyCredits(now);
  if (granted > 0) logger.info(`Crédits de boost offerts à ${granted} boutique(s)`);
};

export const startMarketingScheduler = (intervalMs = 60 * 1000): void => {
  if (timer) return;
  let since = new Date();
  let lastDaily = "";
  const run = async () => {
    const now = new Date();
    try {
      const summary = await runPromotionTick(since, now);
      since = now;
      if (summary.started || summary.ended || summary.offers) {
        logger.info(`Promotions : ${summary.started} démarrée(s), ${summary.ended} terminée(s), ${summary.offers} offre(s) recalculée(s)`);
      }
      const finished = await runBoostTick(now);
      if (finished > 0) logger.info(`Boosts : ${finished} terminé(s), budget non dépensé rendu`);
      const day = now.toISOString().slice(0, 10);
      if (day !== lastDaily) {
        lastDaily = day;
        await runMarketingDaily(now);
      }
    } catch (error) {
      logger.error(`Planificateur des promotions : ${(error as Error).message}`);
    }
  };
  void recomputeAllPromotedOffers().catch((error) => logger.error(`Recalcul des prix au démarrage : ${(error as Error).message}`));
  void run();
  timer = setInterval(() => void run(), intervalMs);
  timer.unref?.();
};
