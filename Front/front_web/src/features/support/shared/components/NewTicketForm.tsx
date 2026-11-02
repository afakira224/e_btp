import { useId, useState, type FormEvent } from "react";
import {
  SUPPORT_REASONS,
  SUPPORT_TYPE_INTROS,
  SUPPORT_TYPE_LABELS,
  type SupportTicket,
  type SupportTicketType,
} from "../../../../entities/support";
import { Alert, Button, Choices, Input, TextArea } from "../../../../shared/ui";
import { createSupportTicket } from "../api/support.api";
import styles from "./NewTicketForm.module.css";

const MAX_FILES = 5;

interface NewTicketFormProps {
  type: SupportTicketType;
  targetId?: string | undefined;
  /** Ce qui est visé, en clair (« Commande CMD-…-1 »), quand on le connaît. */
  targetLabel?: string | undefined;
  /** Une boutique écrit en son nom. */
  shopId?: string | undefined;
  onCreated: (ticket: SupportTicket) => void;
}

// ─────────────────────────────────────────────
//  Ouvrir une demande. Le type et la cible viennent de l'endroit où l'on a
//  cliqué (« Signaler un problème » sur une commande, « Signaler » sur une
//  annonce) : on ne choisit plus que le motif et on décrit.
// ─────────────────────────────────────────────
export const NewTicketForm = ({ type, targetId, targetLabel, shopId, onCreated }: NewTicketFormProps) => {
  const reasons = Object.entries(SUPPORT_REASONS[type]);
  const [reason, setReason] = useState(reasons.length === 1 ? (reasons[0]?.[0] ?? "") : "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason) return setError("Choisissez un motif.");
    if (description.trim().length < 10) return setError("Décrivez la situation en quelques mots (10 caractères au moins).");
    if (reason === "other" && description.trim().length < 20) return setError("Pour « Autre », décrivez le problème en quelques phrases (20 caractères au moins).");
    setBusy(true);
    setError(null);
    try {
      const ticket = await createSupportTicket({
        type,
        reason,
        description: description.trim(),
        subject: subject.trim() || undefined,
        targetId,
        shopId,
        attachments: files,
      });
      onCreated(ticket);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <div className={styles.intro}>
        <p className={styles.type}>{SUPPORT_TYPE_LABELS[type]}</p>
        {targetLabel ? <p className={styles.target}>{targetLabel}</p> : null}
        <p className={styles.text}>{SUPPORT_TYPE_INTROS[type]}</p>
      </div>

      {reasons.length > 1 ? (
        <Choices legend="Motif" options={reasons.map(([value, label]) => ({ value, label }))} value={reason} onChange={setReason} disabled={busy} />
      ) : null}

      <Input label="Objet" optional maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} disabled={busy} hint="Sinon, le motif et ce que vous signalez." />

      <TextArea
        label="Que se passe-t-il ?"
        maxLength={2000}
        rows={5}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        disabled={busy}
        hint="Les faits, les dates, ce que vous attendez. Ne donnez pas votre numéro : tout se règle ici."
      />

      <div className={styles.files}>
        <label className={styles.fileLabel} htmlFor={fileId}>
          Photos ou PDF — facultatif
        </label>
        <input
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          disabled={busy}
          onChange={(event) => setFiles([...(event.target.files ?? [])].slice(0, MAX_FILES))}
        />
        <span className={styles.fileHint}>
          {files.length > 0 ? `${files.length} fichier${files.length > 1 ? "s" : ""} joint${files.length > 1 ? "s" : ""}` : `${MAX_FILES} au plus, 5 Mo chacun.`}
        </span>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div>
        <Button type="submit" isLoading={busy}>
          Envoyer la demande
        </Button>
      </div>
    </form>
  );
};
