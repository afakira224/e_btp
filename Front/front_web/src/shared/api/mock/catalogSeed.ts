import type { Product, ProductBoutique } from "../../../entities/product";
import type { Shop } from "../../../entities/shop";
import {
  byOrdre,
  type Categorie,
  type Famille,
  type SousCategorie,
} from "../../../entities/taxonomy";
import {
  DiscountType,
  PromotionScope,
  PromotionType,
  type Promotion,
} from "../../../entities/promotion";

// ─────────────────────────────────────────────
//  Jeu de données du catalogue.
//
//  Matériaux de construction, prix en francs guinéens : c'est le métier réel
//  de la plateforme. Les identifiants sont stables et lisibles — un mock n'a
//  pas besoin d'ObjectId aléatoires, et des ids parlants rendent le débogage
//  immédiat.
// ─────────────────────────────────────────────

const iso = (daysAgo: number): string =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

// Les DTO de taxonomie exposent createdAt/updatedAt : on les fournit plutôt
// que de laisser le front découvrir des champs manquants le jour du branchement.
const CREE_LE = iso(120);
const HORODATAGE = { createdAt: CREE_LE, updatedAt: CREE_LE };

// ── Familles ────────────────────────────────
export const FAMILLES: Famille[] = [
  {
    id: "fam-materiaux",
    nom: "Matériaux",
    description: "Tout pour la structure et la maçonnerie.",
    categories: [],
    image: null,
    ...HORODATAGE,
    ordre: 1,
    actif: true,
  },
  {
    id: "fam-equipement",
    nom: "Équipement",
    description: "Outillage, sécurité et second œuvre.",
    categories: [],
    image: null,
    ...HORODATAGE,
    ordre: 2,
    actif: true,
  },
];

// ── Catégories ──────────────────────────────
export const CATEGORIES: Categorie[] = [
  {
    id: "cat-gros-oeuvre",
    familleId: "fam-materiaux",
    nom: "Gros œuvre",
    description: "Ciment, agrégats, fer à béton",
    image: null,
    ...HORODATAGE,
    ordre: 1,
    actif: true,
  },
  {
    id: "cat-revetement",
    familleId: "fam-materiaux",
    nom: "Revêtement",
    description: "Carrelage, faïence, parquet",
    image: null,
    ...HORODATAGE,
    ordre: 2,
    actif: true,
  },
  {
    id: "cat-peinture",
    familleId: "fam-materiaux",
    nom: "Peinture",
    description: "Intérieur, façade, enduits",
    image: null,
    ...HORODATAGE,
    ordre: 3,
    actif: true,
  },
  {
    id: "cat-plomberie",
    familleId: "fam-equipement",
    nom: "Plomberie",
    description: "Tuyauterie, raccords, sanitaire",
    image: null,
    ...HORODATAGE,
    ordre: 4,
    actif: true,
  },
  {
    id: "cat-electricite",
    familleId: "fam-equipement",
    nom: "Électricité",
    description: "Câbles, tableaux, appareillage",
    image: null,
    ...HORODATAGE,
    ordre: 5,
    actif: true,
  },
  {
    id: "cat-outillage",
    familleId: "fam-equipement",
    nom: "Outillage",
    description: "Électroportatif et main",
    image: null,
    ...HORODATAGE,
    ordre: 6,
    actif: true,
  },
];

// ── Sous-catégories ─────────────────────────
export const SOUS_CATEGORIES: SousCategorie[] = [
  // Gros œuvre
  { id: "sc-liants", nom: "Liants", description: "Ciments et chaux", ...HORODATAGE, image: null, ordre: 1, actif: true },
  { id: "sc-granulats", nom: "Granulats", description: "Sables et graviers", ...HORODATAGE, image: null, ordre: 2, actif: true },
  { id: "sc-aciers", nom: "Aciers", description: "Ferraillage et treillis", ...HORODATAGE, image: null, ordre: 3, actif: true },
  { id: "sc-blocs", nom: "Blocs", description: "Parpaings et briques", ...HORODATAGE, image: null, ordre: 4, actif: true },

  // Revêtement
  { id: "sc-carrelage", nom: "Carrelage et faïence", description: "Sol et mur", ...HORODATAGE, image: null, ordre: 1, actif: true },
  { id: "sc-parquet", nom: "Parquet", description: "Stratifié et massif", ...HORODATAGE, image: null, ordre: 2, actif: true },
  { id: "sc-colles", nom: "Colles et joints", description: "Pose et finition", ...HORODATAGE, image: null, ordre: 3, actif: true },

  // Peinture
  { id: "sc-peintures", nom: "Peintures", description: "Intérieur et façade", ...HORODATAGE, image: null, ordre: 1, actif: true },
  { id: "sc-enduits", nom: "Enduits et sous-couches", description: "Préparation des supports", ...HORODATAGE, image: null, ordre: 2, actif: true },
  { id: "sc-outils-peintre", nom: "Outils de peintre", description: "Rouleaux, pinceaux, bacs", ...HORODATAGE, image: null, ordre: 3, actif: true },

  // Plomberie
  { id: "sc-evacuation", nom: "Évacuation", description: "Tubes et raccords PVC", ...HORODATAGE, image: null, ordre: 1, actif: true },
  { id: "sc-robinetterie", nom: "Robinetterie", description: "Mitigeurs et robinets", ...HORODATAGE, image: null, ordre: 2, actif: true },
  { id: "sc-sanitaire", nom: "Sanitaire", description: "WC, lavabos, douches", ...HORODATAGE, image: null, ordre: 3, actif: true },
  { id: "sc-eau-chaude", nom: "Eau chaude", description: "Chauffe-eau et ballons", ...HORODATAGE, image: null, ordre: 4, actif: true },

  // Électricité
  { id: "sc-cables", nom: "Câbles et conducteurs", description: "Rigides et souples", ...HORODATAGE, image: null, ordre: 1, actif: true },
  { id: "sc-protection", nom: "Protection et tableaux", description: "Disjoncteurs et coffrets", ...HORODATAGE, image: null, ordre: 2, actif: true },
  { id: "sc-appareillage", nom: "Appareillage", description: "Prises et interrupteurs", ...HORODATAGE, image: null, ordre: 3, actif: true },
  { id: "sc-eclairage", nom: "Éclairage", description: "Projecteurs et luminaires", ...HORODATAGE, image: null, ordre: 4, actif: true },

  // Outillage
  { id: "sc-electroportatif", nom: "Électroportatif", description: "Perceuses, meuleuses, scies", ...HORODATAGE, image: null, ordre: 1, actif: true },
  { id: "sc-mesure", nom: "Mesure et traçage", description: "Niveaux, lasers, mètres", ...HORODATAGE, image: null, ordre: 2, actif: true },
  { id: "sc-materiel-chantier", nom: "Matériel de chantier", description: "Manutention et accès", ...HORODATAGE, image: null, ordre: 3, actif: true },
  { id: "sc-securite", nom: "Sécurité", description: "EPI et signalisation", ...HORODATAGE, image: null, ordre: 4, actif: true },
];

// Rattachement sous-catégorie → catégorie.
// `SousCategorieResponseDto` n'expose pas de `categorieId` : le lien parent
// est une donnée de construction du mock, pas un champ du DTO. Le front, lui,
// retrouve le parent en parcourant l'arbre des domaines — exactement ce que
// la forme du DTO l'oblige à faire.
const CATEGORIE_PARENTE: Record<string, string> = {
  "sc-liants": "cat-gros-oeuvre",
  "sc-granulats": "cat-gros-oeuvre",
  "sc-aciers": "cat-gros-oeuvre",
  "sc-blocs": "cat-gros-oeuvre",
  "sc-carrelage": "cat-revetement",
  "sc-parquet": "cat-revetement",
  "sc-colles": "cat-revetement",
  "sc-peintures": "cat-peinture",
  "sc-enduits": "cat-peinture",
  "sc-outils-peintre": "cat-peinture",
  "sc-evacuation": "cat-plomberie",
  "sc-robinetterie": "cat-plomberie",
  "sc-sanitaire": "cat-plomberie",
  "sc-eau-chaude": "cat-plomberie",
  "sc-cables": "cat-electricite",
  "sc-protection": "cat-electricite",
  "sc-appareillage": "cat-electricite",
  "sc-eclairage": "cat-electricite",
  "sc-electroportatif": "cat-outillage",
  "sc-mesure": "cat-outillage",
  "sc-materiel-chantier": "cat-outillage",
  "sc-securite": "cat-outillage",
};

// Rattachement produit → sous-catégorie.
// Table à part plutôt qu'un champ de plus sur chaque graine : le jour où la
// taxonomie bouge, c'est ici seulement que ça se corrige.
const SOUS_CATEGORIE_PAR_PRODUIT: Record<string, string> = {
  "ciment-cem2": "sc-liants",
  "gravier-15": "sc-granulats",
  "sable-lave": "sc-granulats",
  "fer-ha12": "sc-aciers",
  "treillis-soude": "sc-aciers",
  "parpaing-15": "sc-blocs",

  "carrelage-60": "sc-carrelage",
  "faience-25": "sc-carrelage",
  "plinthe-ceramique": "sc-carrelage",
  "parquet-stratifie": "sc-parquet",
  "colle-carrelage": "sc-colles",

  "peinture-facade": "sc-peintures",
  "peinture-interieur": "sc-peintures",
  "enduit-lissage": "sc-enduits",
  "sous-couche": "sc-enduits",
  "rouleau-pinceau": "sc-outils-peintre",

  "tube-pvc-100": "sc-evacuation",
  "mitigeur-lavabo": "sc-robinetterie",
  "wc-suspendu": "sc-sanitaire",
  "chauffe-eau-100": "sc-eau-chaude",

  "cable-25": "sc-cables",
  "tableau-12": "sc-protection",
  "disjoncteur-20a": "sc-protection",
  "prise-encastree": "sc-appareillage",
  "projecteur-led": "sc-eclairage",

  "perforateur-sds": "sc-electroportatif",
  "meuleuse-125": "sc-electroportatif",
  "niveau-laser": "sc-mesure",
  "brouette-90": "sc-materiel-chantier",
  "echafaudage-roulant": "sc-materiel-chantier",
  "betonniere-160": "sc-materiel-chantier",
  "casque-securite": "sc-securite",
};

// ── Fiches produit ──────────────────────────
interface Seed {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  discountPrice?: number;
  stock: number;
  isFeatured: boolean;
  tags: string[];
  rating: number;
  reviewsCount: number;
  ageDays: number;
  boutique: string;
}

const SEEDS: Seed[] = [
  {
    id: "ciment-cem2",
    name: "Ciment CEM II 42.5 — sac 50 kg",
    description:
      "Ciment Portland composé, prise rapide. Convient aux dalles, chapes et maçonnerie courante.",
    categoryId: "cat-gros-oeuvre",
    price: 92_000,
    discountPrice: 78_000,
    stock: 340,
    isFeatured: true,
    tags: ["ciment", "maçonnerie"],
    rating: 4.7,
    reviewsCount: 312,
    ageDays: 4,
    boutique: "Dépôt Matam",
  },
  {
    id: "fer-ha12",
    name: "Fer à béton HA12 — barre 12 m",
    description:
      "Acier haute adhérence nuance FeE500, conforme aux normes de ferraillage.",
    categoryId: "cat-gros-oeuvre",
    price: 145_000,
    stock: 128,
    isFeatured: true,
    tags: ["acier", "ferraillage"],
    rating: 4.6,
    reviewsCount: 184,
    ageDays: 9,
    boutique: "Dépôt Matam",
  },
  {
    id: "carrelage-60",
    name: "Carrelage grès cérame 60×60",
    description:
      "Finition mate antidérapante, classe PEI IV. Vendu au carton de 4 dalles, 1,44 m².",
    categoryId: "cat-revetement",
    price: 118_000,
    discountPrice: 94_500,
    stock: 76,
    isFeatured: true,
    tags: ["carrelage", "sol"],
    rating: 4.8,
    reviewsCount: 203,
    ageDays: 2,
    boutique: "Kaloum Céramique",
  },
  {
    id: "peinture-facade",
    name: "Peinture façade acrylique — 20 L",
    description:
      "Hydrofuge et résistante aux UV, tenue renforcée en climat humide. Rendement 10 m²/L.",
    categoryId: "cat-peinture",
    price: 410_000,
    discountPrice: 328_000,
    stock: 42,
    isFeatured: true,
    tags: ["peinture", "façade"],
    rating: 4.5,
    reviewsCount: 97,
    ageDays: 11,
    boutique: "Coloris Conakry",
  },
  {
    id: "tube-pvc-100",
    name: "Tube PVC évacuation Ø100 — 4 m",
    description:
      "Tube rigide NF pour eaux usées, assemblage par collage ou joint.",
    categoryId: "cat-plomberie",
    price: 68_000,
    stock: 210,
    isFeatured: false,
    tags: ["pvc", "évacuation"],
    rating: 4.4,
    reviewsCount: 58,
    ageDays: 6,
    boutique: "Sanitaire Plus",
  },
  {
    id: "cable-25",
    name: "Câble rigide H07V-U 2.5 mm² — 100 m",
    description:
      "Conducteur cuivre pour circuits prises. Gaine PVC, couronne de 100 mètres.",
    categoryId: "cat-electricite",
    price: 235_000,
    discountPrice: 199_000,
    stock: 64,
    isFeatured: true,
    tags: ["câble", "cuivre"],
    rating: 4.6,
    reviewsCount: 141,
    ageDays: 3,
    boutique: "Volta Électrique",
  },
  {
    id: "perforateur-sds",
    name: "Perforateur burineur SDS-Plus 850 W",
    description:
      "Trois modes, force de frappe 2,8 J. Livré en coffret avec jeu de forets.",
    categoryId: "cat-outillage",
    price: 1_240_000,
    discountPrice: 992_000,
    stock: 18,
    isFeatured: true,
    tags: ["outillage", "électroportatif"],
    rating: 4.9,
    reviewsCount: 268,
    ageDays: 1,
    boutique: "Pro Outillage",
  },
  {
    id: "brouette-90",
    name: "Brouette chantier 90 L — roue gonflable",
    description:
      "Caisse acier renforcée, châssis tubulaire. Charge utile 150 kg.",
    categoryId: "cat-outillage",
    price: 385_000,
    stock: 3,
    isFeatured: false,
    tags: ["chantier", "manutention"],
    rating: 4.3,
    reviewsCount: 74,
    ageDays: 14,
    boutique: "Pro Outillage",
  },
  {
    id: "enduit-lissage",
    name: "Enduit de lissage intérieur — 25 kg",
    description:
      "Poudre à gâcher pour finition murale, application manuelle ou mécanique.",
    categoryId: "cat-peinture",
    price: 96_000,
    stock: 0,
    isFeatured: false,
    tags: ["enduit", "finition"],
    rating: 4.2,
    reviewsCount: 39,
    ageDays: 21,
    boutique: "Coloris Conakry",
  },
  {
    id: "gravier-15",
    name: "Gravier concassé 15/25 — tonne",
    description:
      "Granulat lavé pour béton et fondations. Livraison benne sur chantier.",
    categoryId: "cat-gros-oeuvre",
    price: 310_000,
    stock: 95,
    isFeatured: false,
    tags: ["granulat", "béton"],
    rating: 4.5,
    reviewsCount: 112,
    ageDays: 17,
    boutique: "Dépôt Matam",
  },
  {
    id: "tableau-12",
    name: "Tableau électrique 12 modules pré-équipé",
    description:
      "Coffret avec disjoncteur de branchement et interrupteur différentiel 30 mA.",
    categoryId: "cat-electricite",
    price: 520_000,
    discountPrice: 442_000,
    stock: 27,
    isFeatured: false,
    tags: ["tableau", "sécurité"],
    rating: 4.7,
    reviewsCount: 88,
    ageDays: 8,
    boutique: "Volta Électrique",
  },
  {
    id: "faience-25",
    name: "Faïence murale 25×40 — blanc mat",
    description:
      "Carreaux muraux pour cuisine et salle de bain. Carton de 1,5 m².",
    categoryId: "cat-revetement",
    price: 74_000,
    stock: 156,
    isFeatured: false,
    tags: ["faïence", "mur"],
    rating: 4.4,
    reviewsCount: 66,
    ageDays: 5,
    boutique: "Kaloum Céramique",
  },

  // ── Fonds de catalogue ──────────────────────
  // Ces références n'apparaissent ni en arrivages ni en meilleures ventes :
  // elles alimentent le fil de recommandations, qui a besoin de plusieurs
  // pages pour que le défilement infini ait un sens.
  {
    id: "sable-lave",
    name: "Sable lavé 0/4 — tonne",
    description: "Sable de rivière lavé et criblé, pour mortier et enduit.",
    categoryId: "cat-gros-oeuvre",
    price: 265_000,
    stock: 140,
    isFeatured: false,
    tags: ["granulat", "mortier"],
    rating: 4.3,
    reviewsCount: 54,
    ageDays: 46,
    boutique: "Dépôt Matam",
  },
  {
    id: "parpaing-15",
    name: "Parpaing creux 15×20×40 — palette de 60",
    description: "Bloc béton creux pour murs porteurs et cloisons.",
    categoryId: "cat-gros-oeuvre",
    price: 480_000,
    discountPrice: 432_000,
    stock: 58,
    isFeatured: false,
    tags: ["bloc", "maçonnerie"],
    rating: 4.5,
    reviewsCount: 129,
    ageDays: 52,
    boutique: "Dépôt Matam",
  },
  {
    id: "treillis-soude",
    name: "Treillis soudé ST25C — panneau 6×2,4 m",
    description: "Armature pour dalles et planchers, maille 150×150 mm.",
    categoryId: "cat-gros-oeuvre",
    price: 198_000,
    stock: 72,
    isFeatured: false,
    tags: ["acier", "dalle"],
    rating: 4.6,
    reviewsCount: 81,
    ageDays: 38,
    boutique: "Dépôt Matam",
  },
  {
    id: "colle-carrelage",
    name: "Colle à carrelage C2ET — 25 kg",
    description: "Mortier-colle amélioré, déformable, pour sol et mur.",
    categoryId: "cat-revetement",
    price: 88_000,
    stock: 184,
    isFeatured: false,
    tags: ["colle", "carrelage"],
    rating: 4.5,
    reviewsCount: 97,
    ageDays: 41,
    boutique: "Kaloum Céramique",
  },
  {
    id: "plinthe-ceramique",
    name: "Plinthe céramique 8×60 — lot de 10",
    description: "Finition de sol assortie aux carrelages grès cérame.",
    categoryId: "cat-revetement",
    price: 52_000,
    stock: 96,
    isFeatured: false,
    tags: ["plinthe", "finition"],
    rating: 4.1,
    reviewsCount: 33,
    ageDays: 60,
    boutique: "Kaloum Céramique",
  },
  {
    id: "parquet-stratifie",
    name: "Parquet stratifié chêne clair — 8 mm",
    description: "Lames clipsables classe 32, carton de 2,2 m².",
    categoryId: "cat-revetement",
    price: 142_000,
    discountPrice: 121_000,
    stock: 64,
    isFeatured: false,
    tags: ["parquet", "sol"],
    rating: 4.4,
    reviewsCount: 71,
    ageDays: 35,
    boutique: "Kaloum Céramique",
  },
  {
    id: "peinture-interieur",
    name: "Peinture acrylique intérieure mate — 15 L",
    description: "Monocouche lessivable, faible odeur, blanc mat.",
    categoryId: "cat-peinture",
    price: 268_000,
    stock: 88,
    isFeatured: false,
    tags: ["peinture", "intérieur"],
    rating: 4.6,
    reviewsCount: 156,
    ageDays: 44,
    boutique: "Coloris Conakry",
  },
  {
    id: "sous-couche",
    name: "Sous-couche universelle — 10 L",
    description: "Primaire d'accrochage pour supports poreux et plâtre.",
    categoryId: "cat-peinture",
    price: 134_000,
    stock: 52,
    isFeatured: false,
    tags: ["primaire", "préparation"],
    rating: 4.2,
    reviewsCount: 42,
    ageDays: 57,
    boutique: "Coloris Conakry",
  },
  {
    id: "rouleau-pinceau",
    name: "Kit rouleau et pinceaux — 8 pièces",
    description: "Manchons anti-gouttes, grille et bac de peintre inclus.",
    categoryId: "cat-peinture",
    price: 46_000,
    discountPrice: 36_800,
    stock: 210,
    isFeatured: false,
    tags: ["outil", "peinture"],
    rating: 4.0,
    reviewsCount: 118,
    ageDays: 49,
    boutique: "Coloris Conakry",
  },
  {
    id: "wc-suspendu",
    name: "Pack WC suspendu avec bâti-support",
    description: "Bâti autoportant, cuvette céramique et plaque de commande.",
    categoryId: "cat-plomberie",
    price: 1_480_000,
    discountPrice: 1_258_000,
    stock: 12,
    isFeatured: false,
    tags: ["sanitaire", "wc"],
    rating: 4.7,
    reviewsCount: 64,
    ageDays: 40,
    boutique: "Sanitaire Plus",
  },
  {
    id: "mitigeur-lavabo",
    name: "Mitigeur lavabo chromé — cartouche céramique",
    description: "Économiseur d'eau intégré, flexibles de raccordement fournis.",
    categoryId: "cat-plomberie",
    price: 186_000,
    stock: 78,
    isFeatured: false,
    tags: ["robinetterie", "lavabo"],
    rating: 4.3,
    reviewsCount: 89,
    ageDays: 54,
    boutique: "Sanitaire Plus",
  },
  {
    id: "chauffe-eau-100",
    name: "Chauffe-eau électrique 100 L",
    description: "Cuve émaillée, résistance stéatite, thermostat réglable.",
    categoryId: "cat-plomberie",
    price: 1_950_000,
    stock: 9,
    isFeatured: false,
    tags: ["chauffe-eau", "sanitaire"],
    rating: 4.5,
    reviewsCount: 47,
    ageDays: 63,
    boutique: "Sanitaire Plus",
  },
  {
    id: "disjoncteur-20a",
    name: "Disjoncteur modulaire 20 A — lot de 5",
    description: "Courbe C, pouvoir de coupure 4,5 kA, montage sur rail DIN.",
    categoryId: "cat-electricite",
    price: 128_000,
    stock: 134,
    isFeatured: false,
    tags: ["protection", "tableau"],
    rating: 4.6,
    reviewsCount: 102,
    ageDays: 37,
    boutique: "Volta Électrique",
  },
  {
    id: "prise-encastree",
    name: "Prise 2P+T encastrée — lot de 10",
    description: "16 A, obturateurs de sécurité, finition blanche.",
    categoryId: "cat-electricite",
    price: 94_000,
    discountPrice: 79_900,
    stock: 176,
    isFeatured: false,
    tags: ["appareillage", "prise"],
    rating: 4.4,
    reviewsCount: 138,
    ageDays: 43,
    boutique: "Volta Électrique",
  },
  {
    id: "projecteur-led",
    name: "Projecteur LED chantier 50 W",
    description: "Étanche IP65, 4 500 lumens, support orientable.",
    categoryId: "cat-electricite",
    price: 172_000,
    stock: 46,
    isFeatured: false,
    tags: ["éclairage", "chantier"],
    rating: 4.5,
    reviewsCount: 76,
    ageDays: 48,
    boutique: "Volta Électrique",
  },
  {
    id: "meuleuse-125",
    name: "Meuleuse d'angle 125 mm — 1 100 W",
    description: "Démarrage progressif, protection anti-redémarrage.",
    categoryId: "cat-outillage",
    price: 620_000,
    discountPrice: 527_000,
    stock: 24,
    isFeatured: false,
    tags: ["outillage", "électroportatif"],
    rating: 4.6,
    reviewsCount: 192,
    ageDays: 39,
    boutique: "Pro Outillage",
  },
  {
    id: "niveau-laser",
    name: "Niveau laser croix automatique",
    description: "Portée 20 m, mise à niveau automatique, trépied inclus.",
    categoryId: "cat-outillage",
    price: 845_000,
    stock: 15,
    isFeatured: false,
    tags: ["mesure", "laser"],
    rating: 4.8,
    reviewsCount: 143,
    ageDays: 45,
    boutique: "Pro Outillage",
  },
  {
    id: "echafaudage-roulant",
    name: "Échafaudage roulant 4 m — acier",
    description: "Plateforme antidérapante, garde-corps et roues freinées.",
    categoryId: "cat-outillage",
    price: 2_340_000,
    stock: 6,
    isFeatured: false,
    tags: ["chantier", "accès"],
    rating: 4.4,
    reviewsCount: 38,
    ageDays: 66,
    boutique: "Pro Outillage",
  },
  {
    id: "betonniere-160",
    name: "Bétonnière électrique 160 L",
    description: "Cuve acier, moteur 750 W, châssis renforcé sur roues.",
    categoryId: "cat-outillage",
    price: 1_780_000,
    discountPrice: 1_602_000,
    stock: 11,
    isFeatured: false,
    tags: ["chantier", "béton"],
    rating: 4.7,
    reviewsCount: 121,
    ageDays: 51,
    boutique: "Pro Outillage",
  },
  {
    id: "casque-securite",
    name: "Casque de chantier + lot EPI",
    description: "Casque, gants, lunettes et gilet haute visibilité.",
    categoryId: "cat-outillage",
    price: 78_000,
    stock: 240,
    isFeatured: false,
    tags: ["sécurité", "epi"],
    rating: 4.2,
    reviewsCount: 167,
    ageDays: 58,
    boutique: "Pro Outillage",
  },
];

// ── Construction des documents ──────────────
export const CATEGORIES_TREE: Categorie[] = [...CATEGORIES]
  .sort(byOrdre)
  .map((categorie) => ({
    ...categorie,
    sousCategories: SOUS_CATEGORIES.filter(
      (sous) => CATEGORIE_PARENTE[sous.id] === categorie.id
    ).sort(byOrdre),
  }));

export const FAMILLES_TREE: Famille[] = [...FAMILLES]
  .sort(byOrdre)
  .map((famille) => ({
    ...famille,
    categories: CATEGORIES_TREE.filter(
      (categorie) => categorie.familleId === famille.id
    ),
  }));

// ── Boutiques ───────────────────────────────
const shopId = (nom: string) => `shop-${nom.toLowerCase().replace(/\s+/g, "-")}`;

export const SHOPS: Shop[] = [
  {
    nom: "Dépôt Matam",
    adresse: "Matam, Conakry",
    description:
      "Gros œuvre en quantité : ciment, fer à béton, agrégats et parpaings, livrés sur chantier.",
  },
  {
    nom: "Kaloum Céramique",
    adresse: "Kaloum, Conakry",
    description: "Carrelage, faïence et colles : grès cérame, finitions et conseils de pose.",
  },
  {
    nom: "Coloris Conakry",
    adresse: "Ratoma, Conakry",
    description: "Peintures intérieures et façades, enduits et outillage du peintre.",
  },
  {
    nom: "Sanitaire Plus",
    adresse: "Matoto, Conakry",
    description: "Plomberie et sanitaire : tuyauterie PVC, robinetterie, WC et chauffe-eau.",
  },
  {
    nom: "Volta Électrique",
    adresse: "Dixinn, Conakry",
    description: "Câbles, tableaux, disjoncteurs et appareillage pour le bâtiment.",
  },
  {
    nom: "Pro Outillage",
    adresse: "Matoto, Conakry",
    description: "Outillage électroportatif, matériel de chantier et équipements de sécurité.",
  },
].map((shop) => ({
  id: shopId(shop.nom),
  ownerId: `own-${shopId(shop.nom)}`,
  nom: shop.nom,
  description: shop.description,
  logo: null,
  // Sans accents : une adresse e-mail accentuée est refusée par la plupart
  // des serveurs de messagerie.
  email: `contact@${shopId(shop.nom).normalize("NFD").replace(/[\u0300-\u036f]/g, "")}.gn`,
  adresse: shop.adresse,
  ...HORODATAGE,
}));

// ── Construction des DTO ────────────────────
//
//  `toProductResponseDto` imbrique la taxonomie : `familles`, `categories`
//  et `sousCategories` sont des tableaux obtenus par filtrage sur
//  l'identifiant du produit — donc d'au plus un élément. On reproduit ce
//  choix tel quel, y compris sa redondance : c'est ce que le front recevra.
export const PRODUCTS: Product[] = SEEDS.map((seed) => {
  const categorie = CATEGORIES_TREE.find((candidate) => candidate.id === seed.categoryId);
  const famille = FAMILLES_TREE.find(
    (candidate) => candidate.id === categorie?.familleId
  );
  const sousId = SOUS_CATEGORIE_PAR_PRODUIT[seed.id] ?? "";
  const sous = SOUS_CATEGORIES.find((candidate) => candidate.id === sousId);

  return {
    id: `prd-${seed.id}`,
    name: seed.name,
    description: seed.description,
    urlImages: [],
    familles: famille ? [famille] : [],
    categories: categorie ? [categorie] : [],
    sousCategories: sous ? [sous] : [],
    createdAt: iso(seed.ageDays),
    updatedAt: iso(seed.ageDays),
  };
});

/**
 * Offres, telles que `toProductBoutiqueResponseDto` les renvoie : `boutique`
 * et `product` imbriqués, pas d'identifiant de boutique nu, et
 * `discountPrice` absent — et non `null` — quand il n'y a pas de remise.
 */
export const OFFERS: ProductBoutique[] = SEEDS.map((seed, index) => {
  const product = PRODUCTS[index];
  if (!product) throw new Error("Jeu de données du catalogue incohérent.");

  const boutique = SHOPS.find((candidate) => candidate.id === shopId(seed.boutique));
  const cree = iso(seed.ageDays);

  return {
    id: `off-${seed.id}`,
    productId: product.id,
    ...(boutique ? { boutique } : {}),
    product,
    urlImages: [],
    price: seed.price,
    ...(seed.discountPrice !== undefined ? { discountPrice: seed.discountPrice } : {}),
    stock: seed.stock,
    isFeatured: seed.isFeatured,
    tags: seed.tags,
    rating: seed.rating,
    reviewsCount: seed.reviewsCount,
    createdAt: cree,
    updatedAt: cree,
  };
});

/** Alias de lecture : le catalogue, c'est la liste des offres. */
export const CATALOG = OFFERS;

// ── Promotions ──────────────────────────────
export const PROMOTIONS: Promotion[] = [
  {
    id: "promo-flash-chantier",
    nom: "Déstockage chantier",
    description: "Jusqu'à 20 % sur une sélection de matériaux.",
    type: PromotionType.FLASH_SALE,
    scope: PromotionScope.PRODUCT_BOUTIQUE,
    discountType: DiscountType.PERCENTAGE,
    discountValue: 20,
    code: null,
    startDate: iso(1),
    // Fenêtre volontairement longue : le compte à rebours reste vivant
    // quelle que soit la date à laquelle la maquette est ouverte.
    endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
    productBoutiqueIds: CATALOG.filter(
      (item) => item.discountPrice !== undefined
    ).map((item) => item.id),
    actif: true,
  },
];

// ─────────────────────────────────────────────
//  Arbre des domaines.
//  Le back renvoie les familles avec leurs catégories imbriquées
//  (`toFamilleResponseDto`) : le mock reproduit cette forme, sinon le menu
//  de navigation devrait recroiser deux listes lui-même.
// ─────────────────────────────────────────────
