import type { User } from "../../../entities/user";
import type { Order, OrderStatus, ShippingAddress } from "../../../entities/order";
import type { Address } from "../../../entities/address";
import { DeliveryMode } from "../../../entities/delivery";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import type { MockAddress, MockOrder } from "./accountSeed";
import { quoteDelivery, readSelection, summaryMethod, toOrderDeliveries } from "./deliveryRules";
import { findLiveOffer } from "./liveCatalog";
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
//   POST   /orders/:userId          { addressId?, deliveries?, deliveryMethod?, telephone? }
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
    const offer = findLiveOffer(item.productBoutiqueId);
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

// ─────────────────────────────────────────────
//  POST /orders/:userId — checkout depuis le panier.
//  Même enchaînement que createOrder (Back/src/controllers/order.controller.ts) :
//  panier, offres, livraisons, adresse, stock, puis instantané. Les frais
//  viennent du devis, jamais du corps de la requête.
// ─────────────────────────────────────────────
interface CheckoutBody {
  addressId?: unknown;
  deliveries?: unknown;
  deliveryMethod?: unknown;
  telephone?: unknown;
  adresse?: unknown;
  code?: unknown;
}

export const createOrder = (userId: string, body: CheckoutBody = {}) => {
  requireSelf(userId);

  const { selection, errors } = readSelection(body);
  const telephone = typeof body.telephone === "string" ? body.telephone.trim() : undefined;
  if (telephone !== undefined && (telephone.length < 9 || telephone.length > 12)) {
    errors.push("Entre 9 et 12 caractères.");
  }
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);
  // Les coupons vivent dans les promotions du back, que le mode simulé ne porte pas.
  if (body.code !== undefined) throw new ApiError("Coupon introuvable", 404);

  const db = readDb();
  const cart = db.carts.find((entry) => entry.userId === userId);
  if (!cart || cart.items.length === 0) throw new ApiError("Le panier est vide.", 400);

  const lines = cart.items.map((item) => ({ item, offer: findLiveOffer(item.productBoutiqueId) }));
  const missing = lines.find((line) => !line.offer);
  if (missing) {
    throw new ApiError(
      `Un produit du panier n'est plus disponible (${missing.item.productBoutiqueId}).`,
      400
    );
  }

  // ── Livraisons : une par boutique ─────────
  const quote = quoteDelivery(
    lines.map(({ item, offer }) => ({ offer: offer!, quantity: item.quantity })),
    selection
  );
  if (!quote.ready) {
    throw new ApiError(
      quote.groups.find((group) => group.error)?.error ?? "Aucune livraison possible pour ce panier.",
      400
    );
  }
  const deliveries = toOrderDeliveries(quote);
  const requiresAddress = deliveries.some((delivery) => delivery.method !== DeliveryMode.PICKUP);

  // ── Adresse : copiée dans la commande ─────
  let shippingAddress: ShippingAddress | undefined;
  let addressId: string | null = null;
  if (typeof body.addressId === "string" && body.addressId) {
    const address = db.addresses.find(
      (candidate) => candidate.id === body.addressId && candidate.deletedAt === null
    );
    if (!address) throw new ApiError("Adresse de livraison introuvable", 404);
    if (address.userId !== userId) throw new ApiError("Cette adresse ne vous appartient pas.", 403);
    addressId = address.id;
    shippingAddress = {
      destinataire: address.destinataire,
      telephone: address.telephone,
      adresse: address.adresse,
      ville: address.ville,
      commune: address.commune,
      pays: address.pays,
    };
  } else if (requiresAddress && !body.adresse) {
    throw new ApiError("Une adresse de livraison est requise (addressId ou adresse).", 400);
  }

  // ── Stock : vérifié puis décrémenté ───────
  const now = new Date().toISOString();
  for (const { item, offer } of lines) {
    if (offer!.stock < item.quantity) {
      throw new ApiError(`Stock insuffisant pour un produit (disponible : ${offer!.stock}).`, 400);
    }
  }
  for (const { item, offer } of lines) {
    const stock = offer!.stock - item.quantity;
    const created = db.offers.find((candidate) => candidate.id === offer!.id);
    if (created) Object.assign(created, { stock, updatedAt: now });
    else db.offerPatches[offer!.id] = { ...db.offerPatches[offer!.id], stock, updatedAt: now };
  }

  const items = cart.items.map((item) => ({
    productBoutiqueId: item.productBoutiqueId,
    price: item.price,
    quantity: item.quantity,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const order: MockOrder = {
    id: objectId(),
    userId,
    reference: `CMD-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    items,
    subtotal,
    discountAmount: 0,
    promotionCode: null,
    shippingFee: quote.shippingFee,
    amount: subtotal + quote.shippingFee,
    status: "pending",
    statusHistory: [{ status: "pending", changedAt: now, note: "Commande créée" }],
    deliveryMethod: summaryMethod(deliveries.map((delivery) => delivery.method)),
    deliveries,
    addressId,
    ...(shippingAddress ? { shippingAddress } : {}),
    createdAt: now,
    updatedAt: now,
  };

  db.orders.push(order);
  // Le panier est vidé une fois la commande enregistrée.
  cart.items = [];
  cart.amount = 0;
  cart.updatedAt = now;
  writeDb(db);

  return ok(toOrder(order), "Commande créée avec succès", 201);
};
