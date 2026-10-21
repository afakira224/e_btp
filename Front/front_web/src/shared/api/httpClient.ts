import { env } from "../config/env";
import { ApiError } from "./ApiError";

// Enveloppe commune à toutes les réponses du back (BaseResponse).
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  statusCode: number;
  data: T | null;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────
//  request
//  `credentials: "include"` est le cœur de l'authentification par session :
//  sans lui le navigateur n'envoie pas le cookie btp.sid et toute route
//  protégée répond 401.
// ─────────────────────────────────────────────
const request = async <T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> => {
  const { method = "GET", body, signal } = options;

  let response: Response;

  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    // Serveur injoignable, DNS, CORS bloqué : on ne sait rien du statut.
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError("Serveur injoignable. Vérifiez votre connexion.", 0);
  }

  // Une réponse sans corps JSON (502 d'un proxy, 204) ne doit pas faire planter.
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.message ?? "Une erreur est survenue.",
      payload?.statusCode ?? response.status
    );
  }

  return (
    payload ?? { success: true, message: "", statusCode: response.status, data: null }
  );
};

export const httpClient = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
