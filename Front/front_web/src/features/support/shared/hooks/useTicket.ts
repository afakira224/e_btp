import { useCallback, useState } from "react";
import type { SupportTicket } from "../../../../entities/support";
import { useResource } from "../../../catalog";
import { fetchSupportTicket } from "../api/support.api";

/** Une demande ; après un message ou une action, la réponse du serveur fait foi. */
export const useTicket = (id: string) => {
  const [version, setVersion] = useState(0);
  const load = useCallback((signal: AbortSignal) => fetchSupportTicket(id, signal), [id]);
  const resource = useResource<SupportTicket | null>(load, null, `${id}:${version}`);
  const [updated, setUpdated] = useState<SupportTicket | null>(null);
  const fresh = resource.data?.id === id ? resource.data : null;
  // La version renvoyée par une écriture vaut jusqu'à la prochaine relecture.
  const ticket = updated?.id === id && (!fresh || updated.updatedAt >= fresh.updatedAt) ? { ...fresh, ...updated } : fresh;
  return {
    ticket: ticket as SupportTicket | null,
    isLoading: resource.isLoading,
    error: resource.error,
    replace: setUpdated,
    reload: () => setVersion((value) => value + 1),
  };
};
