import { useLocation, useParams } from "react-router-dom";
import type { SupportTicket } from "../../../../entities/support";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { TicketView, useTicket } from "../../../support";
import { AccountHeader, AccountPage } from "../../shared";
import styles from "./SupportTicketPage.module.css";

const SUPPORT_CRUMB = { label: "Support", to: "/compte/support" };

/** Où ouvrir la cible depuis le compte client. */
const targetHref = (ticket: SupportTicket): string | null => {
  switch (ticket.target?.kind) {
    case "shop_order":
      return ticket.orderId ? `/compte/commandes/${encodeURIComponent(ticket.orderId)}` : null;
    case "offer":
      return `/produits/${encodeURIComponent(ticket.target.id)}`;
    case "shop":
      return `/boutiques/${encodeURIComponent(ticket.target.id)}`;
    default:
      return null;
  }
};

// ─────────────────────────────────────────────
//  Une demande — /compte/support/:ticketId
// ─────────────────────────────────────────────
export const SupportTicketPage = () => {
  const { ticketId = "" } = useParams<{ ticketId: string }>();
  const arrival = (useLocation().state as { feedback?: string } | null)?.feedback ?? null;
  const { ticket, isLoading, error, replace, reload } = useTicket(ticketId);

  useDocumentTitle(ticket ? `Demande ${ticket.number}` : "Demande");

  if (error || (!isLoading && !ticket)) {
    return (
      <AccountPage>
        <AccountHeader title="Demande introuvable" trail={[SUPPORT_CRUMB, { label: "Introuvable" }]} />
        <Alert tone="danger">{error ?? "Demande introuvable."}</Alert>
      </AccountPage>
    );
  }

  if (!ticket) {
    return (
      <AccountPage>
        <AccountHeader title="Demande…" trail={[SUPPORT_CRUMB, { label: "…" }]} />
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  return (
    <AccountPage>
      <AccountHeader title={`Demande ${ticket.number}`} lede={ticket.typeLabel} trail={[SUPPORT_CRUMB, { label: ticket.number }]} />
      {arrival ? (
        <div className={styles.alert}>
          <Alert tone="success">{arrival}</Alert>
        </div>
      ) : null}
      <TicketView ticket={ticket} onChange={replace} reload={reload} targetHref={targetHref(ticket)} />
    </AccountPage>
  );
};
