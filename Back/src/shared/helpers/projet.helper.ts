import { AvancementChantier, TypeProjet, type IProjet } from "../../models/projet.model.js";

/** Ce que le client envoie : types de projet et avancement, tous deux facultatifs. */
export interface ProjetDto {
  types?: string[] | undefined;
  avancement?: string | null | undefined;
}

const TYPES = new Set<string>(Object.values(TypeProjet));
const AVANCEMENTS = new Set<string>(Object.values(AvancementChantier));

/**
 * Projet à enregistrer : types valides sans doublon, avancement valide ou
 * null. Rien de renseigné → null (le client a passé la question).
 */
export const normaliserProjet = (raw: ProjetDto | null | undefined, now: Date): IProjet | null => {
  if (!raw) return null;
  const types = [...new Set((raw.types ?? []).filter((t) => TYPES.has(t)))] as TypeProjet[];
  const avancement = raw.avancement && AVANCEMENTS.has(raw.avancement) ? (raw.avancement as AvancementChantier) : null;
  if (types.length === 0 && avancement === null) return null;
  return { types, avancement, renseigneLe: now };
};
