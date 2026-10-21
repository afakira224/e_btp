import dotenv from "dotenv";
import mongoose, { type Model } from "mongoose";
import { pathToFileURL } from "node:url";
import { DB_CONNECT } from "../db/db.js";
import { Shop } from "../models/boutique.model.js";
import { productBoutique } from "../models/product.model.js";
import { Order } from "../models/order.model.js";
import {
  DEFAULT_FLAT_RATE_FEE,
  DEFAULT_SHOP_MODES,
  DeliveryMethod,
} from "../models/delivery.model.js";

// ─────────────────────────────────────────────
//  Migration : modes de livraison par boutique et par produit
//
//    npm run migrate:delivery
//
//  Sans elle, l'API fonctionne déjà : les valeurs par défaut des schémas
//  s'appliquent à la lecture. Elle écrit ces valeurs en base pour que les
//  requêtes directes (agrégations, back-office, exports) voient la même
//  chose que l'API, et règle le seul cas que le défaut ne sait pas traiter :
//  une boutique sans adresse ne peut pas proposer le retrait.
//
//  Idempotente : chaque étape ne touche que les documents sans le champ.
//  Aucune donnée existante n'est modifiée ni supprimée ; les anciennes
//  commandes gardent leur mode (standard / express) et leurs frais.
// ─────────────────────────────────────────────

export interface MigrationStep {
  label: string;
  model: Model<any>;
  filter: Record<string, unknown>;
  update: Record<string, unknown>;
}

const missing = (field: string) => ({ [field]: { $exists: false } });
const noAddress = { $or: [{ adresse: { $exists: false } }, { adresse: null }, { adresse: "" }] };

export const deliveryMigrationSteps = (): MigrationStep[] => [
  {
    label: "Boutiques avec adresse : retrait + prix fixe (offre d'avant la migration)",
    model: Shop,
    filter: { ...missing("delivery"), $nor: [noAddress] },
    update: { $set: { delivery: { modes: [...DEFAULT_SHOP_MODES], flatRateFee: DEFAULT_FLAT_RATE_FEE } } },
  },
  {
    label: "Boutiques sans adresse : prix fixe seul (le retrait exige une adresse)",
    model: Shop,
    filter: { ...missing("delivery"), ...noAddress },
    update: { $set: { delivery: { modes: [DeliveryMethod.FLAT_RATE], flatRateFee: DEFAULT_FLAT_RATE_FEE } } },
  },
  {
    label: "Offres : héritage de la boutique",
    model: productBoutique,
    filter: missing("delivery"),
    update: { $set: { delivery: { useShopSettings: true, modes: [], flatRateFee: null } } },
  },
  {
    label: "Commandes antérieures : aucune livraison détaillée",
    model: Order,
    filter: missing("deliveries"),
    update: { $set: { deliveries: [] } },
  },
];

export const runDeliveryMigration = async (
  steps: MigrationStep[] = deliveryMigrationSteps()
): Promise<{ label: string; modified: number }[]> => {
  const report: { label: string; modified: number }[] = [];
  for (const step of steps) {
    // updateMany n'est pas concerné par les hooks pre(/^find/) : les
    // documents supprimés logiquement sont migrés eux aussi.
    const result = await step.model.updateMany(step.filter, step.update);
    report.push({ label: step.label, modified: result.modifiedCount ?? 0 });
  }
  return report;
};

const main = async () => {
  dotenv.config();
  await DB_CONNECT();
  try {
    const report = await runDeliveryMigration();
    for (const line of report) console.log(`${String(line.modified).padStart(7)}  ${line.label}`);
    console.log("Migration de la livraison terminée.");
  } finally {
    await mongoose.disconnect();
  }
};

// Exécuté seulement en ligne de commande, pas à l'import (tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Migration interrompue : ${(error as Error).message}`);
    process.exit(1);
  });
}
