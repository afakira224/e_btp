import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PRIORITY_LABELS, type SupportTicket } from "../../../../entities/support";
import { Alert } from "../../../../shared/ui";
import { useNow } from "../../../orders";
import { formatMoment, nextStepFor } from "../utils/format";
import { LinkedOrder } from "./LinkedOrder";
import { MessageComposer } from "./MessageComposer";
import { SupportStatusBadge } from "./SupportStatusBadge";
import { TicketActions } from "./TicketActions";
import { TicketThread } from "./TicketThread";
import styles from "./TicketView.module.css";

interface TicketViewProps {
  ticket: SupportTicket;
  onChange: (ticket: SupportTicket) => void;
  /** Relire la demande (après une action sur la commande liée). */
  reload: () => void;
  /** Lien de la cible dans l'espace de ce lecteur (commande, annonce, boutique). */
  targetHref?: string | null | undefined;
  /** Bloc ajouté en colonne (dossier et sanctions pour l'administration). */
  aside?: ReactNode;
}

// ─────────────────────────────────────────────
//  Une demande : qui doit agir et avant quand, la cible, la proposition ou
//  la décision, les actions, le fil et la réponse. La même pour le client,
//  la boutique et l'administration ; le serveur a retiré ce que ce lecteur
//  ne doit pas voir (notes internes, auteur d'un signalement).
// ─────────────────────────────────────────────
export const TicketView = ({ ticket, onChange, reload, targetHref, aside }: TicketViewProps) => {
  const [feedback, setFeedback] = useState<string | null>(null);
  const now = useNow();
  const next = nextStepFor(ticket, now);
  const linkedPart = ticket.target?.kind === "shop_order" && (ticket.type === "return" || ticket.type === "order_problem") ? ticket.target.id : null;

  return (
    <div className={styles.view}>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.panel}>
            <header className={styles.head}>
              <div className={styles.titles}>
                <span className={styles.number}>
                  {ticket.number} · {ticket.typeLabel}
                </span>
                <h2 className={styles.subject}>{ticket.subject}</h2>
              </div>
              <div className={styles.badges}>
                {ticket.priority === "urgent" ? <span className={styles.urgent}>{PRIORITY_LABELS.urgent}</span> : null}
                <SupportStatusBadge ticket={ticket} />
              </div>
            </header>

            {next ? <p className={styles.next}>{next}</p> : null}

            <dl className={styles.facts}>
              <div>
                <dt>Motif</dt>
                <dd>{ticket.reasonLabel}</dd>
              </div>
              {ticket.target ? (
                <div>
                  <dt>Objet</dt>
                  <dd>{targetHref ? <Link to={targetHref}>{ticket.target.label}</Link> : ticket.target.label}</dd>
                </div>
              ) : null}
              <div>
                <dt>Ouverte</dt>
                <dd>
                  {formatMoment(ticket.createdAt)}
                  {ticket.viewer !== "requester" ? ` par ${ticket.requester.name}` : ""}
                </dd>
              </div>
            </dl>

            {ticket.proposal ? (
              <div className={[styles.box, ticket.proposal.status === "pending" ? styles.pending : ""].join(" ")}>
                <p className={styles.boxTitle}>
                  Proposition de la boutique — {ticket.proposal.kindLabel}
                  {ticket.proposal.status === "accepted" ? " (acceptée)" : ticket.proposal.status === "declined" ? " (refusée)" : ""}
                </p>
                <p className={styles.boxBody}>{ticket.proposal.details}</p>
              </div>
            ) : null}

            {ticket.resolution ? (
              <div className={[styles.box, styles.resolution].join(" ")}>
                <p className={styles.boxTitle}>{ticket.resolution.outcomeLabel}</p>
                {ticket.resolution.note ? <p className={styles.boxBody}>{ticket.resolution.note}</p> : null}
              </div>
            ) : null}

            {ticket.appeal ? (
              <div className={styles.box}>
                <p className={styles.boxTitle}>Recours formé le {formatMoment(ticket.appeal.at)}</p>
                <p className={styles.boxBody}>{ticket.appeal.reason}</p>
              </div>
            ) : null}

            <TicketActions
              ticket={ticket}
              onUpdated={(updated, message) => {
                setFeedback(message);
                onChange(updated);
              }}
            />
          </section>

          {linkedPart ? <LinkedOrder partId={linkedPart} href={targetHref ?? null} onUpdated={reload} /> : null}

          <section className={styles.panel} aria-label="Échanges">
            <h3 className={styles.sectionTitle}>Échanges</h3>
            <TicketThread messages={ticket.messages ?? []} />
            <MessageComposer
              ticket={ticket}
              onPosted={(updated) => {
                setFeedback(null);
                onChange(updated);
              }}
            />
          </section>
        </div>
        {aside ? <div className={styles.side}>{aside}</div> : null}
      </div>
    </div>
  );
};
