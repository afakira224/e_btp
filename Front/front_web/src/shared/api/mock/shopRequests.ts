import {
  CatalogSize,
  SellerExperience,
  SellerType,
  SHOP_REQUEST_STATUS_LABELS,
  SHOP_REQUEST_STATUSES,
  ShopRequestStatus,
  type ShopRequest,
  type ShopRequestCounts,
  type ShopRequestInput,
} from "../../../entities/shop-request";
import { EntityType, type User } from "../../../entities/user";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import { FAMILLES } from "./catalogSeed";
import { allShops } from "./liveCatalog";
import { objectId, readDb, writeDb, type MockShopRequest } from "./mockDb";

// ─────────────────────────────────────────────
//  Demandes d'ouverture de boutique — routes simulées.
//
//   POST   /shop-requests                 client, société, gérant
//   GET    /shop-requests/mine            authentifié
//   GET    /shop-requests?status=&search=&page=&limit=          admin
//   GET    /shop-requests/:id             admin ou demandeur
//   PATCH  /shop-requests/:id/cancel      demandeur
//   PATCH  /shop-requests/:id/approve     admin
//   PATCH  /shop-requests/:id/reject      { reason }            admin
//
//  Portage de Back/src/controllers/shopRequest.controller.ts : mêmes codes
//  HTTP, mêmes messages, mêmes validations que shopRequest.form.ts.
// ─────────────────────────────────────────────

const ok = <T>(data: T, message: string, statusCode = 200): ApiResponse<T> => ({
  success: true,
  message,
  statusCode,
  data,
});

const FORBIDDEN_MESSAGE = "Accès refusé, vous n'avez pas les permissions nécessaires";
const PENDING_CONFLICT_MESSAGE = "Vous avez déjà une demande en cours d'examen.";
const NAME_CONFLICT_MESSAGE = "Une boutique porte déjà ce nom : choisissez-en un autre.";

/** requireAuth */
const currentUser = (): User => {
  const db = readDb();
  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  if (!db.sessionUserId || !user) {
    throw new ApiError("Session absente ou expirée, veuillez vous connecter.", 401);
  }
  return user;
};

/** requireAuth + requireRole(...) */
const requireRole = (...roles: EntityType[]): User => {
  const user = currentUser();
  if (!roles.includes(user.role)) throw new ApiError(FORBIDDEN_MESSAGE, 403);
  return user;
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const alreadyReviewed = (status: ShopRequestStatus) =>
  `Cette demande a déjà été traitée (${SHOP_REQUEST_STATUS_LABELS[status].toLowerCase()}).`;

/** toShopRequestResponseDto, domaines chargés ; le demandeur pour l'administration. */
const toDto = (request: MockShopRequest, withApplicant: boolean): ShopRequest => {
  const { reviewedBy: _reviewedBy, familleIds, ...rest } = request;
  const applicant = withApplicant
    ? readDb().users.find((user) => user._id === request.userId)
    : undefined;
  return {
    ...rest,
    familles: familleIds.map((id) => ({ id, nom: FAMILLES.find((famille) => famille.id === id)?.nom })),
    ...(applicant
      ? {
          applicant: {
            id: applicant._id,
            nom: applicant.nom,
            prenom: applicant.prenom,
            email: applicant.email,
            telephone: applicant.telephone,
          },
        }
      : {}),
  };
};

const findRequest = (id: string): MockShopRequest => {
  const request = readDb().shopRequests.find((candidate) => candidate.id === id);
  if (!request) throw new ApiError("Demande introuvable.", 404);
  return request;
};

// ── Validation : createShopRequestForm ──────
const oneOf = <T extends string>(value: unknown, allowed: Record<string, T>): value is T =>
  typeof value === "string" && (Object.values(allowed) as string[]).includes(value);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateInput = (body: Partial<ShopRequestInput>): string[] => {
  const errors: string[] = [];
  const nom = text(body.nom);
  if (!nom) errors.push("Le nom de la boutique est requis.");
  else if (nom.length < 2 || nom.length > 100) {
    errors.push("Le nom de la boutique doit compter entre 2 et 100 caractères.");
  }

  const description = text(body.description);
  if (!description) errors.push("La présentation de la boutique est requise.");
  else if (description.length < 20 || description.length > 1000) {
    errors.push("La présentation doit compter entre 20 et 1000 caractères.");
  }

  if (!Array.isArray(body.familleIds) || body.familleIds.length < 1 || body.familleIds.length > 20) {
    errors.push("Choisissez au moins un domaine d'activité.");
  }

  if (!body.sellerType) errors.push("Précisez si vous vendez en tant que particulier ou entreprise.");
  else if (!oneOf(body.sellerType, SellerType)) errors.push("Statut invalide.");

  if (body.sellerType === SellerType.ENTREPRISE) {
    const rccm = text(body.rccm);
    if (!rccm) errors.push("Le numéro RCCM est requis pour une entreprise.");
    else if (rccm.length < 5 || rccm.length > 50) {
      errors.push("Le numéro RCCM doit compter entre 5 et 50 caractères.");
    }
  }

  if (!body.experience) errors.push("Indiquez l'ancienneté de votre activité.");
  else if (!oneOf(body.experience, SellerExperience)) errors.push("Ancienneté invalide.");

  if (!body.catalogSize) errors.push("Indiquez le nombre de produits que vous comptez vendre.");
  else if (!oneOf(body.catalogSize, CatalogSize)) errors.push("Taille de catalogue invalide.");

  if (typeof body.hasPhysicalStore !== "boolean") {
    errors.push("Indiquez si vous disposez d'un point de vente.");
  }

  const adresse = text(body.adresse);
  if (!adresse) errors.push("L'adresse de la boutique est requise.");
  else if (adresse.length < 5 || adresse.length > 255) {
    errors.push("L'adresse doit compter entre 5 et 255 caractères.");
  }

  if (text(body.email) && !EMAIL_PATTERN.test(text(body.email))) {
    errors.push("Email de la boutique invalide.");
  }
  if (text(body.message).length > 1000) errors.push("Le message ne peut dépasser 1000 caractères.");

  if (body.acceptTerms !== true) {
    errors.push("Vous devez accepter les conditions de vente de la plateforme.");
  }
  return errors;
};

// ─────────────────────────────────────────────
//  Demandeur
// ─────────────────────────────────────────────
export const createRequest = (body: Partial<ShopRequestInput> = {}): ApiResponse<ShopRequest> => {
  const user = requireRole(EntityType.USER, EntityType.USER_SOCIETE, EntityType.SHOP);

  const errors = validateInput(body);
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);

  const input = body as ShopRequestInput;
  const db = readDb();
  const familleIds = [...new Set(input.familleIds.map(String))];

  if (db.shopRequests.some((request) => request.userId === user._id && request.status === ShopRequestStatus.PENDING)) {
    throw new ApiError(PENDING_CONFLICT_MESSAGE, 409);
  }
  if (allShops().some((shop) => sameName(shop.nom, input.nom))) {
    throw new ApiError(NAME_CONFLICT_MESSAGE, 409);
  }
  if (!familleIds.every((id) => FAMILLES.some((famille) => famille.id === id && famille.actif))) {
    throw new ApiError("Domaine d'activité introuvable.", 400);
  }

  const now = new Date().toISOString();
  const request: MockShopRequest = {
    id: objectId(),
    userId: user._id,
    nom: input.nom.trim(),
    description: input.description.trim(),
    familleIds,
    sellerType: input.sellerType,
    rccm: input.sellerType === SellerType.ENTREPRISE ? text(input.rccm) : null,
    experience: input.experience,
    catalogSize: input.catalogSize,
    hasPhysicalStore: input.hasPhysicalStore,
    adresse: input.adresse.trim(),
    email: text(input.email).toLowerCase() || null,
    message: text(input.message) || null,
    acceptedTermsAt: now,
    status: ShopRequestStatus.PENDING,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    shopId: null,
    createdAt: now,
    updatedAt: now,
  };
  db.shopRequests.push(request);
  writeDb(db);

  return ok(toDto(request, false), "Demande envoyée. L'administration va l'examiner.", 201);
};

export const myRequests = (): ApiResponse<ShopRequest[]> => {
  const user = currentUser();
  const mine = readDb()
    .shopRequests.filter((request) => request.userId === user._id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ok(mine.map((request) => toDto(request, false)), "Demandes récupérées avec succès");
};

export const cancelRequest = (id: string): ApiResponse<ShopRequest> => {
  const user = currentUser();
  const db = readDb();
  const request = findRequest(id);
  if (request.userId !== user._id) {
    throw new ApiError("Vous ne pouvez annuler que vos propres demandes.", 403);
  }
  if (request.status !== ShopRequestStatus.PENDING) throw new ApiError(alreadyReviewed(request.status), 400);

  request.status = ShopRequestStatus.CANCELLED;
  request.updatedAt = new Date().toISOString();
  writeDb(db);
  return ok(toDto(request, false), "Demande annulée.");
};

export const getRequest = (id: string): ApiResponse<ShopRequest> => {
  const user = currentUser();
  const request = findRequest(id);
  if (user.role !== EntityType.ADMIN && request.userId !== user._id) {
    throw new ApiError("Vous ne pouvez consulter que vos propres demandes.", 403);
  }
  return ok(toDto(request, true), "Demande récupérée avec succès");
};

// ─────────────────────────────────────────────
//  Administration
// ─────────────────────────────────────────────
export const listRequests = (
  params: URLSearchParams
): ApiResponse<{ requests: ShopRequest[]; total: number; page: number; totalPages: number; counts: ShopRequestCounts }> => {
  requireRole(EntityType.ADMIN);

  const status = params.get("status");
  if (status && !(SHOP_REQUEST_STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(`Statut invalide. Valeurs acceptées : ${SHOP_REQUEST_STATUSES.join(", ")}.`, 422);
  }
  const search = params.get("search")?.trim().toLowerCase();
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 10)));

  const all = readDb().shopRequests;
  const filtered = all
    .filter((request) => (!status || request.status === status) && (!search || request.nom.toLowerCase().includes(search)))
    // En attente : une file, les plus anciennes d'abord. Sinon : un historique.
    .sort((a, b) =>
      status === ShopRequestStatus.PENDING
        ? a.createdAt.localeCompare(b.createdAt)
        : b.updatedAt.localeCompare(a.updatedAt)
    );

  const counts = Object.fromEntries(
    SHOP_REQUEST_STATUSES.map((value) => [value, all.filter((request) => request.status === value).length])
  ) as ShopRequestCounts;

  return ok(
    {
      requests: filtered.slice((page - 1) * limit, page * limit).map((request) => toDto(request, true)),
      total: filtered.length,
      page,
      totalPages: Math.ceil(filtered.length / limit),
      counts,
    },
    "Demandes récupérées avec succès"
  );
};

/**
 * La boutique est créée avec les réponses de la demande, le compte devient
 * gérant. En mode simulé, la session lit le rôle dans le compte : le gérant
 * n'a pas à se reconnecter, comme avec le vrai back.
 */
export const approveRequest = (id: string): ApiResponse<ShopRequest> => {
  const admin = requireRole(EntityType.ADMIN);
  const db = readDb();
  const request = findRequest(id);
  if (request.status !== ShopRequestStatus.PENDING) throw new ApiError(alreadyReviewed(request.status), 400);

  const user = db.users.find((candidate) => candidate._id === request.userId);
  if (!user) throw new ApiError("Le compte du demandeur n'existe plus.", 404);

  if (allShops().some((shop) => sameName(shop.nom, request.nom))) {
    throw new ApiError(
      "Une boutique porte déjà ce nom : refusez la demande en invitant le demandeur à en choisir un autre.",
      409
    );
  }

  const now = new Date().toISOString();
  const shopId = objectId();
  db.shops.push({
    id: shopId,
    ownerId: user._id,
    nom: request.nom,
    description: request.description,
    logo: null,
    email: request.email ?? user.email,
    adresse: request.adresse,
    createdAt: now,
    updatedAt: now,
  });

  if (user.role !== EntityType.SHOP && user.role !== EntityType.ADMIN) {
    user.role = EntityType.SHOP;
    user.updatedAt = now;
    const login = db.logins.find((candidate) => candidate.entityId === user._id);
    if (login) login.entityType = EntityType.SHOP;
  }

  Object.assign(request, {
    status: ShopRequestStatus.APPROVED,
    rejectionReason: null,
    reviewedBy: admin._id,
    reviewedAt: now,
    shopId,
    updatedAt: now,
  });
  writeDb(db);

  return ok(toDto(request, true), "Demande approuvée : la boutique est ouverte.");
};

export const rejectRequest = (id: string, body: { reason?: unknown } = {}): ApiResponse<ShopRequest> => {
  const admin = requireRole(EntityType.ADMIN);

  const reason = text(body.reason);
  if (!reason) throw new ApiError("Le motif du refus est requis.", 422);
  if (reason.length < 10 || reason.length > 500) {
    throw new ApiError("Le motif doit compter entre 10 et 500 caractères.", 422);
  }

  const db = readDb();
  const request = findRequest(id);
  if (request.status !== ShopRequestStatus.PENDING) throw new ApiError(alreadyReviewed(request.status), 400);

  const now = new Date().toISOString();
  Object.assign(request, {
    status: ShopRequestStatus.REJECTED,
    rejectionReason: reason,
    reviewedBy: admin._id,
    reviewedAt: now,
    updatedAt: now,
  });
  writeDb(db);

  return ok(toDto(request, true), "Demande refusée.");
};
