import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
});
vi.mock("../../../src/models/categorie.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Categorie: mockModel() };
});
vi.mock("../../../src/models/sousCategorie.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { SousCategorie: mockModel() };
});
vi.mock("../../../src/models/complementarite.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Complementarite: mockModel() };
});
vi.mock("../../../src/models/user.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { User: mockModel() };
});
vi.mock("../../../src/models/order.model.js", async () => {
  const actual = await import("../../../src/models/order.model.js");
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Order: mockModel() };
});
vi.mock("../../../src/models/cart.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Cart: mockModel() };
});
vi.mock("../../../src/models/wishlist.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Wishlist: mockModel() };
});
vi.mock("../../../src/models/recentlyViewed.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { RecentlyViewed: mockModel() };
});
// La mise en forme des offres est testée ailleurs : ici, seul l'identifiant compte.
vi.mock("../../../src/shared/helpers/productBoutique.helper.js", () => ({
  enrichProductBoutiques: vi.fn(async (items: { _id: unknown }[]) => items.map((i) => ({ id: String(i._id) }))),
}));
vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return { ...actual, validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })) };
});

import { validationResult } from "express-validator";
import { Product, productBoutique } from "../../../src/models/product.model.js";
import { Categorie } from "../../../src/models/categorie.model.js";
import { SousCategorie } from "../../../src/models/sousCategorie.model.js";
import { Complementarite } from "../../../src/models/complementarite.model.js";
import { User } from "../../../src/models/user.model.js";
import { Order } from "../../../src/models/order.model.js";
import { Cart } from "../../../src/models/cart.model.js";
import { Wishlist } from "../../../src/models/wishlist.model.js";
import { RecentlyViewed } from "../../../src/models/recentlyViewed.model.js";
import { getComplements, getRecommandations } from "../../../src/controllers/recommandation.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockExpressSession, mockRequest, mockResponse } from "../../helpers/express.mock.js";

const m = (model: unknown) => model as Record<string, any>;
const oid = () => new Types.ObjectId();

// ─────────────────────────────────────────────
//  Petit catalogue en mémoire : trois rayons, trois offres chacun.
//  Les faux find() appliquent vraiment les filtres utilisés par le
//  contrôleur ($in, $nin, $ne, $gt, $gte, remise).
// ─────────────────────────────────────────────
const famille = oid();
const catGrosOeuvre = { _id: oid(), familleId: famille, etape: "gros_oeuvre", actif: true, ordre: 1 };
const catReseaux = { _id: oid(), familleId: oid(), etape: "reseaux", actif: true, ordre: 2 };
const rayon = (nom: string, categorie: typeof catGrosOeuvre) => ({ _id: oid(), categorieId: categorie._id, nom, ordre: 1, actif: true, categorie });
const ciments = rayon("Ciments", catGrosOeuvre);
const sables = rayon("Sables", catGrosOeuvre);
const cables = rayon("Câbles", catReseaux);
const rayons = [ciments, sables, cables];

const products: Record<string, any>[] = [];
const offers: Record<string, any>[] = [];
for (const r of rayons) {
  for (let i = 0; i < 3; i++) {
    const p = { _id: oid(), sousCategoryId: r._id, categoryId: r.categorieId, familleId: r.categorie.familleId };
    products.push(p);
    offers.push({ _id: oid(), productId: p._id, stock: 10, price: 100, discountPrice: i === 0 ? 80 : null, reviewsCount: i, createdAt: new Date() });
  }
}
const offresDe = (r: (typeof rayons)[number]) =>
  offers.filter((o) => products.find((p) => p._id.equals(o.productId))!.sousCategoryId.equals(r._id));
const [ciment1, ciment2] = offresDe(ciments);

const egal = (a: unknown, b: unknown) => String(a) === String(b);
const correspond = (doc: Record<string, any>, filtre: Record<string, any>): boolean =>
  Object.entries(filtre).every(([champ, attendu]) => {
    if (champ === "$expr") return doc.discountPrice !== null && doc.discountPrice < doc.price;
    const valeur = doc[champ];
    if (attendu && typeof attendu === "object" && !(attendu instanceof Types.ObjectId)) {
      if ("$in" in attendu) return attendu.$in.some((x: unknown) => egal(x, valeur));
      if ("$nin" in attendu) return !attendu.$nin.some((x: unknown) => egal(x, valeur));
      if ("$ne" in attendu) return attendu.$ne === null ? valeur !== null && valeur !== undefined : !egal(attendu.$ne, valeur);
      if ("$gt" in attendu) return valeur > attendu.$gt;
      if ("$gte" in attendu) return valeur >= attendu.$gte;
    }
    return egal(valeur, attendu);
  });
const fauxFind = (docs: Record<string, any>[]) => (filtre: Record<string, any> = {}) => mockQuery(docs.filter((d) => correspond(d, filtre)));

let complementarites: Record<string, any>[] = [];

/** Client connecté : son identité vient de la session. */
const connecte = (userId: string, query: Record<string, unknown> = {}) =>
  mockRequest({ query, session: mockExpressSession({ id: userId, entityType: "user" }) });

const client = (donnees: { projet?: unknown; panier?: string[]; commandes?: string[]; vus?: string[] }) => {
  m(User).findById.mockReturnValue(mockQuery({ projet: donnees.projet ?? null }));
  m(Cart).findOne.mockReturnValue(mockQuery({ items: (donnees.panier ?? []).map((id) => ({ productBoutiqueId: id })) }));
  m(Order).find.mockReturnValue(mockQuery(donnees.commandes ? [{ items: donnees.commandes.map((id) => ({ productBoutiqueId: id })) }] : []));
  m(RecentlyViewed).findOne.mockReturnValue(
    mockQuery({ items: (donnees.vus ?? []).map((id, i) => ({ productBoutiqueId: id, viewedAt: new Date(Date.now() - i * 1000) })) })
  );
};

const idsDuBloc = (res: ReturnType<typeof mockResponse>, cle: string): string[] =>
  res.body.data.blocs.find((b: { cle: string }) => b.cle === cle)?.produits.map((p: { id: string }) => p.id) ?? [];

beforeEach(() => {
  complementarites = [{ source: ciments._id, cible: sables._id, poids: 1 }];
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  m(Product).find.mockImplementation(fauxFind(products));
  m(productBoutique).find.mockImplementation(fauxFind(offers));
  m(Categorie).find.mockImplementation(fauxFind([catGrosOeuvre, catReseaux]));
  m(SousCategorie).find.mockImplementation(fauxFind(rayons));
  m(SousCategorie).findOne.mockImplementation((f: Record<string, any>) => mockQuery(rayons.find((r) => correspond(r, f)) ?? null));
  m(Complementarite).find.mockImplementation((f: Record<string, any>) => fauxFind(complementarites)(f));
  m(User).findById.mockReturnValue(mockQuery(null));
  m(Order).find.mockReturnValue(mockQuery([]));
  m(Cart).findOne.mockReturnValue(mockQuery(null));
  m(Wishlist).findOne.mockReturnValue(mockQuery(null));
  m(RecentlyViewed).findOne.mockReturnValue(mockQuery(null));
});

// ─────────────────────────────────────────────
describe("getRecommandations", () => {
  it("sans compte ni historique : rien de personnalisé, la page garde ses listes", async () => {
    const res = mockResponse();

    await getRecommandations(mockRequest({ query: {} }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.personnalise).toBe(false);
    expect(res.body.data.blocs).toEqual([]);
    expect(m(User).findById).not.toHaveBeenCalled();
  });

  it("visiteur : personnalise l'accueil d'après les produits vus envoyés par le navigateur", async () => {
    const res = mockResponse();

    await getRecommandations(mockRequest({ query: { vus: String(ciment1._id) } }), res);

    const { data } = res.body;
    expect(data.personnalise).toBe(true);
    expect(idsDuBloc(res, "reprendre")).toEqual([String(ciment1._id)]);
    const pourVous = data.blocs.find((b: { cle: string }) => b.cle === "pour-vous");
    expect(pourVous.raison).toBe("D'après votre intérêt pour Ciments.");
    expect(data.profil.rayons).toEqual([{ id: String(ciments._id), nom: "Ciments" }]);
  });

  it("propose l'étape suivante du chantier, avec sa raison", async () => {
    const res = mockResponse();

    await getRecommandations(mockRequest({ query: { vus: String(ciment1._id) } }), res);

    const suite = res.body.data.blocs.find((b: { cle: string }) => b.cle === "suite-chantier");
    expect(res.body.data.profil.etapeActuelle.cle).toBe("gros_oeuvre");
    expect(suite.raison).toContain("« Gros œuvre »");
    expect(suite.produits.map((p: { id: string }) => p.id).sort()).toEqual(offresDe(cables).map((o) => String(o._id)).sort());
  });

  it("ne montre jamais un produit dans deux blocs de la même page", async () => {
    const res = mockResponse();

    await getRecommandations(mockRequest({ query: { vus: String(ciment1._id) } }), res);

    const tous = res.body.data.blocs.flatMap((b: { produits: { id: string }[] }) => b.produits.map((p) => p.id));
    expect(new Set(tous).size).toBe(tous.length);
  });

  it("client connecté : complète son panier avec les rayons « achetés avec »", async () => {
    client({ panier: [String(ciment1._id)] });
    const res = mockResponse();

    await getRecommandations(connecte(oid().toString()), res);

    const bloc = res.body.data.blocs.find((b: { cle: string }) => b.cle === "complements");
    expect(bloc.titre).toBe("Pour compléter votre panier");
    expect(bloc.raison).toBe("Souvent achetés avec Ciments.");
    expect(idsDuBloc(res, "complements").sort()).toEqual(offresDe(sables).map((o) => String(o._id)).sort());
  });

  it("ne repropose pas ce qui est déjà au panier ou acheté", async () => {
    client({ panier: [String(ciment1._id)], commandes: [String(ciment2._id)], vus: [String(ciment1._id)] });
    const res = mockResponse();

    await getRecommandations(connecte(oid().toString()), res);

    const tous = res.body.data.blocs.flatMap((b: { produits: { id: string }[] }) => b.produits.map((p) => p.id));
    expect(tous).not.toContain(String(ciment1._id));
    expect(tous).not.toContain(String(ciment2._id));
  });

  it("client sans activité : s'appuie sur le projet décrit à l'inscription", async () => {
    client({ projet: { types: ["construction"], avancement: "gros_oeuvre", renseigneLe: new Date() } });
    const res = mockResponse();

    await getRecommandations(connecte(oid().toString()), res);

    const { blocs, profil } = res.body.data;
    expect(profil.projet.types).toEqual(["construction"]);
    expect(blocs.find((b: { cle: string }) => b.cle === "pour-vous").raison).toBe("Choisis pour votre projet (construction).");
    expect(blocs.find((b: { cle: string }) => b.cle === "suite-chantier").raison).toBe(
      "Votre chantier en est à l'étape « Gros œuvre » : voici ce qu'il faudra ensuite."
    );
  });

  it("lit l'identité dans la session, jamais dans l'URL", async () => {
    const moi = oid().toString();
    client({});

    await getRecommandations(connecte(moi, { userId: oid().toString() }), mockResponse());

    expect(m(User).findById).toHaveBeenCalledWith(moi);
  });

  it("page promotions : seulement des offres remisées, dans ses rayons", async () => {
    const res = mockResponse();

    await getRecommandations(mockRequest({ query: { page: "promotions", vus: String(ciment2._id) } }), res);

    const { blocs } = res.body.data;
    expect(blocs).toHaveLength(1);
    expect(blocs[0].raison).toBe("Des remises dans Ciments.");
    expect(idsDuBloc(res, "promotions")).toEqual([String(ciment1._id)]);
  });

  it("page meilleures ventes : un seul bloc, dans ses rayons", async () => {
    const res = mockResponse();

    await getRecommandations(mockRequest({ query: { page: "meilleures-ventes", vus: String(ciment1._id) } }), res);

    expect(res.body.data.blocs.map((b: { cle: string }) => b.cle)).toEqual(["meilleures-ventes"]);
  });

  it("renvoie 422 quand les paramètres sont invalides", async () => {
    vi.mocked(validationResult).mockReturnValueOnce({ isEmpty: () => false, array: () => [{ msg: "Page invalide." }] } as any);
    const res = mockResponse();

    await getRecommandations(mockRequest({ query: { page: "x" } }), res);

    expect(res.statusCode).toBe(422);
  });

  it("renvoie 500 en cas d'erreur", async () => {
    m(productBoutique).find.mockImplementation(() => {
      throw new Error("panne");
    });
    const res = mockResponse();

    await getRecommandations(mockRequest({ query: { vus: String(ciment1._id) } }), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getComplements", () => {
  it("propose les rayons achetés avec celui du produit", async () => {
    const res = mockResponse();

    await getComplements(mockRequest({ query: { offres: String(ciment1._id) } }), res);

    expect(res.body.data.titre).toBe("Souvent achetés avec");
    expect(res.body.data.raison).toBe("Ce que nos clients prennent avec Ciments.");
    expect(res.body.data.produits.map((p: { id: string }) => p.id).sort()).toEqual(offresDe(sables).map((o) => String(o._id)).sort());
  });

  it("renvoie null quand aucun lien n'existe", async () => {
    complementarites = [];
    const res = mockResponse();

    await getComplements(mockRequest({ query: { offres: String(ciment1._id) } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("renvoie 422 quand les paramètres sont invalides", async () => {
    vi.mocked(validationResult).mockReturnValueOnce({ isEmpty: () => false, array: () => [{ msg: "Le paramètre offres est requis." }] } as any);
    const res = mockResponse();

    await getComplements(mockRequest({ query: {} }), res);

    expect(res.statusCode).toBe(422);
  });
});
