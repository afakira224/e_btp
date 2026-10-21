import { EntityType, type User } from "../../../entities/user";
import type { DeliveryMode } from "../../../entities/delivery";
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

/** Base écrite avant l'espace vendeur : on y ajoute le compte du gérant. */
const withSellerAccount = (db: MockDb): MockDb => {
  const seller = sellerAccount();
  if (!seller || db.logins.some((login) => login.email === SELLER_EMAIL)) return db;
  return { ...db, users: [...db.users, seller.user], logins: [...db.logins, seller.login] };
};

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

  return withSellerAccount({
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
      cache = withSellerAccount(
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
