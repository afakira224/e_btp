import { Schema } from "mongoose";

// ─────────────────────────────────────────────
//  Projet du client et étapes du chantier.
//
//  Le client décrit son projet à l'inscription (facultatif, modifiable dans
//  son profil) ; chaque catégorie du catalogue est rattachée à une étape.
//  Ces deux informations alimentent la personnalisation : « pour la suite
//  de votre chantier », sélection d'accueil d'un client qui n'a encore rien
//  consulté.
// ─────────────────────────────────────────────

/** Ce que le client construit ou rénove (plusieurs choix possibles). */
export enum TypeProjet {
  CONSTRUCTION = "construction",
  RENOVATION = "renovation",
  SALLE_DE_BAIN_CUISINE = "salle_de_bain_cuisine",
  ELECTRICITE_PLOMBERIE = "electricite_plomberie",
  PEINTURE_FINITIONS = "peinture_finitions",
  PROFESSIONNEL = "professionnel",
}

/** Étape d'une catégorie du catalogue. `transverse` : utile tout au long du chantier. */
export enum Etape {
  GROS_OEUVRE = "gros_oeuvre",
  RESEAUX = "reseaux",
  REVETEMENTS = "revetements",
  FINITIONS = "finitions",
  TRANSVERSE = "transverse",
}

/** Où en est le chantier du client, selon sa réponse. */
export enum AvancementChantier {
  PAS_COMMENCE = "pas_commence",
  GROS_OEUVRE = "gros_oeuvre",
  RESEAUX = "reseaux",
  REVETEMENTS = "revetements",
  FINITIONS = "finitions",
}

/** Ordre du chantier : chaque étape prépare la suivante. */
export const ETAPES_DU_CHANTIER = [Etape.GROS_OEUVRE, Etape.RESEAUX, Etape.REVETEMENTS, Etape.FINITIONS] as const;

export const ETAPE_LIBELLE: Record<Etape, string> = {
  [Etape.GROS_OEUVRE]: "Gros œuvre",
  [Etape.RESEAUX]: "Réseaux (plomberie, électricité)",
  [Etape.REVETEMENTS]: "Revêtements",
  [Etape.FINITIONS]: "Finitions",
  [Etape.TRANSVERSE]: "Tout au long du chantier",
};

export const TYPE_PROJET_LIBELLE: Record<TypeProjet, string> = {
  [TypeProjet.CONSTRUCTION]: "Construction",
  [TypeProjet.RENOVATION]: "Rénovation",
  [TypeProjet.SALLE_DE_BAIN_CUISINE]: "Salle de bain ou cuisine",
  [TypeProjet.ELECTRICITE_PLOMBERIE]: "Électricité ou plomberie",
  [TypeProjet.PEINTURE_FINITIONS]: "Peinture et finitions",
  [TypeProjet.PROFESSIONNEL]: "Professionnel",
};

/** Étapes concernées par chaque type de projet, de la première à la dernière. */
export const ETAPES_DU_PROJET: Record<TypeProjet, Etape[]> = {
  [TypeProjet.CONSTRUCTION]: [Etape.GROS_OEUVRE],
  [TypeProjet.RENOVATION]: [Etape.REVETEMENTS, Etape.FINITIONS],
  [TypeProjet.SALLE_DE_BAIN_CUISINE]: [Etape.RESEAUX, Etape.REVETEMENTS],
  [TypeProjet.ELECTRICITE_PLOMBERIE]: [Etape.RESEAUX],
  [TypeProjet.PEINTURE_FINITIONS]: [Etape.FINITIONS],
  [TypeProjet.PROFESSIONNEL]: [],
};

/** Étape suivante du chantier, ou null après les finitions (et pour « transverse »). */
export const etapeSuivante = (etape: Etape): Etape | null => {
  const index = (ETAPES_DU_CHANTIER as readonly Etape[]).indexOf(etape);
  return index >= 0 && index < ETAPES_DU_CHANTIER.length - 1 ? ETAPES_DU_CHANTIER[index + 1]! : null;
};

/** Rang d'une étape dans le chantier (−1 pour « transverse »). */
export const rangEtape = (etape: Etape): number => (ETAPES_DU_CHANTIER as readonly Etape[]).indexOf(etape);

// ─────────────────────────────────────────────
//  Sous-document « projet » de l'utilisateur.
// ─────────────────────────────────────────────
export interface IProjet {
  types: TypeProjet[];
  avancement: AvancementChantier | null;
  renseigneLe: Date;
}

export const projetSchema = new Schema<IProjet>(
  {
    types: { type: [String], enum: Object.values(TypeProjet), default: [] },
    avancement: { type: String, enum: [...Object.values(AvancementChantier), null], default: null },
    renseigneLe: { type: Date, required: true },
  },
  { _id: false }
);
