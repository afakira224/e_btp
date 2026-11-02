import type { SupportTicketType } from "../../../../entities/support";

// Chemins du support côté client et visiteur, construits en un seul endroit.
// L'espace boutique et l'administration ont les leurs (sellerPaths, adminPaths).
export const supportPaths = {
  contact: "/contact",
  list: "/compte/support",
  ticket: (id: string) => `/compte/support/${encodeURIComponent(id)}`,
  /** Ouvrir une demande sur une cible : commande, annonce, boutique, mesure. */
  create: (type: SupportTicketType, target?: { id: string; label?: string | undefined }) => {
    const query = new URLSearchParams({ type });
    if (target) {
      query.set("cible", target.id);
      if (target.label) query.set("libelle", target.label);
    }
    return `/compte/support/nouvelle?${query.toString()}`;
  },
} as const;
