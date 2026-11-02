import { apiClient } from "../../../../shared/api";
import type {
  Sanction,
  SanctionTargetKind,
  SanctionType,
  SupportAction,
  SupportParty,
  SupportScope,
  SupportTicket,
  SupportTicketType,
} from "../../../../entities/support";

// ─────────────────────────────────────────────
//  Support — appels réseau.
//
//   POST  /support/tickets (multipart)   · POST /support/contact
//   GET   /support/tickets?scope=&…      · GET  /support/tickets/:id
//   POST  /support/tickets/:id/messages  · PATCH /support/tickets/:id/:action
//   POST  /sanctions · GET /sanctions · GET /sanctions/mine
//   PATCH /sanctions/:id/lift · PATCH /sanctions/:id/request-lift
// ─────────────────────────────────────────────

/** Avec des fichiers, multipart comme multer l'attend ; sinon JSON. */
const bodyOf = (fields: Record<string, string | boolean | undefined>, files: File[] = []): unknown => {
  const defined = Object.entries(fields).filter(([, value]) => value !== undefined && value !== "");
  if (files.length === 0) return Object.fromEntries(defined);
  const form = new FormData();
  for (const [key, value] of defined) form.append(key, String(value));
  for (const file of files) form.append("attachments", file);
  return form;
};

export interface NewTicketInput {
  type: SupportTicketType;
  reason: string;
  description: string;
  subject?: string | undefined;
  targetId?: string | undefined;
  shopId?: string | undefined;
  attachments?: File[] | undefined;
}

export const createSupportTicket = async ({ attachments = [], ...fields }: NewTicketInput): Promise<SupportTicket> => {
  const response = await apiClient.post<SupportTicket>("/support/tickets", bodyOf(fields, attachments));
  if (!response.data) throw new Error("La demande n'a pas pu être enregistrée.");
  return response.data;
};

export interface ContactInput {
  name: string;
  email: string;
  message: string;
  subject?: string | undefined;
  reason?: string | undefined;
}

export const contactSupport = async (input: ContactInput): Promise<string> => {
  const response = await apiClient.post<{ number: string }>("/support/contact", input);
  return response.message;
};

export interface TicketQuery {
  scope: SupportScope;
  boutiqueId?: string | undefined;
  tab?: string | undefined;
  type?: SupportTicketType | undefined;
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface TicketPage {
  items: SupportTicket[];
  total: number;
  page: number;
  totalPages: number;
  counts: Record<string, number>;
}

export const fetchSupportTickets = async (query: TicketQuery, signal?: AbortSignal): Promise<TicketPage> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const response = await apiClient.get<{ tickets: SupportTicket[]; total: number; page: number; totalPages: number; counts: Record<string, number> }>(
    `/support/tickets?${params.toString()}`,
    signal
  );
  const data = response.data;
  if (!data) throw new Error("Demandes introuvables.");
  return { items: data.tickets, total: data.total, page: data.page, totalPages: data.totalPages, counts: data.counts };
};

export const fetchSupportTicket = async (id: string, signal?: AbortSignal): Promise<SupportTicket> => {
  const response = await apiClient.get<SupportTicket>(`/support/tickets/${encodeURIComponent(id)}`, signal);
  if (!response.data) throw new Error("Demande introuvable.");
  return response.data;
};

export const postSupportMessage = async (
  id: string,
  input: { body: string; internal?: boolean | undefined; waitFor?: SupportParty | undefined; attachments?: File[] | undefined }
): Promise<SupportTicket> => {
  const { attachments = [], ...fields } = input;
  const response = await apiClient.post<SupportTicket>(
    `/support/tickets/${encodeURIComponent(id)}/messages`,
    bodyOf({ body: fields.body, internal: fields.internal ? true : undefined, waitFor: fields.waitFor }, attachments)
  );
  if (!response.data) throw new Error("Le message n'a pas pu être envoyé.");
  return response.data;
};

export interface TicketActionInput {
  kind?: string | undefined;
  details?: string | undefined;
  outcome?: string | undefined;
  note?: string | undefined;
  reason?: string | undefined;
  rating?: number | undefined;
  comment?: string | undefined;
  assignee?: string | undefined;
}

export const performSupportAction = async (id: string, action: SupportAction, input: TicketActionInput = {}): Promise<SupportTicket> => {
  const defined = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
  const response = await apiClient.patch<SupportTicket>(`/support/tickets/${encodeURIComponent(id)}/${action}`, defined);
  if (!response.data) throw new Error("La demande n'a pas pu être mise à jour.");
  return response.data;
};

// ── Sanctions ───────────────────────────────
export const fetchMySanctions = async (signal?: AbortSignal): Promise<Sanction[]> =>
  (await apiClient.get<Sanction[]>("/sanctions/mine", signal)).data ?? [];

export const fetchSanctions = async (
  query: { targetKind?: SanctionTargetKind | undefined; targetId?: string | undefined; pending?: boolean | undefined },
  signal?: AbortSignal
): Promise<Sanction[]> => {
  const params = new URLSearchParams();
  if (query.targetKind) params.set("targetKind", query.targetKind);
  if (query.targetId) params.set("targetId", query.targetId);
  if (query.pending) params.set("pending", "true");
  return (await apiClient.get<Sanction[]>(`/sanctions?${params.toString()}`, signal)).data ?? [];
};

export interface SanctionInput {
  type: SanctionType;
  targetKind: SanctionTargetKind;
  targetId: string;
  reason: string;
  ticketId?: string | undefined;
  days?: number | undefined;
}

export const createSanction = async (input: SanctionInput): Promise<Sanction> => {
  const response = await apiClient.post<Sanction>("/sanctions", input);
  if (!response.data) throw new Error("La mesure n'a pas pu être appliquée.");
  return response.data;
};

export const liftSanction = async (id: string, reason?: string): Promise<Sanction> => {
  const response = await apiClient.patch<Sanction>(`/sanctions/${encodeURIComponent(id)}/lift`, reason ? { reason } : {});
  if (!response.data) throw new Error("La mesure n'a pas pu être levée.");
  return response.data;
};

export const requestSanctionLift = async (id: string): Promise<Sanction> => {
  const response = await apiClient.patch<Sanction>(`/sanctions/${encodeURIComponent(id)}/request-lift`);
  if (!response.data) throw new Error("La demande n'a pas pu être transmise.");
  return response.data;
};
