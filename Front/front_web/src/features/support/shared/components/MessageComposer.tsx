import { useId, useState, type FormEvent } from "react";
import { shopIsParty, type SupportParty, type SupportTicket } from "../../../../entities/support";
import { Alert, Button, TextArea } from "../../../../shared/ui";
import { postSupportMessage } from "../api/support.api";
import styles from "./MessageComposer.module.css";

const MAX_FILES = 5;

interface MessageComposerProps {
  ticket: SupportTicket;
  onPosted: (ticket: SupportTicket) => void;
}

// ─────────────────────────────────────────────
//  Écrire dans une demande. L'administration peut écrire une note interne
//  (invisible des parties) ou attendre la réponse d'une partie précise : la
//  demande passe alors chez elle, avec son délai.
// ─────────────────────────────────────────────
export const MessageComposer = ({ ticket, onPosted }: MessageComposerProps) => {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [internal, setInternal] = useState(false);
  const [waitFor, setWaitFor] = useState<SupportParty | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const fileId = useId();
  const admin = ticket.viewer === "admin";

  if (ticket.status === "closed") {
    return <p className={styles.closed}>Cette demande est fermée{ticket.availableActions.includes("reopen") ? " : rouvrez-la pour écrire." : "."}</p>;
  }

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return setError("Écrivez votre message.");
    if (files.length > MAX_FILES) return setError(`${MAX_FILES} pièces jointes au plus.`);
    setBusy(true);
    setError(null);
    try {
      const updated = await postSupportMessage(ticket.id, {
        body: body.trim(),
        internal: admin && internal,
        waitFor: admin && !internal && waitFor ? waitFor : undefined,
        attachments: files,
      });
      setBody("");
      setFiles([]);
      setInternal(false);
      setWaitFor("");
      setInputKey((key) => key + 1);
      setWarning(updated.warning ?? null);
      onPosted(updated);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.composer} onSubmit={(event) => void send(event)} noValidate>
      <TextArea
        label={admin && internal ? "Note interne" : "Votre message"}
        maxLength={2000}
        rows={4}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={busy}
        hint={admin && internal ? "Lue par l'équipe seulement." : "Lu par toutes les parties à la demande."}
      />

      <div className={styles.row}>
        <label className={styles.fileLabel} htmlFor={fileId}>
          Joindre des photos ou un PDF
        </label>
        <input
          key={inputKey}
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          disabled={busy}
          onChange={(event) => setFiles([...(event.target.files ?? [])].slice(0, MAX_FILES))}
        />
        <span className={styles.fileHint}>
          {files.length > 0 ? `${files.length} fichier${files.length > 1 ? "s" : ""}` : `${MAX_FILES} au plus, 5 Mo chacun.`}
        </span>
      </div>

      {admin ? (
        <div className={styles.adminOptions}>
          <label className={styles.check}>
            <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} disabled={busy} />
            Note interne
          </label>
          {!internal ? (
            <label className={styles.select}>
              Réponse attendue de
              <select value={waitFor} onChange={(event) => setWaitFor(event.target.value as SupportParty | "")} disabled={busy}>
                <option value="">Personne en particulier</option>
                <option value="requester">Le demandeur</option>
                {shopIsParty(ticket.type) ? <option value="shop">La boutique</option> : null}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {warning ? <Alert tone="warning">{warning}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div>
        <Button type="submit" isLoading={busy}>
          {admin && internal ? "Ajouter la note" : "Envoyer"}
        </Button>
      </div>
    </form>
  );
};
