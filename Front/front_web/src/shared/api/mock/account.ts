import type { User } from "../../../entities/user";
import type { Order, OrderStatus } from "../../../entities/order";
import type { Address } from "../../../entities/address";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import type { MockAddress, MockOrder } from "./accountSeed";
import { CATALOG } from "./catalogSeed";
import { objectId, readDb, writeDb } from "./mockDb";

// ─────────────────────────────────────────────
//  Espace compte — routes simulées.
//
//   PUT    /auth/me                  { nom?, prenom?, telephone?, avatar? }
//   PUT    /auth/change-password     { currentPassword, newPassword, confirmNewPassword }
//   GET    /addresses?userId=
//   POST   /addresses                { userId, …AddressInput }
//   PUT    /addresses/:id            { …AddressInput partiel }
//   PATCH  /addresses/:id/default
//   DELETE /addresses/:id
//   GET    /orders?userId=&status=&page=&limit=
//   GET    /orders/:id
//
//  Mêmes codes, mêmes messages et même logique « adresse par défaut » que
//  Back/src/controllers/{authController,address,order}.controller.ts.
// ─────────────────────────────────────────────

const ok = <T>(data: T, message: string, statusCode = 200): ApiResponse<T> => ({
  success: true,
  message,
  statusCode,
  data,
});

const sessionUser = (): User => {
  const db = readDb();
  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  if (!db.sessionUserId || !user) {
    throw new ApiError("Session absente ou expirée, veuillez vous connecter.", 401);
  }
  return user;
};

const requireSelf = (userId: string | null): void => {
  const user = sessionUser();
  if (user._id !== userId) {
    throw new ApiError("Vous ne pouvez accéder qu'à vos propres données.", 403);
  }
};

// ── Profil ────────────────────────────────────
export const updateMe = (body: Partial<Pick<User, "nom" | "prenom" | "telephone" | "avatar">>) => {
  const db = readDb();
  const user = db.users.find((candidate) => candidate._id === sessionUser()._id);
  if (!user) throw new ApiError("Utilisateur introuvable.", 404);

  if (body.nom !== undefined) user.nom = body.nom.trim();
  if (body.prenom !== undefined) user.prenom = body.prenom.trim();
  if (body.telephone !== undefined) user.telephone = body.telephone.trim();
  if (body.avatar !== undefined) user.avatar = body.avatar;
  user.updatedAt = new Date().toISOString();
  writeDb(db);

  return ok(user, "Opération réussie");
};

export const changePassword = (body: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}) => {
  const db = readDb();
  const login = db.logins.find((candidate) => candidate.entityId === sessionUser()._id);
  if (!login) throw new ApiError("Ressource introuvable.", 404);

  if (login.password !== body.currentPassword) {
    throw new ApiError("Mot de passe actuel incorrect.", 400);
  }
  if (body.newPassword === body.currentPassword) {
    throw new ApiError("Le nouveau mot de passe doit être différent de l'ancien.", 422);
  }
  if (body.newPassword !== body.confirmNewPassword) {
    throw new ApiError("Les mots de passe ne correspondent pas.", 422);
  }

  login.password = body.newPassword;
  // Comme le back : les autres sessions tombent, la courante est conservée.
  db.otherSessions = 0;
  writeDb(db);

  return ok(null, "Mot de passe mis à jour.");
};

// ── Adresses ──────────────────────────────────
const toAddress = ({ deletedAt: _deletedAt, ...address }: MockAddress): Address => address;

const liveAddresses = (userId: string) =>
  readDb().addresses.filter((address) => address.userId === userId && !address.deletedAt);

const findAddress = (id: string): MockAddress => {
  const address = readDb().addresses.find(
    (candidate) => candidate.id === id && !candidate.deletedAt
  );
  if (!address) throw new ApiError("Adresse non trouvée", 404);
  return address;
};

const unsetOtherDefaults = (userId: string, keepId: string | null) => {
  for (const address of liveAddresses(userId)) {
    if (address.id !== keepId) address.isDefault = false;
  }
};

export const listAddresses = (params: URLSearchParams) => {
  const userId = params.get("userId");
  requireSelf(userId);
  const sorted = [...liveAddresses(userId ?? "")].sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return ok(sorted.map(toAddress), "Adresses récupérées avec succès");
};

type AddressBody = Partial<Omit<MockAddress, "id" | "userId" | "deletedAt">> & { userId?: string };

export const createAddress = (body: AddressBody) => {
  requireSelf(body.userId ?? null);
  const db = readDb();
  const userId = body.userId ?? "";
  // La première adresse devient par défaut d'office.
  const makeDefault = liveAddresses(userId).length === 0 ? true : Boolean(body.isDefault);
  if (makeDefault) unsetOtherDefaults(userId, null);

  const now = new Date().toISOString();
  const address: MockAddress = {
    id: objectId(),
    userId,
    label: body.label?.trim() || undefined,
    destinataire: body.destinataire?.trim() || undefined,
    telephone: (body.telephone ?? "").trim(),
    adresse: (body.adresse ?? "").trim(),
    ville: (body.ville ?? "").trim(),
    commune: body.commune?.trim() || undefined,
    pays: body.pays?.trim() || "Guinée",
    isDefault: makeDefault,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.addresses.push(address);
  writeDb(db);
  return ok(toAddress(address), "Adresse créée avec succès", 201);
};

export const updateAddress = (id: string, body: AddressBody) => {
  sessionUser();
  const db = readDb();
  const address = findAddress(id);

  const text = ["label", "destinataire", "telephone", "adresse", "ville", "commune", "pays"] as const;
  for (const field of text) {
    const value = body[field];
    if (value !== undefined) address[field] = value.trim();
  }

  if (body.isDefault === true && !address.isDefault) {
    unsetOtherDefaults(address.userId, id);
    address.isDefault = true;
  }
  if (body.isDefault === false && address.isDefault) {
    const next = liveAddresses(address.userId)
      .filter((candidate) => candidate.id !== id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (!next) {
      throw new ApiError(
        "Impossible de retirer l'adresse par défaut : c'est votre seule adresse.",
        400
      );
    }
    address.isDefault = false;
    next.isDefault = true;
  }

  address.updatedAt = new Date().toISOString();
  writeDb(db);
  return ok(toAddress(address), "Adresse mise à jour avec succès");
};

export const setDefaultAddress = (id: string) => {
  sessionUser();
  const db = readDb();
  const address = findAddress(id);
  unsetOtherDefaults(address.userId, id);
  address.isDefault = true;
  address.updatedAt = new Date().toISOString();
  writeDb(db);
  return ok(toAddress(address), "Adresse définie par défaut avec succès");
};

export const deleteAddress = (id: string) => {
  sessionUser();
  const db = readDb();
  const address = findAddress(id);
  const wasDefault = address.isDefault;
  address.deletedAt = new Date().toISOString();
  address.isDefault = false;

  // Si l'adresse supprimée était par défaut, la plus récente restante prend le relais.
  if (wasDefault) {
    const next = liveAddresses(address.userId).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    if (next) next.isDefault = true;
  }
  writeDb(db);
  return ok(null, "Adresse supprimée avec succès");
};

// ── Commandes ─────────────────────────────────
/** Enrichissement façon `buildOrderDto` : offre, boutique et produit imbriqués. */
const toOrder = (order: MockOrder): Order => ({
  ...order,
  items: order.items.map((item) => {
    const offer = CATALOG.find((candidate) => candidate.id === item.productBoutiqueId);
    return {
      productBoutique: offer,
      boutique: offer?.boutique,
      product: offer?.product,
      price: item.price,
      quantity: item.quantity,
      lineTotal: item.price * item.quantity,
    };
  }),
  totalItems: order.items.reduce((sum, item) => sum + item.quantity, 0),
});

export const listOrders = (params: URLSearchParams) => {
  const userId = params.get("userId");
  requireSelf(userId);
  const status = params.get("status") as OrderStatus | null;
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 10)));

  const all = readDb()
    .orders.filter((order) => order.userId === userId && (!status || order.status === status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return ok(
    {
      orders: all.slice((page - 1) * limit, page * limit).map(toOrder),
      total: all.length,
      page,
      totalPages: Math.ceil(all.length / limit),
    },
    "Commandes récupérées avec succès"
  );
};

export const getOrder = (id: string) => {
  const user = sessionUser();
  const order = readDb().orders.find((candidate) => candidate.id === id);
  if (!order) throw new ApiError("Commande non trouvée", 404);
  if (order.userId !== user._id && user.role !== "admin") {
    throw new ApiError("Vous ne pouvez consulter que vos propres commandes.", 403);
  }
  return ok(toOrder(order), "Commande récupérée avec succès");
};
