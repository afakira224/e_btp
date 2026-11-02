import type { SupportMessage } from "../../../../entities/support";
import { formatMoment, PARTY_LABELS } from "../utils/format";
import styles from "./TicketThread.module.css";

const isImage = (mimetype: string) => mimetype.startsWith("image/");

// ─────────────────────────────────────────────
//  Le fil d'une demande, du premier message au dernier. Un événement
//  (escalade, fermeture) se lit comme une ligne de journal ; une note
//  interne, réservée à l'administration, se distingue nettement.
// ─────────────────────────────────────────────
export const TicketThread = ({ messages }: { messages: SupportMessage[] }) => (
  <ol className={styles.thread}>
    {messages.map((message) =>
      message.kind === "event" ? (
        <li key={message.id} className={styles.event}>
          <span className={styles.eventBody}>{message.body}</span>
          <time className={styles.when} dateTime={message.createdAt}>
            {formatMoment(message.createdAt)}
          </time>
        </li>
      ) : (
        <li
          key={message.id}
          className={[
            styles.message,
            styles[message.author.party],
            message.visibility === "internal" ? styles.internal : "",
            message.kind === "decision" ? styles.decision : "",
            message.kind === "proposal" ? styles.proposal : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <header className={styles.head}>
            <span className={styles.author}>{message.author.name}</span>
            <span className={styles.party}>
              {message.visibility === "internal"
                ? "Note interne"
                : message.kind === "decision"
                  ? "Décision"
                  : message.kind === "proposal"
                    ? "Proposition"
                    : PARTY_LABELS[message.author.party]}
            </span>
            <time className={styles.when} dateTime={message.createdAt}>
              {formatMoment(message.createdAt)}
            </time>
          </header>
          <p className={styles.body}>{message.body}</p>
          {message.attachments.length > 0 ? (
            <ul className={styles.files}>
              {message.attachments.map((file) => (
                <li key={file.url}>
                  <a href={file.url} target="_blank" rel="noreferrer" className={styles.file}>
                    {isImage(file.mimetype) ? <img src={file.url} alt={file.name} /> : <span className={styles.pdf}>PDF</span>}
                    <span className={styles.fileName}>{file.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {message.containsContact && message.visibility === "public" ? (
            <p className={styles.flag}>Ce message contient des coordonnées : ne payez jamais en dehors de la plateforme.</p>
          ) : null}
        </li>
      )
    )}
  </ol>
);
