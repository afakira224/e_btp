import {
  AvancementChantier,
  ETAPES_DU_PROJET,
  Etape,
  etapeSuivante,
  rangEtape,
  type IProjet,
} from "../../models/projet.model.js";

// ─────────────────────────────────────────────
//  Profil d'intérêt d'un client — règles pures, sans base de données.
//
//  Chaque action du client pèse sur l'offre concernée ; les poids sont
//  ensuite reportés sur les rayons (sous-catégories) et les étapes du
//  chantier. Le contrôleur charge les données, ce module décide.
// ─────────────────────────────────────────────

/** Poids d'une action : un achat en dit plus qu'un clic. */
export const POIDS = {
  commande: 6,
  panier: 4,
  favori: 3,
  vue: 2,
} as const;

/** Une consultation ancienne compte moins : la n-ième vue pèse POIDS.vue × 0,85ⁿ. */
export const DECROISSANCE_VUES = 0.85;

/** Seuil à partir duquel l'activité sur une étape fait avancer le chantier (au moins un ajout au panier). */
export const SEUIL_ETAPE_FORTE = POIDS.panier;

/** Identifiants d'offres par type d'action ; `vus` et `commandes` du plus récent au plus ancien. */
export interface Signaux {
  commandes: string[];
  panier: string[];
  favoris: string[];
  vus: string[];
}

/** Poids cumulé de chaque offre selon les actions du client. */
export const poidsParOffre = (signaux: Signaux): Map<string, number> => {
  const poids = new Map<string, number>();
  const ajouter = (id: string, valeur: number) => poids.set(id, (poids.get(id) ?? 0) + valeur);
  for (const id of signaux.commandes) ajouter(id, POIDS.commande);
  for (const id of signaux.panier) ajouter(id, POIDS.panier);
  for (const id of signaux.favoris) ajouter(id, POIDS.favori);
  signaux.vus.forEach((id, rang) => ajouter(id, POIDS.vue * DECROISSANCE_VUES ** rang));
  return poids;
};

/** Reporte des poids d'offres sur une autre clé (rayon, étape…), triés du plus fort au plus faible. */
export const regrouper = (poids: Map<string, number>, cleDe: (offreId: string) => string | undefined): [string, number][] => {
  const total = new Map<string, number>();
  for (const [id, valeur] of poids) {
    const cle = cleDe(id);
    if (cle) total.set(cle, (total.get(cle) ?? 0) + valeur);
  }
  return [...total].sort((a, b) => b[1] - a[1]);
};

export type SourceEtape = "projet" | "activite";

export interface Etapes {
  actuelle: Etape | null;
  suivante: Etape | null;
  source: SourceEtape | null;
}

/**
 * Étape actuelle du chantier, puis la suivante.
 *
 *  1. Ce que le client a dit (avancement), « pas commencé » valant gros œuvre.
 *  2. Ce qu'il fait : une étape où il a mis au panier ou acheté le fait
 *     avancer — s'il achète du carrelage, il est aux revêtements, même s'il
 *     avait répondu « gros œuvre ».
 *  3. Sans réponse ni achat : l'étape qui l'intéresse le plus.
 *  4. Sinon : la première étape des types de projet déclarés.
 */
export const determinerEtapes = (
  projet: IProjet | null | undefined,
  poidsParEtape: [string, number][]
): Etapes => {
  const etapesChantier = poidsParEtape.filter(([e]) => rangEtape(e as Etape) >= 0) as [Etape, number][];

  let actuelle: Etape | null = null;
  let source: SourceEtape | null = null;

  if (projet?.avancement) {
    actuelle = projet.avancement === AvancementChantier.PAS_COMMENCE ? Etape.GROS_OEUVRE : (projet.avancement as unknown as Etape);
    source = "projet";
  }

  const fortes = etapesChantier.filter(([, poids]) => poids >= SEUIL_ETAPE_FORTE).map(([e]) => e);
  const plusAvancee = fortes.sort((a, b) => rangEtape(b) - rangEtape(a))[0];
  if (plusAvancee && (actuelle === null || rangEtape(plusAvancee) > rangEtape(actuelle))) {
    actuelle = plusAvancee;
    source = "activite";
  }

  if (actuelle === null && etapesChantier[0]) {
    actuelle = etapesChantier[0][0];
    source = "activite";
  }

  if (actuelle === null && projet) {
    const declaree = projet.types.flatMap((t) => ETAPES_DU_PROJET[t] ?? [])[0];
    if (declaree) {
      actuelle = declaree;
      source = "projet";
    }
  }

  return { actuelle, suivante: actuelle ? etapeSuivante(actuelle) : null, source };
};

/** Étapes à mettre en avant pour un client sans activité, d'après son projet. */
export const etapesDuProjet = (projet: IProjet | null | undefined): Etape[] =>
  projet ? [...new Set(projet.types.flatMap((t) => ETAPES_DU_PROJET[t] ?? []))] : [];

/**
 * Alterne les rayons : un produit de chaque rayon à tour de rôle, dans
 * l'ordre reçu. Évite une sélection faite de dix ciments.
 */
export const diversifier = <T>(items: T[], rayonDe: (item: T) => string, limite: number): T[] => {
  const files = new Map<string, T[]>();
  for (const item of items) {
    const cle = rayonDe(item);
    files.set(cle, [...(files.get(cle) ?? []), item]);
  }
  const resultat: T[] = [];
  while (resultat.length < limite && [...files.values()].some((f) => f.length > 0)) {
    for (const file of files.values()) {
      const item = file.shift();
      if (item !== undefined) resultat.push(item);
      if (resultat.length >= limite) break;
    }
  }
  return resultat;
};

/** « Ciments, Sables et Graviers ». */
export const enumerer = (noms: string[]): string => {
  if (noms.length <= 1) return noms[0] ?? "";
  return `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}`;
};
