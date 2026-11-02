import { useState, type FormEvent } from "react";
import {
  PROPOSAL_KINDS,
  RESOLVE_OUTCOMES,
  type SupportAction,
  type SupportTicket,
} from "../../../../entities/support";
import { Alert, Button, Choices, TextArea } from "../../../../shared/ui";
import { performSupportAction, type TicketActionInput } from "../api/support.api";
import styles from "./TicketActions.module.css";

interface ActionSpec {
  label: string;
  /** Ce qu'on demande au moment de confirmer. */
  question: string;
  danger?: boolean;
  /** Champs du formulaire. */
  fields?: readonly ("kind" | "details" | "outcome" | "note" | "reason" | "rating" | "comment")[];
  required?: readonly ("details" | "outcome" | "note" | "reason" | "rating")[];
  done: string;
}

const SPECS: Record<SupportAction, ActionSpec> = {
  propose: {
    label: "Proposer une solution",
    question: "Que proposez-vous au client ?",
    fields: ["kind", "details"],
    required: ["details"],
    done: "Proposition envoyée : le client l'accepte ou demande l'arbitrage.",
  },
  accept: { label: "Accepter la solution", question: "Vous acceptez la solution proposée ? La demande sera résolue.", done: "Solution acceptée : la demande est résolue." },
  escalate: {
    label: "Demander l'arbitrage",
    question: "L'administration reprend la demande et tranche sous 72 heures. Pourquoi ?",
    fields: ["reason"],
    done: "Arbitrage demandé : l'équipe de la plateforme reprend la demande.",
  },
  resolve: {
    label: "Trancher",
    question: "Votre décision, motivée : les parties la liront.",
    fields: ["outcome", "note"],
    required: ["outcome", "note"],
    done: "Décision enregistrée : les parties sont prévenues.",
  },
  appeal: {
    label: "Former un recours",
    question: "Un autre membre de l'équipe réexaminera la demande. Que contestez-vous ?",
    fields: ["reason"],
    required: ["reason"],
    done: "Recours envoyé : la demande est réexaminée.",
  },
  close: {
    label: "Fermer la demande",
    question: "Fermer cette demande ? Elle pourra être rouverte pendant 14 jours.",
    danger: true,
    fields: ["note"],
    done: "Demande fermée.",
  },
  reopen: {
    label: "Rouvrir",
    question: "Qu'est-ce qui ne va toujours pas ?",
    fields: ["reason"],
    required: ["reason"],
    done: "Demande rouverte.",
  },
  assign: { label: "Prendre en charge", question: "Vous prenez cette demande en charge ?", done: "Demande prise en charge." },
  rate: {
    label: "Noter la réponse",
    question: "Comment s'est passé le traitement de votre demande ?",
    fields: ["rating", "comment"],
    required: ["rating"],
    done: "Merci pour votre note.",
  },
};

/** Ordre d'affichage : ce qui fait avancer d'abord, la fermeture en dernier. */
const ORDER: readonly SupportAction[] = ["accept", "propose", "resolve", "assign", "escalate", "appeal", "reopen", "rate", "close"];

interface FormProps {
  ticket: SupportTicket;
  action: SupportAction;
  onCancel: () => void;
  onDone: (ticket: SupportTicket, message: string) => void;
}

const ActionForm = ({ ticket, action, onCancel, onDone }: FormProps) => {
  const spec = SPECS[action];
  const has = (field: NonNullable<ActionSpec["fields"]>[number]) => spec.fields?.includes(field) ?? false;
  const [values, setValues] = useState<TicketActionInput>({
    kind: "explanation",
    outcome: ticket.type === "general_question" ? "answered" : undefined,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof TicketActionInput) => (value: string | number) => setValues((previous) => ({ ...previous, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    for (const field of spec.required ?? []) {
      const value = values[field];
      if (value === undefined || (typeof value === "string" && !value.trim())) {
        return setError(field === "outcome" ? "Choisissez une décision." : field === "rating" ? "Choisissez une note." : "Ce champ est requis.");
      }
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await performSupportAction(ticket.id, action, {
        kind: has("kind") ? values.kind : undefined,
        details: values.details?.trim() || undefined,
        outcome: has("outcome") ? values.outcome : undefined,
        note: values.note?.trim() || undefined,
        reason: values.reason?.trim() || undefined,
        rating: has("rating") ? values.rating : undefined,
        comment: values.comment?.trim() || undefined,
      });
      onDone(updated, spec.done);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <p className={styles.question}>{spec.question}</p>
      {has("kind") ? (
        <Choices
          legend="Type de solution"
          inline
          options={Object.entries(PROPOSAL_KINDS).map(([value, label]) => ({ value, label }))}
          value={values.kind ?? ""}
          onChange={set("kind")}
          disabled={busy}
        />
      ) : null}
      {has("details") ? (
        <TextArea label="La solution, en clair" maxLength={1000} rows={3} value={values.details ?? ""} onChange={(event) => set("details")(event.target.value)} disabled={busy} hint="Par exemple : « Nouvelle livraison jeudi entre 9 h et 12 h »." />
      ) : null}
      {has("outcome") ? (
        <Choices
          legend="Décision"
          options={Object.entries(RESOLVE_OUTCOMES).map(([value, outcome]) => ({ value, label: outcome.label, hint: outcome.hint }))}
          value={values.outcome ?? ""}
          onChange={set("outcome")}
          disabled={busy}
        />
      ) : null}
      {has("rating") ? (
        <Choices
          legend="Votre note"
          inline
          options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} / 5` }))}
          value={values.rating ? String(values.rating) : ""}
          onChange={(value) => set("rating")(Number(value))}
          disabled={busy}
        />
      ) : null}
      {has("note") ? (
        <TextArea
          label={action === "resolve" ? "Motif de la décision" : "Précision"}
          optional={!spec.required?.includes("note")}
          maxLength={1000}
          rows={3}
          value={values.note ?? ""}
          onChange={(event) => set("note")(event.target.value)}
          disabled={busy}
        />
      ) : null}
      {has("reason") ? (
        <TextArea
          label={action === "escalate" ? "Pourquoi l'arbitrage" : "Explication"}
          optional={!spec.required?.includes("reason")}
          maxLength={1000}
          rows={3}
          value={values.reason ?? ""}
          onChange={(event) => set("reason")(event.target.value)}
          disabled={busy}
        />
      ) : null}
      {has("comment") ? (
        <TextArea label="Un commentaire" optional maxLength={500} rows={2} value={values.comment ?? ""} onChange={(event) => set("comment")(event.target.value)} disabled={busy} />
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className={styles.buttons}>
        <Button type="submit" isLoading={busy} className={spec.danger ? styles.dangerButton : undefined}>
          {spec.label}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Retour
        </Button>
      </div>
    </form>
  );
};

interface TicketActionsProps {
  ticket: SupportTicket;
  onUpdated: (ticket: SupportTicket, message: string) => void;
}

/** Les boutons que le serveur autorise à ce lecteur, chacun avec son formulaire sur place. */
export const TicketActions = ({ ticket, onUpdated }: TicketActionsProps) => {
  const [open, setOpen] = useState<SupportAction | null>(null);
  const actions = ORDER.filter((action) => ticket.availableActions.includes(action));
  if (actions.length === 0) return null;

  if (open) {
    return (
      <ActionForm
        key={open}
        ticket={ticket}
        action={open}
        onCancel={() => setOpen(null)}
        onDone={(updated, message) => {
          setOpen(null);
          onUpdated(updated, message);
        }}
      />
    );
  }

  return (
    <div className={styles.actions}>
      {actions.map((action, index) => (
        <Button
          key={action}
          variant={SPECS[action].danger ? "ghost" : index === 0 ? "primary" : "secondary"}
          className={SPECS[action].danger ? styles.danger : undefined}
          onClick={() => setOpen(action)}
        >
          {SPECS[action].label}
        </Button>
      ))}
    </div>
  );
};
