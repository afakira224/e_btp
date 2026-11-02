import { Link, useLocation, useParams } from "react-router-dom";
import type { SupportTicket } from "../../../../entities/support";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { TicketView, useTicket } from "../../../support";
import { sellerPaths, useSellerShop } from "../../shared";
import styles from "./ShopSupportTicketPage.module.css";

/** Où ouvrir la cible depuis l'espace boutique. */
const targetHref = (ticket: SupportTicket, shopId: string): string | null => {
  switch (ticket.target?.kind) {
    case "shop_order":
      return sellerPaths.order(shopId, ticket.target.id);
    case "offer":
      return sellerPaths.editProduct(shopId, ticket.target.id);
    case "shop":
      return sellerPaths.storefront(ticket.target.id);
    default:
      return null;
  }
};

// ─────────────────────────────────────────────
//  Une demande — /ma-boutique/:boutiqueId/support/:ticketId
//  Lien des emails « Nouvelle réclamation » : on propose une solution
//  (nouvelle livraison, remboursement, échange, explication), on répond,
//  ou on laisse l'administration trancher.
// ─────────────────────────────────────────────
export const ShopSupportTicketPage = () => {
  const { shop, refreshSupportCounts, refreshOrderCounts } = useSellerShop();
  const { ticketId = "" } = useParams<{ ticketId: string }>();
  const arrival = (useLocation().state as { feedback?: string } | null)?.feedback ?? null;
  const { ticket, isLoading, error, replace, reload } = useTicket(ticketId);

  useDocumentTitle(ticket ? `Demande ${ticket.number}` : "Demande");

  const back = (
    <Link className={styles.back} to={sellerPaths.support(shop.id)}>
      ← Toutes les demandes
    </Link>
  );

  if (error || (!isLoading && !ticket)) {
    return (
      <div className={styles.page}>
        {back}
        <Alert tone="danger">{error ?? "Demande introuvable."}</Alert>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className={styles.page}>
        {back}
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  if (ticket.boutiqueId !== shop.id && ticket.requesterShopId !== shop.id) {
    return (
      <div className={styles.page}>
        {back}
        <Alert tone="danger">Cette demande ne concerne pas {shop.nom}.</Alert>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {back}
      {arrival ? <Alert tone="success">{arrival}</Alert> : null}
      <TicketView
        ticket={ticket}
        onChange={(next) => {
          replace(next);
          refreshSupportCounts();
        }}
        reload={() => {
          reload();
          refreshOrderCounts();
          refreshSupportCounts();
        }}
        targetHref={targetHref(ticket, shop.id)}
      />
    </div>
  );
};
