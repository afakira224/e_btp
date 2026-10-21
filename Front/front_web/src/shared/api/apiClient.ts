import { env } from "../config/env";
import { httpClient, type ApiResponse } from "./httpClient";
import { mockClient } from "./mock/mockClient";

// ─────────────────────────────────────────────
//  Point d'entrée unique des appels réseau.
//
//  Les deux implémentations exposent la même surface, renvoient la même
//  enveloppe BaseResponse et lèvent les mêmes ApiError. Les features n'ont
//  donc aucune connaissance de celle qui est active : basculer sur le vrai
//  back se fait en changeant VITE_USE_MOCK, sans toucher une ligne de code
//  métier.
// ─────────────────────────────────────────────
export const apiClient = env.useMock ? mockClient : httpClient;

export type { ApiResponse };
