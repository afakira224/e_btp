import { SUPPORT_STATUS_TONES, type SupportTicket } from "../../../../entities/support";
import { StatusBadge } from "../../../../shared/ui";

/** Statut d'une demande, dit du point de vue de qui la lit (« À vous de répondre »). */
export const SupportStatusBadge = ({ ticket }: { ticket: Pick<SupportTicket, "status" | "statusLabel"> }) => (
  <StatusBadge tone={SUPPORT_STATUS_TONES[ticket.status]}>{ticket.statusLabel}</StatusBadge>
);
