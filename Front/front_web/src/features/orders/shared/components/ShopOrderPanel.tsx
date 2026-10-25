import type { ReactNode } from "react";
import {
  deliveryMethodLabel,
  isPickupDelivery,
  PAYMENT_METHOD_LABELS,
  RESOLUTION_LABELS,
  SHOP_ORDER_PAYMENT_LABELS,
  ShopOrderStatus,
  type ShopOrder,
  type ShopOrderViewer,
} from "../../../../entities/order";
import { formatFee } from "../../../../entities/delivery";
import { formatPrice } from "../../../../entities/product";
import { guidanceFor, refundNoteFor } from "../utils/guidance";
import { formatStep } from "../utils/format";
import { ShopOrderActions } from "./ShopOrderActions";
import { ShopOrderHistory } from "./ShopOrderHistory";
import { ShopOrderItems } from "./ShopOrderItems";
import { ShopOrderStatusBadge } from "./ShopOrderStatusBadge";
import styles from "./ShopOrderPanel.module.css";

/** Le code ne sert qu'à la remise : on ne le montre qu'une fois le colis parti ou prêt. */
const CODE_VISIBLE: readonly ShopOrderStatus[] = [
  ShopOrderStatus.SHIPPED,
  ShopOrderStatus.READY_FOR_PICKUP,
  ShopOrderStatus.DELIVERY_FAILED,
];

const groupCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

interface ShopOrderPanelProps {
  part: ShopOrder;
  viewer: ShopOrderViewer;
  /** Titre du bloc : la boutique côté client, la référence côté boutique. */
  title: ReactNode;
  onUpdated: (part: ShopOrder, message: string) => void;
  /** Historique ouvert d'emblée (page de détail) ou replié (liste). */
  historyOpen?: boolean;
}

// ─────────────────────────────────────────────
//  Une sous-commande : son statut, ce qui se passe ensuite, ses articles,
//  ses montants, ses actions et son historique. La même pour le client, la
//  boutique et l'administration ; le serveur a déjà retiré ce que ce
//  lecteur ne doit pas voir (code de remise, coordonnées du client).
// ─────────────────────────────────────────────
export const ShopOrderPanel = ({ part, viewer, title, onUpdated, historyOpen = false }: ShopOrderPanelProps) => {
  const guidance = guidanceFor(part, viewer);
  const refund = refundNoteFor(part, viewer);
  const pickup = isPickupDelivery(part.delivery);
  const showCode = viewer === "client" && part.pickupCode && CODE_VISIBLE.includes(part.status);

  return (
    <section className={styles.panel} aria-label={`Commande ${part.reference}`}>
      <header className={styles.head}>
        <div className={styles.titles}>
          <h2 className={styles.title}>{title}</h2>
          <span className={styles.reference}>{part.reference}</span>
        </div>
        <ShopOrderStatusBadge status={part.status} />
      </header>

      {guidance ? <p className={styles.guidance}>{guidance}</p> : null}

      {showCode ? (
        <div className={styles.code}>
          <span className={styles.codeLabel}>Code de remise</span>
          <span className={styles.codeValue}>{groupCode(part.pickupCode ?? "")}</span>
          <span className={styles.codeHint}>
            {pickup ? "À présenter en boutique au retrait." : "À donner au livreur, à la remise du colis."} Ne le
            communiquez à personne d'autre.
          </span>
        </div>
      ) : null}

      {refund ? <p className={styles.refund}>{refund}</p> : null}

      {part.return ? (
        <div className={styles.return}>
          <p className={styles.returnTitle}>
            Retour demandé le {formatStep(part.return.requestedAt)} — {part.return.reasonLabel}
          </p>
          {part.return.details ? <p className={styles.quote}>« {part.return.details} »</p> : null}
          {part.return.photos.length > 0 ? (
            <ul className={styles.photos}>
              {part.return.photos.map((photo, index) => (
                <li key={photo}>
                  <a href={photo} target="_blank" rel="noreferrer">
                    <img src={photo} alt={`Photo ${index + 1} jointe au retour`} />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {part.return.shopResponse ? (
            <p className={styles.answer}>
              <strong>Réponse de la boutique :</strong> {part.return.shopResponse}
            </p>
          ) : null}
          {part.return.resolution ? (
            <p className={styles.answer}>
              <strong>Décision de l'administration :</strong> {RESOLUTION_LABELS[part.return.resolution]}
              {part.return.resolutionNote ? ` — ${part.return.resolutionNote}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <ShopOrderItems items={part.items} linkProducts={viewer === "client"} />

      <dl className={styles.totals}>
        <div className={styles.row}>
          <dt>Articles</dt>
          <dd>{formatPrice(part.subtotal)}</dd>
        </div>
        {part.discountAmount > 0 ? (
          <div className={styles.row}>
            <dt>Part de la remise</dt>
            <dd className={styles.discount}>−{formatPrice(part.discountAmount)}</dd>
          </div>
        ) : null}
        <div className={styles.row}>
          <dt>{deliveryMethodLabel(part.delivery.method)}</dt>
          <dd>{formatFee(part.deliveryFee)}</dd>
        </div>
        <div className={[styles.row, styles.grand].join(" ")}>
          <dt>Total</dt>
          <dd>{formatPrice(part.amount)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Paiement</dt>
          <dd>
            {PAYMENT_METHOD_LABELS[part.payment.method]} · {SHOP_ORDER_PAYMENT_LABELS[part.payment.status]}
          </dd>
        </div>
      </dl>

      <ShopOrderActions part={part} onUpdated={onUpdated} />

      <details className={styles.history} open={historyOpen}>
        <summary>Historique ({part.statusHistory.length})</summary>
        <ShopOrderHistory part={part} />
      </details>
    </section>
  );
};
