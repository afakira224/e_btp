import type { SupportParty, SupportTicket } from "../../../../entities/support";

const dateTime = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const deadline = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const formatMoment = (iso: string): string => dateTime.format(new Date(iso));
export const formatDue = (iso: string): string => deadline.format(new Date(iso));

/** « dans 2 jours », « dans 5 heures » ; « dépassé » sinon. */
export const timeLeft = (iso: string, now = Date.now()): string => {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "dépassé";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `dans ${minutes} minute${minutes > 1 ? "s" : ""}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `dans ${hours} heure${hours > 1 ? "s" : ""}`;
  return `dans ${Math.round(hours / 24)} jours`;
};

export const PARTY_LABELS: Record<SupportParty, string> = {
  requester: "Demandeur",
  shop: "Boutique",
  admin: "Équipe",
  system: "Automatique",
};

/**
 * Qui doit agir et ce qui arrive faute de réponse, pour ce lecteur : la
 * phrase qui rend les délais automatiques prévisibles.
 */
export const nextStepFor = (ticket: SupportTicket, now = Date.now()): string | null => {
  const due = ticket.deadlineAt ? `${formatDue(ticket.deadlineAt)} (${timeLeft(ticket.deadlineAt, now)})` : null;
  /** « avant le jeu. 5 nov. (dans 3 jours) », ou rien quand la demande n'a pas d'échéance propre. */
  const before = due ? ` avant le ${due}` : "";
  const me = ticket.viewer;
  switch (ticket.status) {
    case "awaiting_shop":
      if (ticket.type === "return") {
        return me === "shop"
          ? "Acceptez ou refusez le retour depuis la commande : sans réponse sous 48 heures, l'administration tranche."
          : "La boutique doit accepter ou refuser le retour sous 48 heures ; sans réponse, l'administration tranche.";
      }
      if (me === "shop") return `Répondez${before} : sans réponse, la demande passe à l'administration.`;
      return `La boutique doit répondre${before}. Sans réponse, l'administration prend la main.`;
    case "awaiting_requester":
      if (me === "requester") {
        return ticket.escalatedAt
          ? `L'équipe attend votre réponse${before}.`
          : `Votre réponse est attendue${before} ; sans réponse, la demande sera fermée.`;
      }
      return due ? `En attente du demandeur jusqu'au ${due}.` : "En attente du demandeur.";
    case "awaiting_admin":
      if (me !== "admin") return "L'équipe de la plateforme examine la demande et répond sous 24 heures, tranche sous 72 heures.";
      // Un retour en litige suit la commande : il se tranche depuis elle.
      if (ticket.type === "return") return "Litige à trancher depuis la commande liée : la décision clôt aussi cette demande.";
      return `Décision attendue${before}.`;
    case "resolved":
      if (!ticket.availableActions.includes("appeal")) return "Demande résolue.";
      return due ? `Vous pouvez former un recours jusqu'au ${due}.` : "Vous pouvez former un recours pendant 7 jours.";
    case "closed":
      return ticket.availableActions.includes("reopen") ? "Fermée. Vous pouvez la rouvrir pendant 14 jours si le problème revient." : "Demande fermée.";
    default:
      return null;
  }
};

