import { EntityType, type User } from "../../../entities/user";
import { seedAccountFor, type MockAddress, type MockOrder } from "./accountSeed";

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

export interface MockDb {
  users: User[];
  logins: MockEntityLogin[];
  carts: MockCart[];
  wishlists: MockWishlist[];
  recentlyViewed: MockRecentlyViewed[];
  addresses: MockAddress[];
  orders: MockOrder[];
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

  return {
    users,
    logins,
    carts: [],
    wishlists: [],
    recentlyViewed: [],
    addresses: demo.addresses,
    orders: demo.orders,
    sessionUserId: null,
    otherSessions: 2,
  };
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
      cache = withAccountData(
        {
          ...parsed,
          carts: parsed.carts ?? [],
          wishlists: parsed.wishlists ?? [],
          recentlyViewed: parsed.recentlyViewed ?? [],
          addresses: parsed.addresses ?? [],
          orders: parsed.orders ?? [],
          sessionUserId: parsed.sessionUserId ?? null,
          otherSessions: parsed.otherSessions ?? 0,
        },
        parsed.orders !== undefined
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
