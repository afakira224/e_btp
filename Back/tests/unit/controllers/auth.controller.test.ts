import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// Les helpers de session touchent au store MongoDB : on les simule pour
// vérifier qu'ils sont appelés, sans base réelle.
vi.mock("../../../src/shared/config/session.config.js", () => ({
  regenerateSession: vi.fn(),
  destroySession: vi.fn(),
  destroyUserSessions: vi.fn(),
}));

vi.mock("../../../src/models/user.model.js", async () => {
  // Seul le modèle Mongoose est simulé : l'enum EntityType reste réel.
  const actual = await import("../../../src/models/user.model.js");
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, User: mockModel(), EntitiesLogin: mockModel() };
});

// Les emails partent dans une file asynchrone : on vérifie l'appel, pas l'envoi.
vi.mock("../../../src/shared/helpers/mail.helper.js", () => ({
  sendWelcomeMail: vi.fn(() => 1),
  sendVerifyEmailMail: vi.fn(() => 2),
  sendForgotPasswordMail: vi.fn(() => 3),
  sendPasswordChangedMail: vi.fn(() => 4),
}));

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import {
  destroySession,
  destroyUserSessions,
  regenerateSession,
} from "../../../src/shared/config/session.config.js";
import { EntitiesLogin, EntityType, User } from "../../../src/models/user.model.js";
import {
  sendForgotPasswordMail,
  sendVerifyEmailMail,
  sendWelcomeMail,
} from "../../../src/shared/helpers/mail.helper.js";
import {
  changePassword,
  forgotPassword,
  login,
  logout,
  logoutAll,
  me,
  register,
  resendVerification,
  resetPassword,
  updateMe,
  updateProjet,
  verifyEmail,
} from "../../../src/controllers/authController.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import {
  mockExpressSession,
  mockRequest,
  mockResponse,
  mockSession,
} from "../../helpers/express.mock.js";
import { makeUser, oid } from "../../helpers/factories.js";

const UserMock = User as unknown as Record<string, any>;
const LoginMock = EntitiesLogin as unknown as Record<string, any>;

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

/** Faux document EntitiesLogin, avec comparePassword pilotable. */
const makeLogin = (over: Record<string, any> = {}) => {
  const doc: any = {
    _id: oid(),
    entityId: oid(),
    email: "mamadou.diallo@example.com",
    password: "hash",
    entityType: EntityType.USER,
    emailVerifyToken: null,
    resetPasswordToken: null,
    resetPasswordExpires: null,
    comparePassword: vi.fn().mockResolvedValue(true),
    ...over,
  };
  doc.save = vi.fn().mockResolvedValue(doc);
  return doc;
};

/** Requête authentifiée : l'identité provient de la session, jamais du corps. */
const authed = (
  userId: string,
  init: Parameters<typeof mockRequest>[0] = {},
  entityType: EntityType = EntityType.USER
) => {
  const identite = { id: userId, entityType };
  const req = mockRequest({ ...init, session: mockExpressSession(identite) });
  req.user = identite;
  return req;
};

beforeEach(() => {
  session = mockSession();

  // `restoreMocks` vide les implémentations entre les tests : on les repose.
  vi.mocked(regenerateSession).mockImplementation(async (req: any, user: any) => {
    req.session.user = user;
  });
  vi.mocked(destroySession).mockImplementation(async (req: any) => {
    req.session.user = undefined;
  });
  vi.mocked(destroyUserSessions).mockResolvedValue(0);

  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  UserMock.findOne.mockReturnValue(mockQuery(null));
  UserMock.findById.mockReturnValue(mockQuery(null));
  UserMock.findByIdAndUpdate.mockReturnValue(mockQuery(null));
  UserMock.findOneAndUpdate.mockReturnValue(mockQuery(null));
  UserMock.create.mockImplementation(async (docs: any[]) => [makeUser(docs[0])]);

  LoginMock.findOne.mockReturnValue(mockQuery(null));
  LoginMock.findOneAndUpdate.mockReturnValue(mockQuery(null));
  LoginMock.create.mockImplementation(async (docs: any[]) => [makeLogin(docs[0])]);
});

// ─────────────────────────────────────────────
describe("register", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    nom: "Diallo",
    prenom: "Mamadou",
    email: "mamadou.diallo@example.com",
    telephone: "620000000",
    password: "MotDePasse1!",
    role: EntityType.USER,
    ...over,
  });

  it("renvoie 422 quand la validation échoue", async () => {
    failValidation(["Email invalide."]);
    const res = mockResponse();

    await register(mockRequest({ body: {} }), res);

    expect(res.statusCode).toBe(422);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(UserMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 409 quand l'email est déjà utilisé", async () => {
    UserMock.findOne.mockReturnValue(mockQuery(makeUser()));
    const res = mockResponse();

    await register(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Email déjà utilisé.");
    expect(UserMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 201 sans exposer de données", async () => {
    const res = mockResponse();

    await register(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toBeNull();
    expect(res.body.message).toContain("Vérifie ton email");
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("enregistre le projet décrit à l'inscription", async () => {
    await register(
      mockRequest({ body: body({ projet: { types: ["construction", "construction"], avancement: "gros_oeuvre" } }) }),
      mockResponse()
    );

    expect(UserMock.create.mock.calls[0]![0][0].projet).toMatchObject({
      types: ["construction"],
      avancement: "gros_oeuvre",
      renseigneLe: expect.any(Date),
    });
  });

  it("n'enregistre aucun projet quand le client passe la question", async () => {
    await register(mockRequest({ body: body({ projet: { types: [], avancement: null } }) }), mockResponse());

    expect(UserMock.create.mock.calls[0]![0][0].projet).toBeNull();
  });

  it("ne stocke jamais le mot de passe sur le profil utilisateur", async () => {
    await register(mockRequest({ body: body() }), mockResponse());

    expect(UserMock.create.mock.calls[0]![0][0]).not.toHaveProperty("password");
  });

  it("crée la session de connexion avec un jeton de vérification", async () => {
    await register(mockRequest({ body: body() }), mockResponse());

    const created = LoginMock.create.mock.calls[0]![0][0];
    expect(created.password).toBe("MotDePasse1!");
    expect(created.emailVerifyToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("envoie l'email de vérification avec le même jeton", async () => {
    await register(mockRequest({ body: body() }), mockResponse());

    const jetonEnBase = LoginMock.create.mock.calls[0]![0][0].emailVerifyToken;
    const [, jetonEnvoye] = vi.mocked(sendVerifyEmailMail).mock.calls[0]!;
    expect(jetonEnvoye).toBe(jetonEnBase);
  });

  it("n'échoue pas si l'email ne part pas", async () => {
    vi.mocked(sendVerifyEmailMail).mockImplementationOnce(() => {
      throw new Error("SMTP indisponible");
    });
    const res = mockResponse();

    await register(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(201);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("renvoie 500 et annule la transaction en cas d'erreur", async () => {
    UserMock.create.mockRejectedValue(new Error("index en double"));
    const res = mockResponse();

    await register(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(500);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("login", () => {
  const credentials = { email: "mamadou.diallo@example.com", password: "MotDePasse1!" };

  const setup = (over: { user?: any; login?: any } = {}) => {
    const user = over.user === null ? null : (over.user ?? makeUser({ isEmailVerified: true }));
    const loginDoc = over.login === null ? null : (over.login ?? makeLogin());
    UserMock.findOne.mockReturnValue(mockQuery(user));
    LoginMock.findOne.mockReturnValue(mockQuery(loginDoc));
    return { user, loginDoc };
  };

  it("renvoie le profil en cas de succès, sans aucun jeton", async () => {
    setup();
    const res = mockResponse();

    await login(mockRequest({ body: credentials }), res);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data).not.toHaveProperty("accessToken");
    expect(res.body.data).not.toHaveProperty("refreshToken");
  });

  it("ouvre une session portant l'identité et le rôle", async () => {
    const { user } = setup({ user: makeUser({ isEmailVerified: true, role: EntityType.SHOP }) });
    const req = mockRequest({ body: credentials });

    await login(req, mockResponse());

    expect(regenerateSession).toHaveBeenCalledWith(req, {
      id: String(user!._id),
      entityType: EntityType.SHOP,
    });
    expect(req.session.user).toEqual({
      id: String(user!._id),
      entityType: EntityType.SHOP,
    });
  });

  it("renouvelle l'identifiant de session (parade à la fixation)", async () => {
    setup();
    const req = mockRequest({ body: credentials });

    await login(req, mockResponse());

    expect(regenerateSession).toHaveBeenCalledOnce();
  });

  it("renvoie 500 si la session ne peut pas être ouverte", async () => {
    setup();
    vi.mocked(regenerateSession).mockRejectedValueOnce(new Error("store indisponible"));
    const res = mockResponse();

    await login(mockRequest({ body: credentials }), res);

    expect(res.statusCode).toBe(500);
  });

  it("renvoie 401 quand l'utilisateur n'existe pas", async () => {
    setup({ user: null });
    const res = mockResponse();

    await login(mockRequest({ body: credentials }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Identifiants invalides.");
  });

  it("renvoie 401 quand la session de connexion est absente", async () => {
    setup({ login: null });
    const res = mockResponse();

    await login(mockRequest({ body: credentials }), res);

    expect(res.statusCode).toBe(401);
  });

  it("renvoie 401 sur mot de passe incorrect, sans révéler la cause", async () => {
    setup({ login: makeLogin({ comparePassword: vi.fn().mockResolvedValue(false) }) });
    const res = mockResponse();

    await login(mockRequest({ body: credentials }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Identifiants invalides.");
  });

  it("renvoie 403 quand l'email n'est pas vérifié", async () => {
    setup({ user: makeUser({ isEmailVerified: false }) });
    const res = mockResponse();

    await login(mockRequest({ body: credentials }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Email non vérifié.");
  });

  it("n'ouvre aucune session quand la connexion échoue", async () => {
    setup({ user: null });
    const req = mockRequest({ body: credentials });

    await login(req, mockResponse());

    expect(regenerateSession).not.toHaveBeenCalled();
    expect(req.session.user).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
describe("logout", () => {
  it("détruit la session courante", async () => {
    const req = authed(oid().toString());
    const res = mockResponse();

    await logout(req, res);

    expect(destroySession).toHaveBeenCalledWith(req);
    expect(req.session.user).toBeUndefined();
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Déconnexion réussie.");
  });

  it("demande au navigateur d'oublier le cookie", async () => {
    const res = mockResponse();

    await logout(authed(oid().toString()), res);

    expect(res.clearCookie).toHaveBeenCalledWith("btp.sid", { path: "/" });
  });

  it("reste idempotent sans session authentifiée", async () => {
    const res = mockResponse();

    await logout(mockRequest(), res);

    expect(res.body.success).toBe(true);
    expect(destroySession).toHaveBeenCalled();
  });

  it("renvoie 500 si la destruction échoue", async () => {
    vi.mocked(destroySession).mockRejectedValueOnce(new Error("store indisponible"));
    const res = mockResponse();

    await logout(authed(oid().toString()), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("logoutAll", () => {
  it("renvoie 401 sans session authentifiée", async () => {
    const res = mockResponse();

    await logoutAll(mockRequest(), res);

    expect(res.statusCode).toBe(401);
    expect(destroyUserSessions).not.toHaveBeenCalled();
  });

  it("révoque toutes les sessions de l'utilisateur", async () => {
    const id = oid().toString();
    vi.mocked(destroyUserSessions).mockResolvedValueOnce(3);
    const res = mockResponse();

    await logoutAll(authed(id), res);

    expect(destroyUserSessions).toHaveBeenCalledWith(id);
    expect(res.body.data).toEqual({ revoked: 3 });
  });

  it("ferme aussi la session courante et son cookie", async () => {
    const req = authed(oid().toString());
    const res = mockResponse();

    await logoutAll(req, res);

    expect(destroySession).toHaveBeenCalledWith(req);
    expect(res.clearCookie).toHaveBeenCalledWith("btp.sid", { path: "/" });
  });

  it("renvoie 500 en cas d'échec du store", async () => {
    vi.mocked(destroyUserSessions).mockRejectedValueOnce(new Error("mongo indisponible"));
    const res = mockResponse();

    await logoutAll(authed(oid().toString()), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("me", () => {
  it("renvoie le profil du porteur du token", async () => {
    const user = makeUser({ nom: "Diallo" });
    UserMock.findById.mockReturnValue(mockQuery(user));
    const id = String(user._id);
    const res = mockResponse();

    await me(authed(id), res);

    expect(UserMock.findById).toHaveBeenCalledWith(id);
    expect(res.body.data.nom).toBe("Diallo");
  });

  it("ignore un identifiant fourni dans l'URL", async () => {
    const user = makeUser();
    UserMock.findById.mockReturnValue(mockQuery(user));
    const monId = String(user._id);
    const idDAutrui = oid().toString();

    await me(authed(monId, { params: { id: idDAutrui } }), mockResponse());

    expect(UserMock.findById).toHaveBeenCalledWith(monId);
    expect(UserMock.findById).not.toHaveBeenCalledWith(idDAutrui);
  });

  it("renvoie 401 sans token", async () => {
    const res = mockResponse();

    await me(mockRequest(), res);

    expect(res.statusCode).toBe(401);
    expect(UserMock.findById).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand le profil n'existe plus", async () => {
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await me(authed(oid().toString()), res);

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────
describe("updateMe", () => {
  it("met à jour le profil du porteur du token", async () => {
    const user = makeUser({ nom: "Diallo" });
    UserMock.findByIdAndUpdate.mockReturnValue(mockQuery(user));
    const id = String(user._id);
    const res = mockResponse();

    await updateMe(authed(id, { body: { nom: "Bah" } }), res);

    expect(UserMock.findByIdAndUpdate).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ nom: "Bah" }),
      expect.objectContaining({ new: true })
    );
    expect(res.body.success).toBe(true);
  });

  it("ignore un id glissé dans le corps de la requête", async () => {
    const user = makeUser();
    UserMock.findByIdAndUpdate.mockReturnValue(mockQuery(user));
    const monId = String(user._id);
    const idDAutrui = oid().toString();

    await updateMe(authed(monId, { body: { id: idDAutrui, nom: "Pirate" } }), mockResponse());

    expect(UserMock.findByIdAndUpdate.mock.calls[0]![0]).toBe(monId);
  });

  it("renvoie 401 sans token", async () => {
    const res = mockResponse();

    await updateMe(mockRequest({ body: { nom: "Bah" } }), res);

    expect(res.statusCode).toBe(401);
    expect(UserMock.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand le profil n'existe plus", async () => {
    UserMock.findByIdAndUpdate.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateMe(authed(oid().toString(), { body: { nom: "Bah" } }), res);

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────
describe("updateProjet", () => {
  it("enregistre le projet du porteur de la session", async () => {
    const user = makeUser();
    UserMock.findByIdAndUpdate.mockReturnValue(mockQuery(user));
    const id = String(user._id);
    const res = mockResponse();

    await updateProjet(authed(id, { body: { types: ["renovation"], avancement: "revetements" } }), res);

    expect(UserMock.findByIdAndUpdate).toHaveBeenCalledWith(
      id,
      { projet: expect.objectContaining({ types: ["renovation"], avancement: "revetements" }) },
      expect.objectContaining({ new: true })
    );
    expect(res.body.message).toBe("Projet enregistré.");
  });

  it("un projet vide efface la réponse", async () => {
    UserMock.findByIdAndUpdate.mockReturnValue(mockQuery(makeUser()));

    await updateProjet(authed(oid().toString(), { body: {} }), mockResponse());

    expect(UserMock.findByIdAndUpdate.mock.calls[0]![1]).toEqual({ projet: null });
  });

  it("renvoie 422 quand la validation échoue", async () => {
    failValidation(["Type de projet invalide."]);
    const res = mockResponse();

    await updateProjet(authed(oid().toString(), { body: { types: ["chateau"] } }), res);

    expect(res.statusCode).toBe(422);
    expect(UserMock.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("renvoie 401 sans session", async () => {
    const res = mockResponse();

    await updateProjet(mockRequest({ body: { types: ["renovation"] } }), res);

    expect(res.statusCode).toBe(401);
  });

  it("renvoie 404 quand le profil n'existe plus", async () => {
    const res = mockResponse();

    await updateProjet(authed(oid().toString(), { body: { types: ["renovation"] } }), res);

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────
describe("changePassword", () => {
  it("renvoie 401 sans session authentifiée", async () => {
    const res = mockResponse();

    await changePassword(
      mockRequest({ body: { currentPassword: "a", newPassword: "b" } }),
      res
    );

    expect(res.statusCode).toBe(401);
    expect(LoginMock.findOne).not.toHaveBeenCalled();
  });

  it("cherche la session de connexion par l'identité de la session", async () => {
    const id = oid().toString();
    LoginMock.findOne.mockReturnValue(mockQuery(makeLogin()));
    UserMock.findById.mockReturnValue(mockQuery(makeUser()));

    await changePassword(
      authed(id, { body: { currentPassword: "Ancien1!", newPassword: "Nouveau1!" } }),
      mockResponse()
    );

    expect(LoginMock.findOne).toHaveBeenCalledWith({ entityId: id });
  });

  it("ignore un id glissé dans le corps de la requête", async () => {
    const monId = oid().toString();
    const idDAutrui = oid().toString();
    LoginMock.findOne.mockReturnValue(mockQuery(makeLogin()));
    UserMock.findById.mockReturnValue(mockQuery(makeUser()));

    await changePassword(
      authed(monId, {
        body: { id: idDAutrui, currentPassword: "Ancien1!", newPassword: "Nouveau1!" },
      }),
      mockResponse()
    );

    expect(LoginMock.findOne).toHaveBeenCalledWith({ entityId: monId });
  });

  it("renvoie 404 quand la session de connexion est introuvable", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await changePassword(
      authed(oid().toString(), { body: { currentPassword: "a", newPassword: "b" } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("refuse un mot de passe actuel incorrect", async () => {
    LoginMock.findOne.mockReturnValue(
      mockQuery(makeLogin({ comparePassword: vi.fn().mockResolvedValue(false) }))
    );
    const res = mockResponse();

    await changePassword(
      authed(oid().toString(), { body: { currentPassword: "faux", newPassword: "Nouveau1!" } }),
      res
    );

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("enregistre le nouveau mot de passe", async () => {
    const loginDoc = makeLogin();
    LoginMock.findOne.mockReturnValue(mockQuery(loginDoc));
    UserMock.findById.mockReturnValue(mockQuery(makeUser()));

    await changePassword(
      authed(oid().toString(), {
        body: { currentPassword: "Ancien1!", newPassword: "Nouveau1!" },
      }),
      mockResponse()
    );

    expect(loginDoc.password).toBe("Nouveau1!");
    expect(loginDoc.save).toHaveBeenCalled();
  });

  it("révoque les autres sessions et renouvelle celle en cours", async () => {
    const id = oid().toString();
    LoginMock.findOne.mockReturnValue(mockQuery(makeLogin()));
    const req = authed(id, {
      body: { currentPassword: "Ancien1!", newPassword: "Nouveau1!" },
    });

    await changePassword(req, mockResponse());

    // La session courante est épargnée : l'utilisateur reste connecté ici.
    expect(destroyUserSessions).toHaveBeenCalledWith(id, req.sessionID);
    expect(regenerateSession).toHaveBeenCalledWith(req, {
      id,
      entityType: EntityType.USER,
    });
  });

  it("ne révoque rien quand le mot de passe actuel est faux", async () => {
    LoginMock.findOne.mockReturnValue(
      mockQuery(makeLogin({ comparePassword: vi.fn().mockResolvedValue(false) }))
    );

    await changePassword(
      authed(oid().toString(), { body: { currentPassword: "faux", newPassword: "Nouveau1!" } }),
      mockResponse()
    );

    expect(destroyUserSessions).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("forgotPassword", () => {
  it("renvoie 404 quand l'email est inconnu", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await forgotPassword(mockRequest({ body: { email: "inconnu@example.com" } }), res);

    expect(res.statusCode).toBe(404);
    expect(sendForgotPasswordMail).not.toHaveBeenCalled();
  });

  it("génère un jeton valable une heure", async () => {
    const loginDoc = makeLogin();
    LoginMock.findOne.mockReturnValue(mockQuery(loginDoc));
    UserMock.findOne.mockReturnValue(mockQuery(makeUser()));
    const avant = Date.now();

    await forgotPassword(mockRequest({ body: { email: loginDoc.email } }), mockResponse());

    expect(loginDoc.resetPasswordToken).toMatch(/^[0-9a-f]{64}$/);
    const expiration = loginDoc.resetPasswordExpires.getTime();
    expect(expiration).toBeGreaterThanOrEqual(avant + 59 * 60 * 1000);
    expect(expiration).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);
    expect(loginDoc.save).toHaveBeenCalledWith({ session });
  });

  it("envoie l'email avec le jeton généré", async () => {
    const loginDoc = makeLogin();
    LoginMock.findOne.mockReturnValue(mockQuery(loginDoc));
    UserMock.findOne.mockReturnValue(mockQuery(makeUser()));

    await forgotPassword(mockRequest({ body: { email: loginDoc.email } }), mockResponse());

    const [, jeton] = vi.mocked(sendForgotPasswordMail).mock.calls[0]!;
    expect(jeton).toBe(loginDoc.resetPasswordToken);
  });

  it("réussit même si le profil utilisateur est absent", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(makeLogin()));
    UserMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await forgotPassword(mockRequest({ body: { email: "x@example.com" } }), res);

    expect(res.body.success).toBe(true);
    expect(sendForgotPasswordMail).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("resetPassword", () => {
  it("refuse un jeton invalide ou expiré", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await resetPassword(
      mockRequest({ params: { token: "jeton-perime" }, body: { password: "Nouveau1!" } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Token invalide ou expiré.");
  });

  it("n'accepte qu'un jeton non expiré", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(makeLogin()));

    await resetPassword(
      mockRequest({ params: { token: "abc" }, body: { password: "Nouveau1!" } }),
      mockResponse()
    );

    expect(LoginMock.findOne).toHaveBeenCalledWith({
      resetPasswordToken: "abc",
      resetPasswordExpires: { $gt: expect.any(Date) },
    });
  });

  it("enregistre le nouveau mot de passe et invalide le jeton", async () => {
    const loginDoc = makeLogin({
      resetPasswordToken: "abc",
      resetPasswordExpires: new Date(Date.now() + 3_600_000),
    });
    LoginMock.findOne.mockReturnValue(mockQuery(loginDoc));
    const res = mockResponse();

    await resetPassword(
      mockRequest({ params: { token: "abc" }, body: { password: "Nouveau1!" } }),
      res
    );

    expect(loginDoc.password).toBe("Nouveau1!");
    expect(loginDoc.resetPasswordToken).toBeNull();
    expect(loginDoc.resetPasswordExpires).toBeNull();
    expect(loginDoc.save).toHaveBeenCalledWith({ session });
    expect(res.body.success).toBe(true);
  });

  it("ferme toutes les sessions ouvertes du compte", async () => {
    const loginDoc = makeLogin({
      resetPasswordToken: "abc",
      resetPasswordExpires: new Date(Date.now() + 3_600_000),
    });
    LoginMock.findOne.mockReturnValue(mockQuery(loginDoc));

    await resetPassword(
      mockRequest({ params: { token: "abc" }, body: { password: "Nouveau1!" } }),
      mockResponse()
    );

    // Aucune exception : un mot de passe réinitialisé a pu être compromis.
    expect(destroyUserSessions).toHaveBeenCalledWith(String(loginDoc.entityId));
  });

  it("ne révoque aucune session quand le jeton est invalide", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(null));

    await resetPassword(
      mockRequest({ params: { token: "perime" }, body: { password: "Nouveau1!" } }),
      mockResponse()
    );

    expect(destroyUserSessions).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("verifyEmail", () => {
  it("refuse un jeton inconnu", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await verifyEmail(mockRequest({ params: { token: "inconnu" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Token invalide.");
  });

  it("marque l'email comme vérifié et consomme le jeton", async () => {
    const loginDoc = makeLogin({ emailVerifyToken: "abc" });
    LoginMock.findOne.mockReturnValue(mockQuery(loginDoc));
    UserMock.findOneAndUpdate.mockReturnValue(mockQuery(makeUser({ isEmailVerified: true })));
    const res = mockResponse();

    await verifyEmail(mockRequest({ params: { token: "abc" } }), res);

    expect(loginDoc.emailVerifyToken).toBeNull();
    expect(UserMock.findOneAndUpdate).toHaveBeenCalledWith(
      { email: loginDoc.email },
      { isEmailVerified: true },
      expect.objectContaining({ new: true })
    );
    expect(res.body.success).toBe(true);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("envoie l'email de bienvenue après vérification", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(makeLogin({ emailVerifyToken: "abc" })));
    UserMock.findOneAndUpdate.mockReturnValue(mockQuery(makeUser()));

    await verifyEmail(mockRequest({ params: { token: "abc" } }), mockResponse());

    expect(sendWelcomeMail).toHaveBeenCalledOnce();
  });

  it("renvoie 404 quand aucun profil ne correspond", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(makeLogin({ emailVerifyToken: "abc" })));
    UserMock.findOneAndUpdate.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await verifyEmail(mockRequest({ params: { token: "abc" } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(sendWelcomeMail).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("resendVerification", () => {
  it("renvoie 404 quand l'identité du token ne correspond à rien", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(null));
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await resendVerification(authed(oid().toString()) as any, res);

    expect(res.statusCode).toBe(404);
  });

  it("refuse de renvoyer un email déjà vérifié", async () => {
    LoginMock.findOne.mockReturnValue(mockQuery(makeLogin()));
    UserMock.findById.mockReturnValue(mockQuery(makeUser({ isEmailVerified: true })));
    const res = mockResponse();

    await resendVerification(authed(oid().toString()) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Email déjà vérifié.");
    expect(sendVerifyEmailMail).not.toHaveBeenCalled();
  });

  it("génère un nouveau jeton et renvoie l'email", async () => {
    const loginDoc = makeLogin({ emailVerifyToken: "ancien" });
    LoginMock.findOne.mockReturnValue(mockQuery(loginDoc));
    UserMock.findById.mockReturnValue(mockQuery(makeUser({ isEmailVerified: false })));

    await resendVerification(authed(oid().toString()) as any, mockResponse());

    expect(loginDoc.emailVerifyToken).toMatch(/^[0-9a-f]{64}$/);
    expect(loginDoc.emailVerifyToken).not.toBe("ancien");
    expect(loginDoc.save).toHaveBeenCalledWith({ session });

    const [, jeton] = vi.mocked(sendVerifyEmailMail).mock.calls[0]!;
    expect(jeton).toBe(loginDoc.emailVerifyToken);
  });
});
