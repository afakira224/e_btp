import { Types } from "mongoose";
import { EntityType } from "../models/user.model.js";
import { imagesFor, type SeedData } from "./build.js";
import { offers as demoOffers, products as demoProducts } from "./catalog.data.js";

// ─────────────────────────────────────────────
//  Seed de volume — complète le catalogue de démonstration jusqu'à :
//    familles × catégories par famille × sous-catégories par catégorie
//    × produits par sous-catégorie   (par défaut 100 × 3 × 50 × 350,
//    soit 15 000 sous-catégories et 5 250 000 produits et offres).
//
//  Les familles, boutiques et commandes de la démonstration sont
//  conservées. Les noms suivent les photos : un rayon « Ciments — gamme 7 »
//  ne contient que des ciments, avec les photos de ciment. Le hasard est
//  déterministe : deux lancements produisent les mêmes données.
//  Les produits sont générés sous-catégorie par sous-catégorie, sans tout
//  garder en mémoire.
// ─────────────────────────────────────────────

export interface VolumeOptions {
  familles: number;
  categoriesParFamille: number;
  sousParCategorie: number;
  produitsParSous: number;
}

export const DEFAULT_VOLUME: VolumeOptions = { familles: 100, categoriesParFamille: 3, sousParCategorie: 50, produitsParSous: 350 };

type Doc = Record<string, unknown> & { _id: Types.ObjectId };

/** Un type d'article : ses photos, son nom de rayon, ses déclinaisons, son prix de référence. */
interface Theme {
  image: string;
  rayon: string;
  label: string;
  variants: string[];
  price: number;
}

const THEMES: Theme[] = [
  { image: "ciment", rayon: "Ciments", label: "Ciment", variants: ["CEM II 42.5 — sac 50 kg", "CEM I 52.5 — sac 50 kg", "CEM II 32.5 — sac 25 kg", "prise mer — sac 50 kg"], price: 92_000 },
  { image: "fer", rayon: "Fers à béton", label: "Fer à béton", variants: ["HA8 — barre 12 m", "HA10 — barre 12 m", "HA12 — barre 12 m", "HA16 — barre 12 m"], price: 145_000 },
  { image: "treillis", rayon: "Treillis soudés", label: "Treillis soudé", variants: ["ST10 — panneau 6×2,4 m", "ST25C — panneau 6×2,4 m", "ST40C — panneau 6×2,4 m"], price: 198_000 },
  { image: "parpaing", rayon: "Parpaings", label: "Parpaing", variants: ["creux 15×20×40 — palette de 60", "creux 20×20×50 — palette de 40", "plein 10×20×40 — palette de 80"], price: 480_000 },
  { image: "gravier", rayon: "Graviers", label: "Gravier", variants: ["concassé 5/15 — tonne", "concassé 15/25 — tonne", "roulé 4/20 — tonne"], price: 310_000 },
  { image: "sable", rayon: "Sables", label: "Sable", variants: ["lavé 0/4 — tonne", "de rivière — tonne", "fin 0/2 — tonne"], price: 265_000 },
  { image: "betonniere", rayon: "Bétonnières", label: "Bétonnière", variants: ["électrique 140 L", "électrique 160 L", "thermique 250 L"], price: 1_780_000 },
  { image: "carrelage", rayon: "Carrelages", label: "Carrelage grès cérame", variants: ["60×60 — beige", "45×45 — gris", "30×60 — anthracite", "60×120 — blanc"], price: 118_000 },
  { image: "colle", rayon: "Colles et joints", label: "Colle à carrelage", variants: ["C1 — 25 kg", "C2ET — 25 kg", "C2S1 — 25 kg"], price: 88_000 },
  { image: "faience", rayon: "Faïences", label: "Faïence murale", variants: ["25×40 — blanc mat", "20×50 — gris clair", "30×90 — effet marbre"], price: 74_000 },
  { image: "plinthe", rayon: "Plinthes", label: "Plinthe céramique", variants: ["8×60 — lot de 10", "7×45 — lot de 12", "8×90 — lot de 8"], price: 52_000 },
  { image: "parquet", rayon: "Parquets", label: "Parquet stratifié", variants: ["chêne clair — 8 mm", "noyer — 10 mm", "gris cendré — 8 mm"], price: 142_000 },
  { image: "peinture-facade", rayon: "Peintures façade", label: "Peinture façade", variants: ["acrylique — 20 L", "pliolite — 15 L", "siloxane — 10 L"], price: 410_000 },
  { image: "peinture-interieure", rayon: "Peintures intérieures", label: "Peinture intérieure", variants: ["mate — 15 L", "satinée — 10 L", "velours — 5 L"], price: 268_000 },
  { image: "sous-couche", rayon: "Sous-couches", label: "Sous-couche", variants: ["universelle — 10 L", "plâtre — 15 L", "fixateur — 5 L"], price: 134_000 },
  { image: "enduit", rayon: "Enduits", label: "Enduit", variants: ["de lissage — 25 kg", "de rebouchage — 15 kg", "de façade — 25 kg"], price: 96_000 },
  { image: "kit-peintre", rayon: "Outils du peintre", label: "Kit rouleau et pinceaux", variants: ["8 pièces", "12 pièces", "façade — 6 pièces"], price: 46_000 },
  { image: "tube-pvc", rayon: "Tubes PVC", label: "Tube PVC évacuation", variants: ["Ø40 — 4 m", "Ø100 — 4 m", "Ø125 — 4 m"], price: 68_000 },
  { image: "mitigeur", rayon: "Mitigeurs", label: "Mitigeur", variants: ["lavabo chromé", "évier bec haut", "douche thermostatique"], price: 186_000 },
  { image: "wc", rayon: "WC et bâtis", label: "Pack WC", variants: ["suspendu avec bâti-support", "à poser sortie horizontale", "compact sans bride"], price: 1_480_000 },
  { image: "chauffe-eau", rayon: "Chauffe-eau", label: "Chauffe-eau électrique", variants: ["50 L", "100 L", "150 L"], price: 1_950_000 },
  { image: "cable", rayon: "Câbles", label: "Câble rigide H07V-U", variants: ["1.5 mm² — 100 m", "2.5 mm² — 100 m", "6 mm² — 50 m"], price: 235_000 },
  { image: "tableau", rayon: "Tableaux électriques", label: "Tableau électrique", variants: ["12 modules pré-équipé", "24 modules", "36 modules"], price: 520_000 },
  { image: "disjoncteur", rayon: "Disjoncteurs", label: "Disjoncteur modulaire", variants: ["10 A — lot de 5", "20 A — lot de 5", "32 A — lot de 3"], price: 128_000 },
  { image: "prise", rayon: "Prises", label: "Prise 2P+T", variants: ["encastrée — lot de 10", "étanche — lot de 4", "double — lot de 5"], price: 94_000 },
  { image: "projecteur", rayon: "Projecteurs", label: "Projecteur LED", variants: ["chantier 30 W", "chantier 50 W", "sur trépied 100 W"], price: 172_000 },
  { image: "perforateur", rayon: "Perforateurs", label: "Perforateur", variants: ["SDS-Plus 800 W", "SDS-Plus 850 W", "SDS-Max 1 500 W"], price: 1_240_000 },
  { image: "meuleuse", rayon: "Meuleuses", label: "Meuleuse d'angle", variants: ["115 mm — 900 W", "125 mm — 1 100 W", "230 mm — 2 200 W"], price: 620_000 },
  { image: "niveau-laser", rayon: "Niveaux laser", label: "Niveau laser", variants: ["croix automatique", "rotatif extérieur", "3 plans 360°"], price: 845_000 },
  { image: "brouette", rayon: "Brouettes", label: "Brouette", variants: ["chantier 90 L", "renforcée 110 L", "bi-roue 160 L"], price: 385_000 },
  { image: "echafaudage", rayon: "Échafaudages", label: "Échafaudage roulant", variants: ["4 m — acier", "6 m — aluminium", "8 m — acier"], price: 2_340_000 },
  { image: "casque", rayon: "Casques et EPI", label: "Casque de chantier", variants: ["+ lot EPI", "ventilé", "avec visière"], price: 78_000 },
];
const themeByImage = new Map(THEMES.map((t) => [t.image, t]));

/** Domaines des familles générées, chacun avec ses catégories et les articles qu'elles vendent. */
const DOMAINS: { nom: string; categories: [string, string[]][] }[] = [
  { nom: "Gros œuvre", categories: [["Liants et bétons", ["ciment", "betonniere"]], ["Aciers et armatures", ["fer", "treillis"]], ["Blocs et agrégats", ["parpaing", "gravier", "sable"]]] },
  { nom: "Revêtements", categories: [["Carrelage", ["carrelage", "colle"]], ["Faïence et plinthes", ["faience", "plinthe"]], ["Parquets", ["parquet"]]] },
  { nom: "Peinture", categories: [["Peintures", ["peinture-facade", "peinture-interieure"]], ["Préparation des supports", ["sous-couche", "enduit"]], ["Outils du peintre", ["kit-peintre"]]] },
  { nom: "Plomberie", categories: [["Évacuation", ["tube-pvc"]], ["Robinetterie", ["mitigeur"]], ["Sanitaire et eau chaude", ["wc", "chauffe-eau"]]] },
  { nom: "Électricité", categories: [["Câblage", ["cable"]], ["Protection", ["tableau", "disjoncteur"]], ["Éclairage et appareillage", ["projecteur", "prise"]]] },
  { nom: "Outillage", categories: [["Perçage", ["perforateur"]], ["Découpe et meulage", ["meuleuse"]], ["Mesure", ["niveau-laser"]]] },
  { nom: "Matériel de chantier", categories: [["Manutention", ["brouette"]], ["Accès en hauteur", ["echafaudage"]], ["Malaxage", ["betonniere"]]] },
  { nom: "Sécurité", categories: [["Protection de la tête", ["casque"]], ["Équipements de protection", ["casque"]], ["Balisage de chantier", ["casque", "projecteur"]]] },
];
const QUALIFIERS = ["Pro", "Chantier", "Habitat", "Industrie", "Rénovation", "Négoce", "Atelier", "Bâtiment", "Travaux publics", "Export", "Express", "Grand compte", "Artisan"];
const BRANDS = ["Sahel Pro", "BatiGuinée", "Atlantique BTP", "Fouta Outils", "Kaloum Industrie", "Niger Équipement", "Loos Distribution", "Simandou Matériaux"];
const COMMUNES = ["Kaloum", "Dixinn", "Matam", "Ratoma", "Matoto", "Kipé", "Lambanyi", "Sonfonia", "Kagbélen", "Coyah", "Dubréka", "Kindia", "Boké", "Kamsar", "Mamou", "Labé"];
const SHOP_PREFIXES = ["Dépôt", "Quincaillerie", "Comptoir", "Maison du bâtiment", "Entrepôt", "Négoce"];

/** PRNG déterministe (mulberry32). */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};

const DAY = 86_400_000;

export interface ExpandedCatalog {
  familles: Doc[];
  categories: Doc[];
  sousCategories: Doc[];
  shops: Doc[];
  users: Doc[];
  logins: (Doc & { password: string })[];
  /** Pour chaque sous-catégorie : son article, sa boutique, ses produits déjà présents. */
  rayons: { sous: Doc; theme: Theme; shopId: Types.ObjectId; existing: number }[];
}

/**
 * Complète la taxonomie, les boutiques et leurs gérants. `base` est le
 * seed de démonstration (buildSeed) ; ses entités sont conservées.
 */
export function expandCatalog(base: SeedData, opts: VolumeOptions, now: Date, password: string): ExpandedCatalog {
  const stamp = (date: Date) => ({ createdAt: date, updatedAt: date, deletedAt: null });
  const since = new Date(now.getTime() - 120 * DAY);
  const familles = [...base.familles];
  const categories = [...base.categories];
  const sousCategories = [...base.sousCategories];
  const shops = [...base.shops];
  const users = [...base.users];
  const logins = [...base.logins];

  // Thèmes des rayons existants : d'après les photos de leurs produits.
  const themesOf = (match: (p: Doc) => boolean) =>
    [...new Set(base.products.filter(match).map((p) => ((p.urlImages as string[])[0] ?? "").replace(/^.*\/(.+)-1\.png$/, "$1")))]
      .map((img) => themeByImage.get(img))
      .filter((t): t is Theme => t !== undefined);

  // ── Boutiques supplémentaires (une par famille générée) ──
  const shopFor = new Map<string, Types.ObjectId>();
  const newShop = (index: number) => {
    const name = `${SHOP_PREFIXES[index % SHOP_PREFIXES.length]} ${COMMUNES[Math.floor(index / SHOP_PREFIXES.length) % COMMUNES.length]}${index >= SHOP_PREFIXES.length * COMMUNES.length ? ` ${index}` : ""}`;
    const slug = `boutique-${String(index + 1).padStart(3, "0")}`;
    const owner = {
      _id: new Types.ObjectId(), prenom: "Gérant", nom: name, email: `gerant.${slug}@btp.com`,
      avatar: null, role: EntityType.SHOP, isEmailVerified: true, createdAt: since, updatedAt: since,
    };
    users.push(owner);
    logins.push({
      _id: new Types.ObjectId(), entityId: owner._id, email: owner.email, password, entityType: EntityType.SHOP,
      emailVerifyToken: null, resetPasswordToken: null, resetPasswordExpires: null, createdAt: since, updatedAt: since,
    });
    const shop = {
      _id: new Types.ObjectId(), ownerId: owner._id, nom: name, description: `Dépôt partenaire spécialisé, livraison sur chantier.`,
      logo: null, telephone: `62${String(2_000_000 + index * 137).padStart(7, "0")}`, email: `contact@${slug}.gn`,
      adresse: `${COMMUNES[index % COMMUNES.length]}, Conakry`, ...stamp(since),
    };
    shops.push(shop);
    return shop._id;
  };

  // Les rayons des familles de la démonstration restent servis par leurs boutiques d'origine.
  const demoShopOfSous = new Map<string, Types.ObjectId>();
  for (const offer of base.productBoutiques) {
    const product = base.products.find((p) => String(p._id) === String(offer.productId));
    if (product) demoShopOfSous.set(String(product.sousCategoryId), offer.boutiqueId as Types.ObjectId);
  }

  // ── Familles ────────────────────────────────
  const generatedFamilles: { doc: Doc; domain: (typeof DOMAINS)[number] }[] = [];
  for (let i = 0; familles.length < opts.familles; i++) {
    const domain = DOMAINS[i % DOMAINS.length]!;
    const qualifier = QUALIFIERS[Math.floor(i / DOMAINS.length) % QUALIFIERS.length]!;
    const round = Math.floor(i / (DOMAINS.length * QUALIFIERS.length));
    const doc: Doc = {
      _id: new Types.ObjectId(), nom: `${domain.nom} — ${qualifier}${round > 0 ? ` ${round + 1}` : ""}`,
      description: `${domain.nom} : gamme ${qualifier.toLowerCase()}.`, image: null, ordre: familles.length + 1, actif: true, ...stamp(since),
    };
    familles.push(doc);
    generatedFamilles.push({ doc, domain });
  }

  // ── Catégories : compléter chaque famille ───
  const categoryThemes = new Map<string, Theme[]>();
  for (const c of base.categories) categoryThemes.set(String(c._id), themesOf((p) => String(p.categoryId) === String(c._id)));
  for (const f of base.familles) {
    const own = categories.filter((c) => String(c.familleId) === String(f._id));
    const pool = own.flatMap((c) => categoryThemes.get(String(c._id)) ?? []);
    for (let n = own.length; n < opts.categoriesParFamille; n++) {
      const doc: Doc = { _id: new Types.ObjectId(), familleId: f._id, nom: `${f.nom} — sélection ${n + 1}`, description: null, image: null, ordre: n + 1, actif: true, ...stamp(since) };
      categories.push(doc);
      categoryThemes.set(String(doc._id), pool.length ? pool : THEMES);
    }
  }
  generatedFamilles.forEach(({ doc: f, domain }, fi) => {
    for (let n = 0; n < opts.categoriesParFamille; n++) {
      const [nom, images] = domain.categories[n % domain.categories.length]!;
      const doc: Doc = {
        _id: new Types.ObjectId(), familleId: f._id, nom: n < domain.categories.length ? nom : `${nom} ${Math.floor(n / domain.categories.length) + 1}`,
        description: null, image: null, ordre: n + 1, actif: true, ...stamp(since),
      };
      categories.push(doc);
      categoryThemes.set(String(doc._id), images.map((img) => themeByImage.get(img)!));
      shopFor.set(String(f._id), shopFor.get(String(f._id)) ?? newShop(fi));
    }
  });

  // ── Sous-catégories : compléter chaque catégorie ──
  const rayons: ExpandedCatalog["rayons"] = [];
  const productsBySous = new Map<string, number>();
  for (const p of base.products) productsBySous.set(String(p.sousCategoryId), (productsBySous.get(String(p.sousCategoryId)) ?? 0) + 1);
  const demoFallbackShop = base.shops[0]!._id;

  const sousByCategorie = new Map<string, Doc[]>();
  for (const s of sousCategories) {
    const k = String(s.categorieId);
    sousByCategorie.set(k, [...(sousByCategorie.get(k) ?? []), s]);
  }
  for (const c of categories) {
    const themes = categoryThemes.get(String(c._id))!;
    const own = sousByCategorie.get(String(c._id)) ?? [];
    const familleShop = shopFor.get(String(c.familleId));
    for (const s of own) {
      const sousThemes = themesOf((p) => String(p.sousCategoryId) === String(s._id));
      rayons.push({
        sous: s, theme: sousThemes[0] ?? themes[0]!, existing: productsBySous.get(String(s._id)) ?? 0,
        shopId: demoShopOfSous.get(String(s._id)) ?? familleShop ?? demoFallbackShop,
      });
    }
    for (let n = own.length; n < opts.sousParCategorie; n++) {
      const theme = themes[n % themes.length]!;
      const doc: Doc = {
        _id: new Types.ObjectId(), categorieId: c._id, nom: `${theme.rayon} — gamme ${n + 1}`, description: null,
        image: imagesFor(theme.image)[0], ordre: n + 1, actif: true, ...stamp(since),
      };
      sousCategories.push(doc);
      const sibling = own.find((s) => demoShopOfSous.has(String(s._id)));
      rayons.push({
        sous: doc, theme, existing: 0,
        shopId: familleShop ?? (sibling ? demoShopOfSous.get(String(sibling._id))! : demoFallbackShop),
      });
    }
  }

  // Images des familles et catégories générées : celles de leur premier rayon.
  const firstRayon = new Map<string, Theme>();
  for (const r of rayons) if (!firstRayon.has(String(r.sous.categorieId))) firstRayon.set(String(r.sous.categorieId), r.theme);
  for (const c of categories) {
    const theme = firstRayon.get(String(c._id));
    if (!c.image) c.image = theme ? imagesFor(theme.image)[0] : null;
  }
  const firstCategorie = new Map<string, Doc>();
  for (const c of categories) if (!firstCategorie.has(String(c.familleId))) firstCategorie.set(String(c.familleId), c);
  for (const f of familles) if (!f.image) f.image = firstCategorie.get(String(f._id))?.image ?? null;

  return { familles, categories, sousCategories, shops, users, logins, rayons };
}

/**
 * Produits et offres manquants, rayon par rayon : chaque lot complète une
 * sous-catégorie jusqu'à `produitsParSous`. Rien n'est gardé en mémoire
 * d'un lot à l'autre.
 */
export function* generateProducts(catalog: ExpandedCatalog, opts: VolumeOptions, now: Date): Generator<{ products: Doc[]; offers: Doc[] }> {
  let serial = 0;
  const familleOf = new Map(catalog.categories.map((c) => [String(c._id), c.familleId]));
  for (const [ri, rayon] of catalog.rayons.entries()) {
    const random = rng(1_000 + ri);
    const { sous, theme, shopId } = rayon;
    const familleId = familleOf.get(String(sous.categorieId));
    const products: Doc[] = [];
    const offers: Doc[] = [];
    for (let n = rayon.existing; n < opts.produitsParSous; n++) {
      serial++;
      const created = new Date(now.getTime() - Math.floor(random() * 180) * DAY - Math.floor(random() * DAY));
      const variant = theme.variants[n % theme.variants.length]!;
      const brand = BRANDS[Math.floor(random() * BRANDS.length)]!;
      const ref = `R${String(serial).padStart(7, "0")}`;
      const product: Doc = {
        _id: new Types.ObjectId(),
        name: `${theme.label} ${variant} — ${brand}`,
        description: `${theme.label} ${variant}, marque ${brand}. Référence ${ref}. Disponible en dépôt et livrable sur chantier à Conakry.`,
        urlImages: imagesFor(theme.image),
        familleId, categoryId: sous.categorieId, sousCategoryId: sous._id,
        createdAt: created, updatedAt: created, deletedAt: null,
      };
      const price = Math.round((theme.price * (0.75 + random() * 0.65)) / 500) * 500;
      const discounted = random() < 0.2;
      const out = random() < 0.05;
      offers.push({
        _id: new Types.ObjectId(), boutiqueId: shopId, productId: product._id, urlImages: imagesFor(theme.image),
        price, discountPrice: discounted ? Math.round((price * (0.8 + random() * 0.15)) / 500) * 500 : null,
        stock: out ? 0 : 1 + Math.floor(random() * 500), isFeatured: random() < 0.005,
        tags: [theme.rayon.toLowerCase(), brand.toLowerCase()],
        rating: Math.round((3.2 + random() * 1.8) * 10) / 10, reviewsCount: Math.floor(random() * 400),
        createdAt: created, updatedAt: created, deletedAt: null,
      });
      products.push(product);
    }
    if (products.length) yield { products, offers };
  }
}

/** Nombre de produits que generateProducts va créer. */
export const plannedProducts = (catalog: ExpandedCatalog, opts: VolumeOptions) =>
  catalog.rayons.reduce((sum, r) => sum + Math.max(0, opts.produitsParSous - r.existing), 0);

export const volumeFromEnv = (env: NodeJS.ProcessEnv): VolumeOptions => {
  const n = (name: string, fallback: number) => {
    const value = Number(env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  return {
    familles: n("SEED_FAMILLES", DEFAULT_VOLUME.familles),
    categoriesParFamille: n("SEED_CATEGORIES_PAR_FAMILLE", DEFAULT_VOLUME.categoriesParFamille),
    sousParCategorie: n("SEED_SOUS_PAR_CATEGORIE", DEFAULT_VOLUME.sousParCategorie),
    produitsParSous: n("SEED_PRODUITS_PAR_SOUS", DEFAULT_VOLUME.produitsParSous),
  };
};
