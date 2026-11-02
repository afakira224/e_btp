import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Shop } from "../../../../entities/shop";
import { ENTITY_TYPE_LABELS, type EntityType } from "../../../../entities/user";
import { SUPPORT_TYPE_LABELS, type Sanction, type SupportTicket, type SupportTicketStatus } from "../../../../entities/support";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPage } from "../../../account";
import { useResource } from "../../../catalog";
import { fetchShop } from "../../../shops";
import { formatMoment, SanctionForm, SanctionList, TicketView, useTicket, type SanctionTarget } from "../../../support";
import { AdminHeader, adminPaths } from "../../shared";
import styles from "./AdminSupportTicketPage.module.css";

const SUPPORT_CRUMB = { label: "Support", to: adminPaths.support };

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  awaiting_shop: "Chez la boutique",
  awaiting_requester: "Chez le demandeur",
  awaiting_admin: "À traiter",
  resolved: "Résolue",
  closed: "Fermée",
};

/** Où ouvrir la cible depuis l'administration. */
const targetHref = (ticket: SupportTicket): string | null => {
  switch (ticket.target?.kind) {
    case "shop_order":
      return adminPaths.order(ticket.target.id);
    case "offer":
      return `/produits/${encodeURIComponent(ticket.target.id)}`;
    case "shop":
      return `/boutiques/${encodeURIComponent(ticket.target.id)}`;
    default:
      return null;
  }
};

/** Ce que la demande permet de sanctionner : sa cible, et la boutique en cause. */
const sanctionTargets = (ticket: SupportTicket, shop: Shop | null): SanctionTarget[] => {
  const targets: SanctionTarget[] = [];
  const kind = ticket.target?.kind;
  if (ticket.target && (kind === "offer" || kind === "review" || kind === "user")) {
    targets.push({ kind, id: ticket.target.id, label: ticket.target.label });
  }
  if (ticket.boutiqueId && ticket.type !== "general_question" && ticket.type !== "sanction_appeal") {
    targets.push({ kind: "shop", id: ticket.boutiqueId, label: shop?.nom ?? (kind === "shop" ? (ticket.target?.label ?? "Boutique") : "Boutique") });
  }
  return targets;
};

// ─────────────────────────────────────────────
//  Une demande — /admin/support/:ticketId
//  La demande, son fil (notes internes comprises) et, en colonne, le dossier :
//  demandes liées à la même cible ou boutique, mesures déjà prises, et le
//  barème qui suggère la suivante.
// ─────────────────────────────────────────────
export const AdminSupportTicketPage = () => {
  const { ticketId = "" } = useParams<{ ticketId: string }>();
  const { ticket, isLoading, error, replace, reload } = useTicket(ticketId);
  const [feedback, setFeedback] = useState<string | null>(null);

  const boutiqueId = ticket?.boutiqueId ?? "";
  const loadShop = useCallback(
    (signal: AbortSignal) => (boutiqueId ? fetchShop(boutiqueId, signal) : Promise.resolve(null)),
    [boutiqueId]
  );
  const shop = useResource<Shop | null>(loadShop, null, boutiqueId);

  useDocumentTitle(ticket ? `Demande ${ticket.number}` : "Demande");

  if (error || (!isLoading && !ticket)) {
    return (
      <AccountPage>
        <AdminHeader title="Demande introuvable" trail={[SUPPORT_CRUMB, { label: "Introuvable" }]} />
        <Alert tone="danger">{error ?? "Demande introuvable."}</Alert>
      </AccountPage>
    );
  }

  if (!ticket) {
    return (
      <AccountPage>
        <AdminHeader title="Demande…" trail={[SUPPORT_CRUMB, { label: "…" }]} />
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  const dossier = ticket.dossier;
  const targets = sanctionTargets(ticket, shop.data);
  const suggestion = targets[0]?.kind === "user" ? dossier?.suggestion.user : targets[0]?.kind === "shop" ? dossier?.suggestion.shop : undefined;
  const applied = (sanction: Sanction) => {
    setFeedback(`${sanction.target.label} : mesure appliquée. La personne visée est prévenue par email.`);
    reload();
  };

  const aside = (
    <>
      <section className={styles.box}>
        <h2 className={styles.boxTitle}>Demandeur</h2>
        <p className={styles.line}>
          <strong>{ticket.requester.name}</strong>
          <span className={styles.muted}>
            {ticket.requester.accountType === "guest"
              ? "Visiteur sans compte (réponse par email)"
              : (ENTITY_TYPE_LABELS[ticket.requester.accountType as EntityType] ?? ticket.requester.accountType)}
          </span>
        </p>
        {shop.data ? (
          <p className={styles.line}>
            <span className={styles.muted}>Boutique en cause</span>
            <Link to={`/boutiques/${encodeURIComponent(shop.data.id)}`}>{shop.data.nom} →</Link>
            {shop.data.suspendedUntil ? <span className={styles.danger}>Suspendue jusqu'au {formatMoment(shop.data.suspendedUntil)}</span> : null}
          </p>
        ) : null}
      </section>

      {dossier ? (
        <section className={styles.box}>
          <h2 className={styles.boxTitle}>Dossier</h2>
          {dossier.tickets.length === 0 ? (
            <p className={styles.muted}>Aucune autre demande sur cette cible ou cette boutique.</p>
          ) : (
            <ul className={styles.related}>
              {dossier.tickets.map((other) => (
                <li key={other.id}>
                  <Link to={adminPaths.supportTicket(other.id)}>
                    {other.number} · {SUPPORT_TYPE_LABELS[other.type]}
                  </Link>
                  <span className={styles.muted}>
                    {formatMoment(other.createdAt)} · {STATUS_LABELS[other.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {dossier.sanctions.length > 0 ? (
            <>
              <h3 className={styles.subTitle}>Mesures</h3>
              <SanctionList sanctions={dossier.sanctions} viewer="admin" onChanged={() => reload()} />
            </>
          ) : null}
        </section>
      ) : null}

      {targets.length > 0 ? (
        <section className={styles.box}>
          <h2 className={styles.boxTitle}>Appliquer une mesure</h2>
          <SanctionForm key={ticket.id} targets={targets} ticketId={ticket.id} suggestion={suggestion} onApplied={applied} />
        </section>
      ) : null}
    </>
  );

  return (
    <AccountPage>
      <AdminHeader title={`Demande ${ticket.number}`} lede={ticket.typeLabel} trail={[SUPPORT_CRUMB, { label: ticket.number }]} />
      {feedback ? (
        <div className={styles.alert}>
          <Alert tone="success">{feedback}</Alert>
        </div>
      ) : null}
      <TicketView ticket={ticket} onChange={replace} reload={reload} targetHref={targetHref(ticket)} aside={aside} />
    </AccountPage>
  );
};
