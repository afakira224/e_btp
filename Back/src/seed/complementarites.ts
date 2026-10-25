import { Types } from "mongoose";
import { OrigineComplementarite } from "../models/complementarite.model.js";

// ─────────────────────────────────────────────
//  Complémentarités posées à la main : « avec du ciment, on prend du
//  sable, du gravier, du fer… ». Écrites par article (le nom des photos),
//  puis traduites en liens entre rayons pour le catalogue réellement
//  inséré — démonstration comme volume.
//
//  Les commandes affinent ensuite ces liens (npm run reco:complements).
// ─────────────────────────────────────────────

/** Article → articles achetés avec, du plus utile au moins utile (5 au plus). */
export const COMPLEMENTS_PAR_ARTICLE: Record<string, string[]> = {
  ciment: ["sable", "gravier", "fer", "betonniere", "brouette"],
  fer: ["treillis", "ciment", "gravier"],
  treillis: ["fer", "ciment"],
  parpaing: ["ciment", "sable", "brouette"],
  gravier: ["ciment", "sable", "betonniere"],
  sable: ["ciment", "gravier", "parpaing"],
  betonniere: ["ciment", "sable", "gravier", "brouette"],
  carrelage: ["colle", "plinthe", "faience", "niveau-laser"],
  colle: ["carrelage", "faience"],
  faience: ["colle", "carrelage"],
  plinthe: ["carrelage", "colle"],
  parquet: ["plinthe", "niveau-laser"],
  "peinture-facade": ["sous-couche", "kit-peintre", "echafaudage"],
  "peinture-interieure": ["sous-couche", "kit-peintre", "enduit"],
  "sous-couche": ["peinture-interieure", "peinture-facade", "kit-peintre"],
  enduit: ["sous-couche", "peinture-interieure", "kit-peintre"],
  "kit-peintre": ["peinture-interieure", "peinture-facade"],
  "tube-pvc": ["wc", "mitigeur"],
  mitigeur: ["tube-pvc", "chauffe-eau", "wc"],
  wc: ["mitigeur", "tube-pvc", "faience"],
  "chauffe-eau": ["mitigeur", "cable", "disjoncteur"],
  cable: ["tableau", "disjoncteur", "prise"],
  tableau: ["disjoncteur", "cable"],
  disjoncteur: ["tableau", "cable"],
  prise: ["cable", "disjoncteur"],
  projecteur: ["cable"],
  perforateur: ["casque", "niveau-laser"],
  meuleuse: ["casque"],
  "niveau-laser": ["perforateur"],
  brouette: ["casque"],
  echafaudage: ["casque"],
  casque: ["brouette", "projecteur"],
};

/** Poids du n-ième complément : 1, 0,85, 0,7… */
export const poidsDuRang = (rang: number) => Math.round((1 - rang * 0.15) * 100) / 100;

/** Un rayon du catalogue et les articles qu'il vend. */
export interface RayonArticles {
  sousId: Types.ObjectId;
  categorieId: Types.ObjectId;
  familleId: Types.ObjectId;
  articles: string[];
}

type Doc = Record<string, unknown> & { _id: Types.ObjectId };

/**
 * Liens « regle » entre rayons. Pour chaque article complémentaire, le
 * rayon cible est cherché au plus près : même catégorie, puis même
 * famille, puis tout le catalogue. Quand plusieurs rayons conviennent, la
 * source choisit selon sa position, pour ne pas tout envoyer vers le
 * premier.
 */
export function complementaritesParRegles(rayons: RayonArticles[], now: Date): Doc[] {
  const parArticle = new Map<string, RayonArticles[]>();
  for (const r of rayons) {
    for (const a of r.articles) parArticle.set(a, [...(parArticle.get(a) ?? []), r]);
  }

  const docs: Doc[] = [];
  rayons.forEach((source, position) => {
    const cibles = [...new Set(source.articles.flatMap((a) => COMPLEMENTS_PAR_ARTICLE[a] ?? []))]
      .filter((a) => !source.articles.includes(a))
      .slice(0, 5);
    const dejaLies = new Set<string>();
    cibles.forEach((article) => {
      const candidats = (parArticle.get(article) ?? []).filter((r) => !r.sousId.equals(source.sousId));
      const proches =
        [
          candidats.filter((r) => r.categorieId.equals(source.categorieId)),
          candidats.filter((r) => r.familleId.equals(source.familleId)),
          candidats,
        ].find((liste) => liste.length > 0) ?? [];
      const cible = proches[position % Math.max(proches.length, 1)];
      if (!cible || dejaLies.has(String(cible.sousId))) return;
      dejaLies.add(String(cible.sousId));
      docs.push({
        _id: new Types.ObjectId(), source: source.sousId, cible: cible.sousId,
        poids: poidsDuRang(dejaLies.size - 1), origine: OrigineComplementarite.REGLE,
        createdAt: now, updatedAt: now,
      });
    });
  });
  return docs;
}
