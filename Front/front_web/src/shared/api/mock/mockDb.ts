import { EntityType, type User } from "../../../entities/user";
import type { DeliveryMode } from "../../../entities/delivery";
import type { Shop } from "../../../entities/shop";
import {
  CatalogSize,
  SellerExperience,
  SellerType,
  ShopRequestStatus,
} from "../../../entities/shop-request";
import { seedAccountFor, type MockAddress, type MockOrder } from "./accountSeed";
import { SHOPS } from "./catalogSeed";

// ─────────────────────────────────────────────
//  Base de données simulée.
//
//  Les documents reprennent exactement les modèles Mongoose du back
//  (Back/src/models/user.model.ts) : `User` porte le profil, `EntityLogin`
//  porte les secrets. Garder cette séparation — plutôt qu'un seul objet
//  fourre-tout — permet de brancher la vraie API sans rien réécrire.
// ─────────────────────────────────────────────

/** Miroir du document `entities_login`. */
export interface MockEntityLogin {
  _id: string;
  entityId: string;
  email: string;
  /** En clair : c'est un mock, il n'y a rien à protéger. */
  password: string;
  entityType: EntityType;
  emailVerifyToken: string | null;
  resetPasswordToken: string | null;
  resetPasswordExpires: string | null;
}

/** Miroir de Back/src/models/recentlyViewed.model.ts. */
export interface MockRecentlyViewed {
  userId: string;
  items: { productBoutiqueId: string; viewedAt: string }[];
}

/** Miroir de Back/src/models/cart.model.ts — un panier par utilisateur. */
export interface MockCartItem {
  productBoutiqueId: string;
  quantity: number;
  /** Prix unitaire figé à l'ajout : `discountPrice ?? price` du moment. */
  price: number;
}

export interface MockCart {
  id: string;
  userId: string;
  items: MockCartItem[];
  amount: number;
  createdAt: string;
  updatedAt: string;
}

/** Miroir de Back/src/models/wishlist.model.ts. */
export interface MockWishlist {
  id: string;
  userId: string;
  items: { productBoutiqueId: string }[];
  createdAt: string;
  updatedAt: string;
}

/** Miroir de shopDeliverySchema (Back/src/models/delivery.model.ts). */
export interface MockShopDelivery {
  modes: DeliveryMode[];
  flatRateFee: number | null;
}

/** Miroir de productDeliverySchema : héritage de la boutique, ou configuration propre. */
export interface MockProductDelivery extends MockShopDelivery {
  useShopSettings: boolean;
}

/**
 * Modifications d'une offre du catalogue de départ. Le catalogue est figé
 * dans catalogSeed.ts : ce qu'un vendeur y change est rangé ici et
 * appliqué à la lecture.
 */
export interface MockOfferPatch {
  price?: number;
  discountPrice?: number | null;
  stock?: number;
  urlImages?: string[];
  delivery?: MockProductDelivery;
  updatedAt: string;
}

/** Offre ajoutée par un vendeur (product_boutique). */
export interface MockOffer {
  id: string;
  boutiqueId: string;
  productId: string;
  /** URL d'objet : les photos ne survivent pas à un rechargement en mode simulé. */
  urlImages: string[];
  price: number;
  discountPrice: number | null;
  stock: number;
  delivery: MockProductDelivery;
  createdAt: string;
  updatedAt: string;
}

/** Champs d'une boutique modifiables par son gérant (PUT /shops/:id). */
export type MockShopPatch = Partial<Pick<Shop, "nom" | "description" | "logo" | "email" | "adresse">> & {
  updatedAt: string;
};

/** Miroir de Back/src/models/shopRequest.model.ts. */
export interface MockShopRequest {
  id: string;
  userId: string;
  nom: string;
  description: string;
  familleIds: string[];
  sellerType: SellerType;
  rccm: string | null;
  experience: SellerExperience;
  catalogSize: CatalogSize;
  hasPhysicalStore: boolean;
  adresse: string;
  email: string | null;
  message: string | null;
  acceptedTermsAt: string;
  status: ShopRequestStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  shopId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockDb {
  users: User[];
  logins: MockEntityLogin[];
  carts: MockCart[];
  wishlists: MockWishlist[];
  recentlyViewed: MockRecentlyViewed[];
  addresses: MockAddress[];
  orders: MockOrder[];
  /** Réglages de livraison enregistrés par les boutiques, par identifiant. */
  shopDeliveries: Record<string, MockShopDelivery>;
  /** Modifications des offres du catalogue de départ, par identifiant. */
  offerPatches: Record<string, MockOfferPatch>;
  /** Offres créées par les vendeurs. */
  offers: MockOffer[];
  /** Boutiques ouvertes par l'administration, en plus de celles du catalogue de départ. */
  shops: Shop[];
  /** Modifications des boutiques du catalogue de départ, par identifiant. */
  shopPatches: Record<string, MockShopPatch>;
  /** Demandes d'ouverture de boutique. */
  shopRequests: MockShopRequest[];
  /** Identifiant de l'utilisateur dont la session est ouverte. */
  sessionUserId: string | null;
  /** Compteur de sessions, pour que /auth/logout-all ait une réponse crédible. */
  otherSessions: number;
}

const STORAGE_KEY = "btp.mock.db";

// Identifiants façon ObjectId : 24 caractères hexadécimaux.
export const objectId = (): string => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const randomToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

// ─────────────────────────────────────────────
//  Jeu de départ : un compte vérifié, prêt à se connecter, et un compte
//  non vérifié pour éprouver le refus 403 du login.
// ─────────────────────────────────────────────
export const DEMO_EMAIL = "mamadou@btp.com";
export const DEMO_PASSWORD = "Secret@123";

// Compte vendeur : le gérant de Volta Électrique, comme dans le seed du back
// (gerant.<boutique>@btp.com). Son identifiant est l'`ownerId` de la boutique.
export const SELLER_EMAIL = "gerant.volta-electrique@btp.com";
const SELLER_SHOP = SHOPS.find((shop) => shop.nom === "Volta Électrique");

const sellerAccount = (): { user: User; login: MockEntityLogin } | null => {
  if (!SELLER_SHOP) return null;
  const now = new Date().toISOString();
  return {
    user: {
      _id: SELLER_SHOP.ownerId,
      nom: "Volta Électrique",
      prenom: "Gérant",
      email: SELLER_EMAIL,
      avatar: null,
      role: EntityType.SHOP,
      isEmailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    login: {
      _id: objectId(),
      entityId: SELLER_SHOP.ownerId,
      email: SELLER_EMAIL,
      password: DEMO_PASSWORD,
      entityType: EntityType.SHOP,
      emailVerifyToken: null,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  };
};

// Compte d'administration : il examine les demandes d'ouverture de boutique.
export const ADMIN_EMAIL = "admin@btp.com";

// Client qui a déjà déposé une demande : l'administration a de quoi examiner
// dès la première connexion.
const APPLICANT_EMAIL = "ibrahima@btp.com";

const plainAccount = (
  profile: Pick<User, "nom" | "prenom" | "email" | "role"> & { telephone?: string }
): { user: User; login: MockEntityLogin } => {
  const now = new Date().toISOString();
  const id = objectId();
  return {
    user: { _id: id, avatar: null, isEmailVerified: true, createdAt: now, updatedAt: now, ...profile },
    login: {
      _id: objectId(),
      entityId: id,
      email: profile.email,
      password: DEMO_PASSWORD,
      entityType: profile.role,
      emailVerifyToken: null,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  };
};

const adminAccount = () =>
  plainAccount({ nom: "BTP", prenom: "Administration", email: ADMIN_EMAIL, role: EntityType.ADMIN });

const applicantAccount = () =>
  plainAccount({
    nom: "Sow",
    prenom: "Ibrahima",
    email: APPLICANT_EMAIL,
    telephone: "621334455",
    role: EntityType.USER,
  });

const withAccount = (db: MockDb, account: { user: User; login: MockEntityLogin } | null): MockDb => {
  if (!account || db.logins.some((login) => login.email === account.user.email)) return db;
  return { ...db, users: [...db.users, account.user], logins: [...db.logins, account.login] };
};

/** Demande en attente du client de démonstration, déposée il y a deux jours. */
const withPendingRequest = (db: MockDb): MockDb => {
  const applicant = db.users.find((user) => user.email === APPLICANT_EMAIL);
  if (!applicant || db.shopRequests.some((request) => request.userId === applicant._id)) return db;
  const filedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const request: MockShopRequest = {
    id: objectId(),
    userId: applicant._id,
    nom: "Quincaillerie Kipé",
    description:
      "Quincaillerie de quartier depuis 2017 : visserie, serrurerie, outillage à main et petit matériel électrique, avec un comptoir ouvert du lundi au samedi.",
    familleIds: ["fam-equipement"],
    sellerType: SellerType.ENTREPRISE,
    rccm: "GN.TCC.2017.B.04521",
    experience: SellerExperience.TROIS_A_DIX,
    catalogSize: CatalogSize.DE_50_A_200,
    hasPhysicalStore: true,
    adresse: "Kipé, Ratoma, Conakry",
    email: "contact@quincaillerie-kipe.gn",
    message: "Nous livrons déjà nos clients du quartier et souhaitons toucher les chantiers de Ratoma.",
    acceptedTermsAt: filedAt,
    status: ShopRequestStatus.PENDING,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    shopId: null,
    createdAt: filedAt,
    updatedAt: filedAt,
  };
  return { ...db, shopRequests: [...db.shopRequests, request] };
};

/**
 * Comptes et données ajoutés au fil des versions : une base écrite avant
 * l'espace vendeur ou les demandes de boutique les reçoit à la lecture.
 */
const withDemoAccounts = (db: MockDb): MockDb =>
  withPendingRequest(
    withAccount(withAccount(withAccount(db, sellerAccount()), adminAccount()), applicantAccount())
  );

const seed = (): MockDb => {
  const now = new Date().toISOString();

  const verifiedId = objectId();
  const pendingId = objectId();

  const users: User[] = [
    {
      _id: verifiedId,
      nom: "Diallo",
      prenom: "Mamadou",
      email: DEMO_EMAIL,
      telephone: "620000000",
      avatar: null,
      role: EntityType.USER,
      isEmailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: pendingId,
      nom: "Camara",
      prenom: "Aissatou",
      email: "aissatou@btp.com",
      telephone: "620111222",
      avatar: null,
      role: EntityType.USER,
      isEmailVerified: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const logins: MockEntityLogin[] = [
    {
      _id: objectId(),
      entityId: verifiedId,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      entityType: EntityType.USER,
      emailVerifyToken: null,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
    {
      _id: objectId(),
      entityId: pendingId,
      email: "aissatou@btp.com",
      password: DEMO_PASSWORD,
      entityType: EntityType.USER,
      emailVerifyToken: randomToken(),
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  ];

  // Le compte de démonstration arrive avec un historique : un espace client
  // vide ne montre rien de ce qu'il sait faire.
  const demo = seedAccountFor(verifiedId);

  return withDemoAccounts({
    users,
    logins,
    carts: [],
    wishlists: [],
    recentlyViewed: [],
    addresses: demo.addresses,
    orders: demo.orders,
    shopDeliveries: {},
    offerPatches: {},
    offers: [],
    shops: [],
    shopPatches: {},
    shopRequests: [],
    sessionUserId: null,
    otherSessions: 2,
  });
};

/** Base écrite avant l'arrivée des commandes : on dote le compte de démo. */
const withAccountData = (db: MockDb, hadAccountData: boolean): MockDb => {
  if (hadAccountData) return db;
  const demoUser = db.users.find((user) => user.email === DEMO_EMAIL);
  if (!demoUser) return db;
  const demo = seedAccountFor(demoUser._id);
  return { ...db, addresses: demo.addresses, orders: demo.orders };
};

// ─────────────────────────────────────────────
//  Persistance.
//  localStorage tient lieu à la fois de base et de cookie de session : un
//  rechargement de page retrouve les comptes créés et la session ouverte,
//  comme le ferait le vrai back.
// ─────────────────────────────────────────────
let cache: MockDb | null = null;

export const readDb = (): MockDb => {
  if (cache) return cache;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<MockDb> & Pick<MockDb, "users" | "logins">;
      // Une base écrite avant l'arrivée du panier, des favoris ou des
      // commandes n'a pas ces champs : on les comble plutôt que de laisser
      // un `undefined` se propager.
      cache = withDemoAccounts(
        withAccountData(
          {
            ...parsed,
            carts: parsed.carts ?? [],
            wishlists: parsed.wishlists ?? [],
            recentlyViewed: parsed.recentlyViewed ?? [],
            addresses: parsed.addresses ?? [],
            // Commandes antérieures aux livraisons par boutique : comme sur le
            // vrai back, `deliveries` vaut [] à la lecture.
            orders: (parsed.orders ?? []).map((order) => ({ ...order, deliveries: order.deliveries ?? [] })),
            shopDeliveries: parsed.shopDeliveries ?? {},
            offerPatches: parsed.offerPatches ?? {},
            offers: parsed.offers ?? [],
            shops: parsed.shops ?? [],
            shopPatches: parsed.shopPatches ?? {},
            shopRequests: parsed.shopRequests ?? [],
            sessionUserId: parsed.sessionUserId ?? null,
            otherSessions: parsed.otherSessions ?? 0,
          },
          parsed.orders !== undefined
        )
      );
      writeDb(cache);
      return cache;
    }
  } catch {
    // Navigation privée ou stockage bloqué : on repart d'un jeu neuf,
    // en mémoire seulement.
  }

  cache = seed();
  writeDb(cache);
  return cache;
};

export const writeDb = (db: MockDb): void => {
  cache = db;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Sans persistance, le mock reste utilisable le temps de la session.
  }
};

/** Remet la base dans son état initial. Utile depuis la console. */
export const resetDb = (): void => {
  cache = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Rien à faire : le cache mémoire est déjà vidé.
  }
};
