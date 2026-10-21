import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deliveryMethodLabel,
  DeliveryMethod,
  OrderStatus,
  type Order,
  type OrderItem,
} from "../../../../entities/order";
import { DeliveryMode, formatFee } from "../../../../entities/delivery";
import { formatPrice } from "../../../../entities/product";
import { Alert, Button, Thumbnail } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { useResource } from "../../../catalog";
import { useCart } from "../../../cart";
import {
  AccountHeader,
  AccountPage,
  AccountPanel,
  fetchOrder,
  formatDate,
  OrderStatusBadge,
  shortReference,
} from "../../shared";
import { OrderTimeline } from "../components/OrderTimeline";
import styles from "./OrderDetailPage.module.css";

const ORDERS_CRUMB = { label: "Mes commandes", to: "/compte/commandes" };

const itemName = (item: OrderItem): string =>
  item.product?.name ?? item.productBoutique?.product?.name ?? "Article retiré du catalogue";

/** Articles encore commandables : l'offre existe toujours et a du stock. */
const reorderable = (order: Order) =>
  order.items.filter((item) => item.productBoutique && item.productBoutique.stock > 0);

// ─────────────────────────────────────────────
//  Détail d'une commande — /compte/commandes/:orderId
//  Suivi (étapes datées), articles au prix figé, récapitulatif des montants
//  et livraison. Le client ne peut pas annuler lui-même : le back réserve
//  le changement de statut au dépôt et à l'administrateur.
// ─────────────────────────────────────────────
export const OrderDetailPage = () => {
  const { orderId = "" } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { add } = useCart();
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const load = useCallback((signal: AbortSignal) => fetchOrder(orderId, signal), [orderId]);
  const order = useResource<Order | null>(load, null, orderId);
  const data = order.data;

  useDocumentTitle(data ? `Commande ${shortReference(data.reference)}` : "Commande");

  if (order.error) {
    return (
      <AccountPage>
        <AccountHeader
          title="Commande introuvable"
          trail={[ORDERS_CRUMB, { label: "Introuvable" }]}
        />
        <Alert tone="danger">{order.error}</Alert>
      </AccountPage>
    );
  }

  if (order.isLoading || !data) {
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
    setReorderError(null);
    try {
      for (const item of available) {
        const offer = item.productBoutique;
        if (offer) await add(offer.id, Math.min(item.quantity, offer.stock));
      }
      navigate("/panier");
    } catch (caught) {
      setReorderError((caught as Error).message);
      setReordering(false);
    }
  };

  const address = data.shippingAddress;
  const pickupShops = [
    ...new Map(
      data.items.filter((item) => item.boutique).map((item) => [item.boutique!.id, item.boutique!])
    ).values(),
  ];

  // Une livraison par boutique, figée au checkout. Les commandes d'avant les
  // modes par boutique n'en ont pas : elles gardent leur mode unique.
  const deliveries = data.deliveries ?? [];
  const delivered = deliveries.some((delivery) => delivery.method !== DeliveryMode.PICKUP);
  const shippingLabel =
    deliveries.length > 1 ? "Livraison" : deliveryMethodLabel(data.deliveryMethod);

  return (
    <AccountPage>
      <AccountHeader
        title={`Commande ${shortReference(data.reference)}`}
        lede={`Passée le ${formatDate(data.createdAt)} · ${data.totalItems} article${data.totalItems > 1 ? "s" : ""}`}
        trail={[ORDERS_CRUMB, { label: `Commande ${shortReference(data.reference)}` }]}
        action={
          available.length > 0 ? (
            <Button variant="secondary" onClick={() => void reorder()} isLoading={reordering}>
              Commander à nouveau
            </Button>
          ) : undefined
        }
      />

      {reorderError ? (
        <div className={styles.alert}>
          <Alert tone="danger">{reorderError}</Alert>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.main}>
          <AccountPanel title="Articles">
            <ul className={styles.items}>
              {data.items.map((item, index) => {
                const offer = item.productBoutique;
                return (
                  <li key={`${offer?.id ?? "retire"}-${index}`} className={styles.item}>
                    <span className={styles.thumb}>
                      <Thumbnail
                        src={offer?.urlImages[0] ?? item.product?.urlImages[0]}
                        alt=""
                        seed={offer?.id ?? String(index)}
                      />
                    </span>
                    <div className={styles.itemBody}>
                      {offer ? (
                        <Link className={styles.itemName} to={`/produits/${offer.id}`}>
                          {itemName(item)}
                        </Link>
                      ) : (
                        <span className={styles.itemName}>{itemName(item)}</span>
                      )}
                      {item.boutique ? (
                        <Link className={styles.itemShop} to={`/boutiques/${item.boutique.id}`}>
                          {item.boutique.nom}
                        </Link>
                      ) : null}
                      <span className={styles.itemQty}>
                        {item.quantity} × {formatPrice(item.price)}
                      </span>
                    </div>
                    <span className={styles.itemTotal}>{formatPrice(item.lineTotal)}</span>
                  </li>
                );
              })}
            </ul>

            <dl className={styles.totals}>
              <div className={styles.totalRow}>
                <dt>Sous-total</dt>
                <dd>{formatPrice(data.subtotal)}</dd>
              </div>
              {data.discountAmount > 0 ? (
                <div className={styles.totalRow}>
                  <dt>Remise{data.promotionCode ? ` (${data.promotionCode})` : ""}</dt>
                  <dd className={styles.discount}>−{formatPrice(data.discountAmount)}</dd>
                </div>
              ) : null}
              <div className={styles.totalRow}>
                <dt>{shippingLabel}</dt>
                <dd>{formatFee(data.shippingFee)}</dd>
              </div>
              <div className={[styles.totalRow, styles.grand].join(" ")}>
                {/* « Total » et non « payé » : le back ne connaît pas l'état du
                    paiement, et une commande annulée n'a rien coûté. */}
                <dt>Total</dt>
                <dd>{formatPrice(data.amount)}</dd>
              </div>
            </dl>
          </AccountPanel>
        </div>

        <div className={styles.side}>
          <AccountPanel title="Suivi">
            <div className={styles.status}>
              <OrderStatusBadge status={data.status} />
            </div>
            <OrderTimeline order={data} />
          </AccountPanel>

          <AccountPanel title="Livraison">
            {deliveries.length > 0 ? (
              <>
                {/* Modes et frais tels qu'ils ont été facturés : ils ne suivent
                    pas les réglages actuels des boutiques. */}
                <ul className={styles.deliveries}>
                  {deliveries.map((delivery) => (
                    <li key={delivery.boutiqueId} className={styles.delivery}>
                      <div className={styles.deliveryHead}>
                        <Link to={`/boutiques/${delivery.boutiqueId}`}>
                          {delivery.boutiqueNom ?? "Boutique"}
                        </Link>
                        <span className={styles.deliveryFee}>{formatFee(delivery.fee)}</span>
                      </div>
                      <span className={styles.method}>{deliveryMethodLabel(delivery.method)}</span>
                      {delivery.method === DeliveryMode.PICKUP ? (
                        <span className={styles.muted}>
                          À retirer : {delivery.pickupAdresse ?? "adresse de la boutique"}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
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
                ) : null}
              </>
            ) : (
              <p className={styles.method}>{deliveryMethodLabel(data.deliveryMethod)}</p>
            )}
            {deliveries.length > 0 ? null : data.deliveryMethod === DeliveryMethod.PICKUP ? (
              <div className={styles.pickup}>
                <p>À retirer au dépôt :</p>
                <ul>
                  {pickupShops.map((shop) => (
                    <li key={shop.id}>
                      <Link to={`/boutiques/${shop.id}`}>{shop.nom}</Link>
                      {shop.adresse ? <span> — {shop.adresse}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : address ? (
              <address className={styles.address}>
                {address.destinataire ? <span>{address.destinataire}</span> : null}
                <span>{address.adresse}</span>
                <span>{[address.commune, address.ville].filter(Boolean).join(", ")}</span>
                {address.pays !== "Guinée" ? <span>{address.pays}</span> : null}
                <span className={styles.contact}>Joignable au {address.telephone}</span>
              </address>
            ) : (
              <p className={styles.muted}>Adresse non renseignée.</p>
            )}
            {data.status === OrderStatus.CANCELLED ? (
              <p className={styles.muted}>Cette commande a été annulée : rien ne sera livré.</p>
            ) : null}
          </AccountPanel>

          <AccountPanel title="Référence">
            <p className={styles.reference}>{data.reference}</p>
            <p className={styles.muted}>À communiquer au dépôt pour toute question.</p>
          </AccountPanel>
        </div>
      </div>
    </AccountPage>
  );
};
