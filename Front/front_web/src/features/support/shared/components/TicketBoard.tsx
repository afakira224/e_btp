import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PRIORITY_LABELS, SUPPORT_TABS, type SupportScope, type SupportTicket } from "../../../../entities/support";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useResource } from "../../../catalog";
import { useNow } from "../../../orders";
import { fetchSupportTickets, type TicketPage } from "../api/support.api";
import { formatDue, formatMoment, timeLeft } from "../utils/format";
import { SupportStatusBadge } from "./SupportStatusBadge";
import styles from "./TicketBoard.module.css";

const PAGE_SIZE = 20;
const URGENT_MS = 12 * 3600 * 1000;

interface TicketBoardProps {
  scope: SupportScope;
  boutiqueId?: string | undefined;
  defaultTab: string;
  detailPath: (ticket: SupportTicket) => string;
  empty: Record<string, string>;
}

// ─────────────────────────────────────────────
//  File des demandes : un onglet par situation, avec son compte, et la
//  prochaine échéance de chaque demande. Onglet, recherche et page vivent
//  dans l'URL. Le client, la boutique et l'administration ont chacun leurs
//  onglets (SUPPORT_TABS), ceux que le serveur compte.
// ─────────────────────────────────────────────
export const TicketBoard = ({ scope, boutiqueId, defaultTab, detailPath, empty }: TicketBoardProps) => {
  const tabs = SUPPORT_TABS[scope];
  const [params, setParams] = useSearchParams();
  const raw = params.get("onglet");
  const tab = raw && raw in tabs ? raw : defaultTab;
  const search = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const [draft, setDraft] = useState(search);
  const now = useNow();

  const load = useCallback(
    (signal: AbortSignal) => fetchSupportTickets({ scope, boutiqueId, tab, search, page, limit: PAGE_SIZE }, signal),
    [scope, boutiqueId, tab, search, page]
  );
  const list = useResource<TicketPage | null>(load, null, `${scope}:${boutiqueId ?? ""}:${tab}:${search}:${page}`);
  const data = list.data;

  const hrefFor = (next: { onglet?: string; page?: number }) => {
    const query = new URLSearchParams();
    query.set("onglet", next.onglet ?? tab);
    if (search) query.set("q", search);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    return `?${query.toString()}`;
  };

  return (
    <div className={styles.board}>
      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label="Situations des demandes">
          {Object.entries(tabs).map(([key, label]) => {
            const active = key === tab;
            const count = data?.counts[key];
            const waiting = (key === "todo" || key === "urgent") && count !== undefined && count > 0;
            return (
              <Link
                key={key}
                to={hrefFor({ onglet: key })}
                className={[styles.tab, active ? styles.tabActive : "", waiting && !active ? styles.tabWaiting : ""].filter(Boolean).join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {label}
                {count !== undefined ? <span className={styles.count}>{count}</span> : null}
              </Link>
            );
          })}
        </nav>
        <form
          className={styles.search}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const query = new URLSearchParams({ onglet: tab });
            if (draft.trim()) query.set("q", draft.trim());
            setParams(query);
          }}
        >
          <Input
            label="Rechercher une demande"
            type="search"
            placeholder="Numéro, objet, commande…"
            maxLength={60}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            Rechercher
          </Button>
        </form>
      </div>

      {list.error ? (
        <Alert tone="danger">{list.error}</Alert>
      ) : list.isLoading && !data ? (
        <div className={styles.list} aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{search ? `Aucune demande « ${search} » dans cet onglet` : tabs[tab]}</p>
          <p className={styles.emptyText}>{search ? "Essayez un autre onglet." : (empty[tab] ?? "Rien ici pour l'instant.")}</p>
        </div>
      ) : (
        <>
          <ul className={[styles.list, list.isLoading ? styles.stale : ""].filter(Boolean).join(" ")}>
            {data.items.map((ticket) => {
              const urgent = ticket.deadlineAt !== null && ticket.waitingOn === ticket.viewer && new Date(ticket.deadlineAt).getTime() - now < URGENT_MS;
              return (
                <li key={ticket.id}>
                  <Link className={styles.card} to={detailPath(ticket)}>
                    <span className={styles.cardHead}>
                      <span className={styles.number}>
                        {ticket.number} · {ticket.typeLabel}
                      </span>
                      <span className={styles.badges}>
                        {ticket.priority === "urgent" ? <span className={styles.priority}>{PRIORITY_LABELS.urgent}</span> : null}
                        <SupportStatusBadge ticket={ticket} />
                      </span>
                    </span>
                    <span className={styles.subject}>{ticket.subject}</span>
                    <span className={styles.meta}>
                      {ticket.reasonLabel}
                      {ticket.viewer !== "requester" ? ` · ${ticket.requester.name}` : ""}
                    </span>
                    <span className={styles.foot}>
                      <span className={styles.date}>Mise à jour {formatMoment(ticket.updatedAt)}</span>
                      {ticket.deadlineAt && ticket.waitingOn ? (
                        <span className={[styles.deadline, urgent ? styles.urgent : ""].filter(Boolean).join(" ")}>
                          Échéance {formatDue(ticket.deadlineAt)} · {timeLeft(ticket.deadlineAt, now)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {data.totalPages > 1 ? (
            <nav className={styles.pager} aria-label="Pages">
              {page > 1 ? <Link className={styles.pageLink} to={hrefFor({ page: page - 1 })}>← Précédentes</Link> : <span />}
              <span className={styles.pageInfo}>
                Page {data.page} sur {data.totalPages}
              </span>
              {page < data.totalPages ? <Link className={styles.pageLink} to={hrefFor({ page: page + 1 })}>Suivantes →</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
};
