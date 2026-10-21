import { vi } from "vitest";
import type { Request, Response } from "express";

export interface MockResponse extends Response {
  /** Dernier code HTTP passé à res.status() */
  statusCode: number;
  /** Dernier payload passé à res.json() */
  body: any;
}

/**
 * Fausse session express-session : regenerate / save / destroy appellent
 * immédiatement leur callback, et `user` reflète l'état courant.
 * `regenerate` change `sessionID` comme le ferait le vrai middleware.
 */
export const mockExpressSession = (user?: Record<string, any> | undefined) => {
  const store: { user?: Record<string, any> | undefined } = { user };

  const session: any = {
    get user() {
      return store.user;
    },
    set user(value: Record<string, any> | undefined) {
      store.user = value;
    },
    regenerate: vi.fn((cb: (err?: any) => void) => {
      store.user = undefined;
      cb();
    }),
    save: vi.fn((cb: (err?: any) => void) => cb()),
    destroy: vi.fn((cb: (err?: any) => void) => {
      store.user = undefined;
      cb();
    }),
    touch: vi.fn(),
    cookie: {},
  };

  return session;
};

export type MockExpressSession = ReturnType<typeof mockExpressSession>;

/**
 * Construit un faux objet Request Express.
 * `session` / `sessionID` portent l'identité : c'est là que requireAuth lit.
 * `user` simule ce que requireAuth a déjà renseigné, pour tester un contrôleur seul.
 */
export const mockRequest = (init: {
  params?: Record<string, any>;
  body?: Record<string, any>;
  query?: Record<string, any>;
  headers?: Record<string, any>;
  session?: any;
  sessionID?: string;
  user?: { id: string; entityType: string };
} = {}): Request =>
  ({
    params: init.params ?? {},
    body: init.body ?? {},
    query: init.query ?? {},
    headers: init.headers ?? {},
    session: init.session ?? mockExpressSession(),
    sessionID: init.sessionID ?? "sid-de-test",
    ...(init.user ? { user: init.user } : {}),
  }) as unknown as Request;

/**
 * Construit un faux objet Response Express chaînable.
 * res.status(x).json(y) enregistre x dans `statusCode` et y dans `body`.
 */
export const mockResponse = (): MockResponse => {
  const res = {} as MockResponse;

  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as any;

  res.json = vi.fn((payload: any) => {
    res.body = payload;
    return res;
  }) as any;

  res.send = vi.fn(() => res) as any;

  res.clearCookie = vi.fn(() => res) as any;

  return res;
};

/** Fausse session Mongoose : transaction en mémoire, entièrement espionnable. */
export const mockSession = () => ({
  startTransaction: vi.fn(),
  commitTransaction: vi.fn().mockResolvedValue(undefined),
  abortTransaction: vi.fn().mockResolvedValue(undefined),
  endSession: vi.fn().mockResolvedValue(undefined),
});

export type MockSession = ReturnType<typeof mockSession>;
