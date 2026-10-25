const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const historyFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** « mar. 27 oct., 14:30 » — une échéance se lit avec son jour de la semaine. */
export const formatDeadline = (iso: string): string => dateTimeFormat.format(new Date(iso));

/** « 24 sept., 14:30 » — une étape de l'historique. */
export const formatStep = (iso: string): string => historyFormat.format(new Date(iso));

/** « dans 2 jours », « dans 5 heures », « dans 20 minutes » ; « dépassé » sinon. */
export const timeLeft = (iso: string, now = Date.now()): string => {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "dépassé";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `dans ${minutes} minute${minutes > 1 ? "s" : ""}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `dans ${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `dans ${days} jours`;
};

/** Référence de sous-commande : « CMD-…-123456-2 » → « CMD-123456-2 ». */
export const shortPartReference = (reference: string): string => {
  const parts = reference.split("-");
  if (parts.length < 4) return reference;
  return `${parts[0]}-${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
};
