// ─────────────────────────────────────────────
//  « Souvent achetés avec » — règles pures, sans base de données.
//
//  Deux sources de liens entre rayons : les règles posées à la main et
//  ce que les clients achètent ensemble. Ce module apprend les seconds à
//  partir des commandes et fusionne les deux pour l'affichage.
// ─────────────────────────────────────────────

export interface LienRayons {
  source: string;
  cible: string;
  poids: number;
}

export interface OptionsApprentissage {
  /** Nombre minimal de commandes contenant les deux rayons : en dessous, c'est du hasard. */
  supportMin: number;
  /** Rayons retenus au plus pour une même source. */
  parSource: number;
}

export const APPRENTISSAGE_PAR_DEFAUT: OptionsApprentissage = { supportMin: 2, parSource: 5 };

/**
 * Liens appris des commandes. Chaque commande est la liste des rayons
 * qu'elle contient. Le poids d'un lien A → B est la part des commandes
 * contenant A qui contiennent aussi B (de 0 à 1).
 */
export const apprendreDesCommandes = (
  commandes: string[][],
  options: OptionsApprentissage = APPRENTISSAGE_PAR_DEFAUT
): LienRayons[] => {
  const avecRayon = new Map<string, number>();
  const ensemble = new Map<string, Map<string, number>>();

  for (const commande of commandes) {
    const rayons = [...new Set(commande)];
    for (const a of rayons) {
      avecRayon.set(a, (avecRayon.get(a) ?? 0) + 1);
      for (const b of rayons) {
        if (a === b) continue;
        const cibles = ensemble.get(a) ?? new Map<string, number>();
        cibles.set(b, (cibles.get(b) ?? 0) + 1);
        ensemble.set(a, cibles);
      }
    }
  }

  const liens: LienRayons[] = [];
  for (const [source, cibles] of ensemble) {
    const total = avecRayon.get(source)!;
    [...cibles]
      .filter(([, n]) => n >= options.supportMin)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, options.parSource)
      .forEach(([cible, n]) => liens.push({ source, cible, poids: Math.round((n / total) * 100) / 100 }));
  }
  return liens;
};

/**
 * Rayons à proposer avec une sélection de rayons sources, du plus au moins
 * lié. Un même lien posé à la main et appris garde son meilleur poids ;
 * une cible liée à plusieurs sources additionne ses poids. Les rayons
 * sources ne se proposent pas eux-mêmes.
 */
export const rayonsComplementaires = (liens: LienRayons[], sources: string[], limite: number): LienRayons[] => {
  const dansSources = new Set(sources);
  const meilleur = new Map<string, LienRayons>();
  for (const lien of liens) {
    if (!dansSources.has(lien.source) || dansSources.has(lien.cible)) continue;
    const cle = `${lien.source}>${lien.cible}`;
    if ((meilleur.get(cle)?.poids ?? -1) < lien.poids) meilleur.set(cle, lien);
  }

  const parCible = new Map<string, LienRayons & { lienFort: number }>();
  for (const lien of meilleur.values()) {
    const actuel = parCible.get(lien.cible);
    const plusFort = !actuel || lien.poids > actuel.lienFort;
    parCible.set(lien.cible, {
      // La source la plus liée explique la proposition (« avec vos ciments »).
      source: plusFort ? lien.source : actuel.source,
      cible: lien.cible,
      poids: (actuel?.poids ?? 0) + lien.poids,
      lienFort: plusFort ? lien.poids : actuel.lienFort,
    });
  }
  return [...parCible.values()]
    .sort((a, b) => b.poids - a.poids)
    .slice(0, limite)
    .map(({ source, cible, poids }) => ({ source, cible, poids: Math.round(poids * 100) / 100 }));
};
