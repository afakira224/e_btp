import type { Request, Response } from "express";
import { Types } from "mongoose";
import { validationResult } from "express-validator";
import { Product, productBoutique, type IProductBoutique } from "../models/product.model.js";
import { Categorie } from "../models/categorie.model.js";
import { SousCategorie } from "../models/sousCategorie.model.js";
import { Complementarite } from "../models/complementarite.model.js";
import { User } from "../models/user.model.js";
import { Order, ORDER_STATUSES_WITHOUT_SALE } from "../models/order.model.js";
import { Cart } from "../models/cart.model.js";
import { Wishlist } from "../models/wishlist.model.js";
import { RecentlyViewed } from "../models/recentlyViewed.model.js";
import { ETAPE_LIBELLE, TYPE_PROJET_LIBELLE, Etape, type IProjet } from "../models/projet.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { enrichProductBoutiques } from "../shared/helpers/productBoutique.helper.js";
import type { ProductBoutiqueResponseDto } from "../shared/interfaces/product.interfaces.js";
import { lireIds, MAX_VUS, type PageRecommandation } from "../shared/forms/recommandation.form.js";
import {
  determinerEtapes,
  diversifier,
  enumerer,
  etapesDuProjet,
  poidsParOffre,
  regrouper,
  type Etapes,
  type Signaux,
} from "../shared/recommandation/profil.js";
import { rayonsComplementaires, type LienRayons } from "../shared/recommandation/complements.js";

// ─────────────────────────────────────────────
//  Recommandations personnalisées.
//
//  Le profil du client (rayons qui l'intéressent, étape de son chantier)
//  est recalculé à chaque appel depuis ce qu'il a fait : commandes,
//  panier, favoris, produits vus — et ce qu'il a dit de son projet.
//  Un visiteur sans compte envoie ses produits vus (historique gardé
//  dans son navigateur).
//
//  Chaque bloc porte une phrase qui explique pourquoi il est proposé.
//  Les requêtes restent bornées : on lit au plus PRODUITS_PAR_RAYON
//  produits par rayon, quel que soit le volume du catalogue.
// ─────────────────────────────────────────────

const PRODUITS_PAR_RAYON = 400;
const JOURS_NOUVEAUTE = 30;

export interface BlocRecommandation {
  cle: string;
  titre: string;
  raison: string;
  produits: ProductBoutiqueResponseDto[];
}

export interface RecommandationsDto {
  /** Faux : rien n'est connu du client, la page garde ses listes habituelles. */
  personnalise: boolean;
  profil: {
    rayons: { id: string; nom: string }[];
    etapeActuelle: { cle: Etape; libelle: string } | null;
    etapeSuivante: { cle: Etape; libelle: string } | null;
    projet: IProjet | null;
  };
  blocs: BlocRecommandation[];
}

interface BlocBrut {
  cle: string;
  titre: string;
  raison: string;
  offres: IProductBoutique[];
}

/** Où se range une offre : rayon, catégorie, famille. */
interface Situation {
  sous: string;
  categorie: string;
  famille: string;
}

const oid = (id: string) => new Types.ObjectId(id);
const etape = (cle: Etape | null) => (cle ? { cle, libelle: ETAPE_LIBELLE[cle] } : null);

// ─────────────────────────────────────────────
//  Lecture des données
// ─────────────────────────────────────────────

/** Ce que le client a fait (et, connecté, ce qu'il a dit de son projet). */
async function chargerClient(userId: string | undefined, vusLocaux: string[]): Promise<{ signaux: Signaux; projet: IProjet | null }> {
  if (!userId) {
    return { signaux: { commandes: [], panier: [], favoris: [], vus: vusLocaux.slice(0, MAX_VUS) }, projet: null };
  }

  const [user, commandes, panier, favoris, vus] = await Promise.all([
    User.findById(userId).select("projet").lean(),
    Order.find({ userId, status: { $nin: ORDER_STATUSES_WITHOUT_SALE } })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("items.productBoutiqueId")
      .lean(),
    Cart.findOne({ userId }).select("items.productBoutiqueId").lean(),
    Wishlist.findOne({ userId }).select("items.productBoutiqueId").lean(),
    RecentlyViewed.findOne({ userId }).select("items").lean(),
  ]);

  const vusServeur = [...(vus?.items ?? [])]
    .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
    .map((i) => String(i.productBoutiqueId));

  return {
    signaux: {
      commandes: (commandes ?? []).flatMap((o) => o.items.map((i) => String(i.productBoutiqueId))),
      panier: (panier?.items ?? []).map((i) => String(i.productBoutiqueId)),
      favoris: (favoris?.items ?? []).map((i) => String(i.productBoutiqueId)),
      vus: [...new Set([...vusServeur, ...vusLocaux])].slice(0, MAX_VUS),
    },
    projet: (user?.projet as IProjet | null | undefined) ?? null,
  };
}

/** Rayon, catégorie et famille de chaque offre. */
async function situerOffres(ids: string[]): Promise<Map<string, Situation>> {
  if (ids.length === 0) return new Map();
  const offres = await productBoutique.find({ _id: { $in: ids.map(oid) } }).select("productId").lean();
  const produits = await Product.find({ _id: { $in: offres.map((o) => o.productId) } })
    .select("sousCategoryId categoryId familleId")
    .lean();
  const parProduit = new Map(produits.map((p) => [String(p._id), p]));
  const situation = new Map<string, Situation>();
  for (const o of offres) {
    const p = parProduit.get(String(o.productId));
    if (p) situation.set(String(o._id), { sous: String(p.sousCategoryId), categorie: String(p.categoryId), famille: String(p.familleId) });
  }
  return situation;
}

const nomsDesRayons = async (ids: string[]): Promise<Map<string, string>> => {
  if (ids.length === 0) return new Map();
  const sous = await SousCategorie.find({ _id: { $in: ids.map(oid) } }).select("nom").lean();
  return new Map(sous.map((s) => [String(s._id), s.nom]));
};

/**
 * Rayons représentatifs d'une étape : le premier rayon de quelques
 * catégories de cette étape, de préférence dans les familles que le client
 * fréquente déjà.
 */
async function rayonsDeLEtape(cible: Etape, familles: string[], max = 6): Promise<string[]> {
  let categories = familles.length
    ? await Categorie.find({ etape: cible, familleId: { $in: familles.map(oid) }, actif: true }).select("_id").limit(max).lean()
    : [];
  if (categories.length === 0) {
    categories = await Categorie.find({ etape: cible, actif: true }).sort({ ordre: 1 }).select("_id").limit(max).lean();
  }
  const premiers = await Promise.all(
    categories.map((c) => SousCategorie.findOne({ categorieId: c._id, actif: true }).sort({ ordre: 1 }).select("_id").lean())
  );
  return premiers.filter((s) => s !== null).map((s) => String(s._id));
}

/**
 * Offres en stock d'une liste de rayons, un rayon à tour de rôle. Retient
 * les offres déjà montrées pour qu'aucun produit n'apparaisse dans deux
 * blocs de la même page.
 */
class Vitrine {
  private produits = new Map<string, Promise<Types.ObjectId[]>>();
  private montrees = new Set<string>();

  constructor(private exclues: Set<string>) {}

  private produitsDuRayon(sous: string): Promise<Types.ObjectId[]> {
    let ids = this.produits.get(sous);
    if (!ids) {
      ids = Product.find({ sousCategoryId: oid(sous) })
        .select("_id")
        .limit(PRODUITS_PAR_RAYON)
        .lean()
        .then((list) => list.map((p) => p._id as Types.ObjectId));
      this.produits.set(sous, ids);
    }
    return ids;
  }

  private ecartees(): Types.ObjectId[] {
    return [...this.exclues, ...this.montrees].map(oid);
  }

  /** Retient ces offres comme montrées. */
  marquer(offres: IProductBoutique[]): IProductBoutique[] {
    for (const o of offres) this.montrees.add(String(o._id));
    return offres;
  }

  async parRayons(
    rayons: string[],
    options: { limite: number; filtre?: Record<string, unknown>; tri?: Record<string, 1 | -1> }
  ): Promise<IProductBoutique[]> {
    if (rayons.length === 0) return [];
    const parRayon = Math.max(2, Math.ceil(options.limite / rayons.length) + 1);
    const ecartees = this.ecartees();
    const lots = await Promise.all(
      rayons.map(async (sous) => {
        const ids = await this.produitsDuRayon(sous);
        if (ids.length === 0) return [];
        const offres = await productBoutique
          .find({ productId: { $in: ids }, stock: { $gt: 0 }, _id: { $nin: ecartees }, ...options.filtre })
          .sort(options.tri ?? { isFeatured: -1, reviewsCount: -1 })
          .limit(parRayon);
        return offres.map((offre) => ({ sous, offre }));
      })
    );
    return this.marquer(diversifier(lots.flat(), (x) => x.sous, options.limite).map((x) => x.offre));
  }

  /** Offres données dans l'ordre reçu, en stock et pas encore montrées. */
  async parIds(ids: string[], limite: number): Promise<IProductBoutique[]> {
    const ecartees = new Set([...this.exclues, ...this.montrees]);
    const voulues = ids.filter((id) => !ecartees.has(id));
    if (voulues.length === 0) return [];
    const offres = await productBoutique.find({ _id: { $in: voulues.map(oid) }, stock: { $gt: 0 } });
    const parId = new Map(offres.map((o) => [String(o._id), o]));
    return this.marquer(voulues.flatMap((id) => parId.get(id) ?? []).slice(0, limite));
  }
}

/** Liens « acheté avec » partant de ces rayons (règles et commandes). */
async function liensDepuis(sources: string[]): Promise<LienRayons[]> {
  if (sources.length === 0) return [];
  const liens = await Complementarite.find({ source: { $in: sources.map(oid) } })
    .sort({ poids: -1 })
    .limit(sources.length * 10)
    .lean();
  return liens.map((l) => ({ source: String(l.source), cible: String(l.cible), poids: l.poids }));
}

/** Filtre « en promotion » : une remise existe et elle est inférieure au prix (null < prix pour MongoDB). */
const EN_PROMOTION = { discountPrice: { $ne: null }, $expr: { $lt: ["$discountPrice", "$price"] } };

// ─────────────────────────────────────────────
//  Profil
// ─────────────────────────────────────────────

interface Profil {
  signaux: Signaux;
  projet: IProjet | null;
  situation: Map<string, Situation>;
  /** Rayons du plus au moins intéressant. */
  rayons: string[];
  familles: string[];
  etapes: Etapes;
  noms: Map<string, string>;
}

async function construireProfil(userId: string | undefined, vusLocaux: string[]): Promise<Profil> {
  const { signaux, projet } = await chargerClient(userId, vusLocaux);
  const poids = poidsParOffre(signaux);
  const situation = await situerOffres([...poids.keys()]);

  const categories = [...new Set([...situation.values()].map((s) => s.categorie))];
  const etapeParCategorie = new Map(
    categories.length
      ? (await Categorie.find({ _id: { $in: categories.map(oid) } }).select("etape").lean()).map((c) => [String(c._id), c.etape])
      : []
  );

  const rayons = regrouper(poids, (id) => situation.get(id)?.sous).map(([sous]) => sous);
  const familles = regrouper(poids, (id) => situation.get(id)?.famille).map(([famille]) => famille);
  const parEtape = regrouper(poids, (id) => {
    const s = situation.get(id);
    return s ? etapeParCategorie.get(s.categorie) : undefined;
  });
  const etapes = determinerEtapes(projet, parEtape);
  const noms = await nomsDesRayons(rayons.slice(0, 8));

  return { signaux, projet, situation, rayons, familles, etapes, noms };
}

const nomsDe = (profil: Profil, rayons: string[], max = 3) =>
  enumerer(rayons.slice(0, max).flatMap((r) => profil.noms.get(r) ?? []));

const libelleProjet = (projet: IProjet) =>
  enumerer(projet.types.map((t) => TYPE_PROJET_LIBELLE[t].toLowerCase()));

interface Cibles {
  rayons: string[];
  /** « Liants, Granulats et Aciers » quand l'activité du client les désigne. */
  noms: string | null;
  /** « dans Liants… » ou « pour votre projet (construction) » : fin des phrases d'explication. */
  contexte: string;
}

/**
 * Rayons qui intéressent le client, avec de quoi l'expliquer. Sans
 * activité, ceux de l'étape où en est son projet.
 */
async function rayonsCibles(profil: Profil, max: number): Promise<Cibles | null> {
  if (profil.rayons.length > 0) {
    const rayons = profil.rayons.slice(0, max);
    const noms = nomsDe(profil, rayons);
    return { rayons, noms, contexte: `dans ${noms}` };
  }
  const etapeProjet = profil.etapes.actuelle ?? etapesDuProjet(profil.projet)[0];
  if (!profil.projet || !etapeProjet) return null;
  const rayons = await rayonsDeLEtape(etapeProjet, [], max);
  const projet = libelleProjet(profil.projet) || ETAPE_LIBELLE[etapeProjet].toLowerCase();
  return rayons.length ? { rayons, noms: null, contexte: `pour votre projet (${projet})` } : null;
}

// ─────────────────────────────────────────────
//  Blocs
// ─────────────────────────────────────────────

async function blocsAccueil(profil: Profil, vitrine: Vitrine, limite: number): Promise<BlocBrut[]> {
  const blocs: BlocBrut[] = [];
  const { signaux } = profil;

  // 1. Reprendre : les derniers produits consultés.
  const reprendre = await vitrine.parIds(signaux.vus, limite);
  if (reprendre.length) {
    blocs.push({ cle: "reprendre", titre: "Reprendre où vous en étiez", raison: "Les produits que vous avez consultés récemment.", offres: reprendre });
  }

  // 2. Compléter : ce qui s'achète avec le panier et les dernières commandes.
  const achats = [...signaux.panier, ...signaux.commandes];
  const sources = [...new Set(achats.flatMap((id) => profil.situation.get(id)?.sous ?? []))];
  const cibles = rayonsComplementaires(await liensDepuis(sources), sources, 6);
  if (cibles.length) {
    const offres = await vitrine.parRayons(cibles.map((c) => c.cible), { limite });
    if (offres.length) {
      const nomsSources = await nomsDesRayons([...new Set(cibles.map((c) => c.source))]);
      blocs.push({
        cle: "complements",
        titre: signaux.panier.length ? "Pour compléter votre panier" : "Pour compléter vos achats",
        raison: `Souvent achetés avec ${enumerer([...nomsSources.values()].slice(0, 3))}.`,
        offres,
      });
    }
  }

  // 3. Pour vous : les rayons qui l'intéressent le plus (ou ceux de son projet).
  const cibl = await rayonsCibles(profil, 4);
  if (cibl) {
    const offres = await vitrine.parRayons(cibl.rayons, { limite });
    if (offres.length) {
      blocs.push({
        cle: "pour-vous",
        titre: "Sélectionnés pour vous",
        raison: cibl.noms ? `D'après votre intérêt pour ${cibl.noms}.` : `Choisis ${cibl.contexte}.`,
        offres,
      });
    }
  }

  // 4. La suite du chantier : l'étape d'après.
  const { actuelle, suivante, source } = profil.etapes;
  if (actuelle && suivante) {
    const rayons = await rayonsDeLEtape(suivante, profil.familles);
    const offres = await vitrine.parRayons(rayons, { limite });
    if (offres.length) {
      const ici = `« ${ETAPE_LIBELLE[actuelle]} »`;
      blocs.push({
        cle: "suite-chantier",
        titre: `Pour la suite de votre chantier : ${ETAPE_LIBELLE[suivante].toLowerCase()}`,
        raison: source === "projet"
          ? `Votre chantier en est à l'étape ${ici} : voici ce qu'il faudra ensuite.`
          : `D'après vos achats et vos consultations, votre chantier en est à l'étape ${ici} : voici la suite.`,
        offres,
      });
    }
  }

  // 5. Promotions dans ses rayons.
  const promo = await rayonsCibles(profil, 8);
  if (promo) {
    const offres = await vitrine.parRayons(promo.rayons, { limite, filtre: EN_PROMOTION });
    if (offres.length) {
      blocs.push({ cle: "promotions", titre: "En promotion pour vous", raison: `Des remises ${promo.contexte}.`, offres });
    }
  }

  return blocs;
}

async function blocPage(page: Exclude<PageRecommandation, "accueil">, profil: Profil, vitrine: Vitrine, limite: number): Promise<BlocBrut[]> {
  const cibl = await rayonsCibles(profil, 8);
  if (!cibl) return [];

  const depuis = new Date(Date.now() - JOURS_NOUVEAUTE * 86_400_000);
  const reglages = {
    promotions: { titre: "Vos promotions", raison: `Des remises ${cibl.contexte}.`, filtre: EN_PROMOTION, tri: undefined },
    nouveautes: {
      titre: "Nouveau dans vos rayons",
      raison: `Arrivés ces ${JOURS_NOUVEAUTE} derniers jours ${cibl.contexte}.`,
      filtre: { createdAt: { $gte: depuis } },
      tri: { createdAt: -1 } as Record<string, 1 | -1>,
    },
    "meilleures-ventes": {
      titre: "Les plus demandés dans vos rayons",
      raison: `Les produits les plus demandés ${cibl.contexte}.`,
      filtre: undefined,
      tri: { reviewsCount: -1 } as Record<string, 1 | -1>,
    },
  }[page];

  const offres = await vitrine.parRayons(cibl.rayons, {
    limite,
    ...(reglages.filtre ? { filtre: reglages.filtre } : {}),
    ...(reglages.tri ? { tri: reglages.tri } : {}),
  });
  return offres.length ? [{ cle: page, titre: reglages.titre, raison: reglages.raison, offres }] : [];
}

/** Met les offres en forme en un seul passage pour tous les blocs. */
async function mettreEnForme(blocs: BlocBrut[]): Promise<BlocRecommandation[]> {
  const toutes = blocs.flatMap((b) => b.offres);
  const dtos = await enrichProductBoutiques(toutes);
  const parId = new Map(toutes.map((o, i) => [String(o._id), dtos[i]!]));
  return blocs.map((b) => ({ cle: b.cle, titre: b.titre, raison: b.raison, produits: b.offres.map((o) => parId.get(String(o._id))!) }));
}

// ─────────────────────────────────────────────
//  GET /recommandations?page=accueil|promotions|nouveautes|meilleures-ventes&vus=id,id&limit=
//  Session facultative : sans compte, seuls les produits vus (`vus`) comptent.
// ─────────────────────────────────────────────
export const getRecommandations = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map((e) => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const page = (req.query.page as PageRecommandation | undefined) ?? "accueil";
    const limite = Number(req.query.limit ?? 12);
    const userId = req.session?.user?.id ? String(req.session.user.id) : undefined;

    const profil = await construireProfil(userId, lireIds(req.query.vus));
    // Déjà achetés ou au panier : inutile de les proposer à nouveau.
    const vitrine = new Vitrine(new Set([...profil.signaux.panier, ...profil.signaux.commandes]));
    const brut = page === "accueil" ? await blocsAccueil(profil, vitrine, limite) : await blocPage(page, profil, vitrine, limite);
    const blocs = await mettreEnForme(brut);

    const dto: RecommandationsDto = {
      personnalise: blocs.length > 0,
      profil: {
        rayons: profil.rayons.slice(0, 5).flatMap((id) => {
          const nom = profil.noms.get(id);
          return nom ? [{ id, nom }] : [];
        }),
        etapeActuelle: etape(profil.etapes.actuelle),
        etapeSuivante: etape(profil.etapes.suivante),
        projet: profil.projet,
      },
      blocs,
    };

    logger.info(`Recommandations ${page} (${userId ?? "visiteur"}) : ${blocs.map((b) => `${b.cle}=${b.produits.length}`).join(", ") || "aucune"}`);
    const response = BaseResponse.WithSuccess(dto, "Recommandations calculées");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur recommandations : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /recommandations/complements?offres=id,id&limit=
//  « Souvent achetés avec » : une fiche produit (une offre) ou un panier
//  (plusieurs). Renvoie un bloc, ou null s'il n'y a rien à proposer.
// ─────────────────────────────────────────────
export const getComplements = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map((e) => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const ids = lireIds(req.query.offres);
    const limite = Number(req.query.limit ?? 8);

    const situation = await situerOffres(ids);
    const sources = [...new Set(ids.flatMap((id) => situation.get(id)?.sous ?? []))];
    const cibles = rayonsComplementaires(await liensDepuis(sources), sources, 6);
    const offres = await new Vitrine(new Set(ids)).parRayons(cibles.map((c) => c.cible), { limite });

    if (offres.length === 0) {
      const response = BaseResponse.WithSuccess<BlocRecommandation>(null, "Aucun complément à proposer");
      return res.status(response.statusCode).json(response);
    }

    const noms = await nomsDesRayons([...new Set(cibles.map((c) => c.source))]);
    const [bloc] = await mettreEnForme([{
      cle: "complements",
      titre: "Souvent achetés avec",
      raison: `Ce que nos clients prennent avec ${enumerer([...noms.values()].slice(0, 3))}.`,
      offres,
    }]);

    const response = BaseResponse.WithSuccess(bloc!, "Compléments récupérés");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur compléments : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};
