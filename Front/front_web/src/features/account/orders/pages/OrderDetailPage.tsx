import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  DeliveryMode,
  formatFee,
} from "../../../../entities/delivery";
import {
  ORDER_PAYMENT_LABELS,
  OrderStatus,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  type Order,
  type ShopOrder,
} from "../../../../entities/order";
import { formatPrice } from "../../../../entities/product";
import { Alert, Button } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { useResource } from "../../../catalog";
import { useCart } from "../../../cart";
import {
  fetchOrder,
  formatDeadline,
  paymentDestination,
  restartPayment,
  ShopOrderPanel,
  timeLeft,
} from "../../../orders";
import {
  AccountHeader,
  AccountPage,
  AccountPanel,
  formatDate,
  OrderStatusBadge,
  shortReference,
} from "../../shared";
import styles from "./OrderDetailPage.module.css";

const ORDERS_CRUMB = { label: "Mes commandes", to: "/compte/commandes" };

/** Message passé par la page de commande, affiché à l'arrivée. */
export interface OrderDetailState {
  feedback?: string;
}

/** Articles encore commandables : l'offre existe toujours et a du stock. */
const reorderable = (order: Order) =>
  order.items.filter((item) => item.productBoutique && item.productBoutique.stock > 0);

// ─────────────────────────────────────────────
//  Détail d'une commande — /compte/commandes/:orderId
//
//  Une commande se découpe en une sous-commande par boutique : chacune a son
//  statut, son code de remise, ses délais et ses actions (annuler tant que
//  la boutique n'a pas expédié, demander un retour après la livraison). Le
//  statut global se déduit des parties. En colonne : les montants, le
//  paiement et l'adresse.
// ─────────────────────────────────────────────
export const OrderDetailPage = () => {
  const { orderId = "" } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const arrival = (useLocation().state as OrderDetailState | null)?.feedback ?? null;
  const { add } = useCart();
  const [reordering, setReordering] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(arrival);
  // Une action relit la commande : son statut global peut avoir changé. Les
  // données affichées restent en place pendant la relecture.
  const [version, setVersion] = useState(0);

  const load = useCallback((signal: AbortSignal) => fetchOrder(orderId, signal), [orderId]);
  const order = useResource<Order | null>(load, null, `${orderId}:${version}`);
  const data = order.data?.id === orderId ? order.data : null;

  useDocumentTitle(data ? `Commande ${shortReference(data.reference)}` : "Commande");

  if (order.error && !data) {
    return (
      <AccountPage>
        <AccountHeader title="Commande introuvable" trail={[ORDERS_CRUMB, { label: "Introuvable" }]} />
        <Alert tone="danger">{order.error}</Alert>
      </AccountPage>
    );
  }

  if (!data) {
    return (
      <AccountPage>
        <AccountHeader title="Commande…" trail={[ORDERS_CRUMB, { label: "…" }]} />
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  const available = reorderable(data);

  // « Commander à nouveau » remet au panier ce qui est encore disponible, dans
  // la limite du stock, puis emmène au panier pour vérifier avant de payer.
  const reorder = async () => {
    setReordering(true);
    setError(null);
    try {
      for (const item of available) {
        const offer = item.productBoutique;
        if (offer) await add(offer.id, Math.min(item.quantity, offer.stock));
      }
      navigate("/panier");
    } catch (caught) {
      setError((caught as Error).message);
      setReordering(false);
    }
  };

  const pay = async () => {
    setPaying(true);
    setError(null);
    try {
      const { redirectUrl } = await restartPayment(data.id);
      if (!redirectUrl) throw new Error("Le prestataire de paiement n'a pas répondu.");
      const destination = paymentDestination(redirectUrl);
      if ("external" in destination) window.location.assign(destination.external);
      else navigate(destination.internal);
    } catch (caught) {
      setError((caught as Error).message);
      setPaying(false);
      setVersion((value) => value + 1);
    }
  };

  const onPartUpdated = (_part: ShopOrder, message: string) => {
    setFeedback(message);
    setError(null);
    setVersion((value) => value + 1);
  };

  const address = data.shippingAddress;
  const delivered = data.parts.some((part) => part.delivery.method !== DeliveryMode.PICKUP);
  const awaitingPayment = data.status === OrderStatus.AWAITING_PAYMENT;

  return (
    <AccountPage>
      <AccountHeader
        title={`Commande ${shortReference(data.reference)}`}
        lede={`Passée le ${formatDate(data.createdAt)} · ${data.totalItems} article${data.totalItems > 1 ? "s" : ""}${
          data.parts.length > 1 ? ` · ${data.parts.length} boutiques` : ""
        }`}
        trail={[ORDERS_CRUMB, { label: `Commande ${shortReference(data.reference)}` }]}
        action={
          available.length > 0 && !awaitingPayment ? (
            <Button variant="secondary" onClick={() => void reorder()} isLoading={reordering}>
              Commander à nouveau
            </Button>
          ) : undefined
        }
      />

      {feedback ? (
        <div className={styles.alert}>
          <Alert tone="success">{feedback}</Alert>
        </div>
      ) : null}

      {error ? (
        <div className={styles.alert}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {awaitingPayment ? (
        <div className={styles.paymentDue}>
          <p>
            <strong>Paiement en attente.</strong>{" "}
            {data.paymentExpiresAt
              ? `À régler avant le ${formatDeadline(data.paymentExpiresAt)} (${timeLeft(data.paymentExpiresAt)}). `
              : ""}
            Sans paiement, la commande est annulée et ses articles reviennent dans votre panier.
          </p>
          <Button onClick={() => void pay()} isLoading={paying}>
            Payer {formatPrice(data.amount)}
          </Button>
        </div>
      ) : data.status === OrderStatus.PAYMENT_FAILED ? (
        <div className={styles.alert}>
          <Alert tone="warning">
            Le paiement n'a pas abouti : la commande est annulée et ses articles sont revenus dans votre panier.{" "}
            <Link to="/panier">Voir mon panier</Link>
          </Alert>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.main}>
          {data.parts.map((part) => (
            <ShopOrderPanel
              key={part.id}
              part={part}
              viewer="client"
              title={<Link to={`/boutiques/${part.boutique.id}`}>{part.boutique.nom ?? "Boutique"}</Link>}
              onUpdated={onPartUpdated}
            />
          ))}
        </div>

        <div className={styles.side}>
          <AccountPanel title="Récapitulatif">
            <div className={styles.status}>
              <OrderStatusBadge status={data.status} />
            </div>
            <dl className={styles.totals}>
              <div className={styles.totalRow}>
                <dt>Articles</dt>
                <dd>{formatPrice(data.subtotal)}</dd>
              </div>
              {data.discountAmount > 0 ? (
                <div className={styles.totalRow}>
                  <dt>Remise{data.promotionCode ? ` (${data.promotionCode})` : ""}</dt>
                  <dd className={styles.discount}>−{formatPrice(data.discountAmount)}</dd>
                </div>
              ) : null}
              <div className={styles.totalRow}>
                <dt>Livraison</dt>
                <dd>{formatFee(data.shippingFee)}</dd>
              </div>
              <div className={[styles.totalRow, styles.grand].join(" ")}>
                <dt>Total</dt>
                <dd>{formatPrice(data.amount)}</dd>
              </div>
              <div className={styles.totalRow}>
                <dt>Paiement</dt>
                {/* Payée à la remise, chaque boutique encaisse sa part : son
                    état se lit dans son bloc. En ligne, le paiement est unique. */}
                <dd>
                  {PAYMENT_METHOD_LABELS[data.paymentMethod]}
                  {data.paymentMethod === PaymentMethod.ONLINE ? ` · ${ORDER_PAYMENT_LABELS[data.paymentStatus]}` : ""}
                </dd>
              </div>
            </dl>
          </AccountPanel>

          <AccountPanel title={delivered ? "Adresse de livraison" : "Retrait en boutique"}>
            {delivered ? (
              address ? (
                <address className={styles.address}>
                  {address.destinataire ? <span>{address.destinataire}</span> : null}
                  <span>{address.adresse}</span>
                  <span>{[address.commune, address.ville].filter(Boolean).join(", ")}</span>
                  {address.pays !== "Guinée" ? <span>{address.pays}</span> : null}
                  <span className={styles.contact}>Joignable au {address.telephone}</span>
                </address>
              ) : (
                <p className={styles.muted}>Adresse non renseignée.</p>
              )
            ) : (
              <ul className={styles.pickupList}>
                {data.parts.map((part) => (
                  <li key={part.id}>
                    <strong>{part.boutique.nom ?? "Boutique"}</strong>
                    {part.delivery.pickupAdresse ? ` — ${part.delivery.pickupAdresse}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </AccountPanel>

          <AccountPanel title="Référence">
            <p className={styles.reference}>{data.reference}</p>
            <p className={styles.muted}>
              Chaque boutique a sa propre référence (suffixe -1, -2…) : donnez-la-lui pour toute question.
            </p>
          </AccountPanel>
        </div>
      </div>
    </AccountPage>
  );
};
