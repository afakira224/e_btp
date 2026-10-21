import { Link } from "react-router-dom";
import { deliveryMethodLabel, type Order } from "../../../../entities/order";
import { formatPrice } from "../../../../entities/product";
import { Thumbnail } from "../../../../shared/ui";
import { formatDate, shortReference } from "../utils/format";
import { OrderStatusBadge } from "./OrderStatusBadge";
import styles from "./OrderCard.module.css";

const PREVIEW = 4;

/**
 * Résumé d'une commande dans une liste. Toute la carte mène à la fiche
 * (lien étiré sur la référence) ; les vignettes sont décoratives.
 */
export const OrderCard = ({ order }: { order: Order }) => {
  const shown = order.items.slice(0, PREVIEW);
  const hidden = order.items.length - shown.length;

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <div className={styles.identity}>
          <h3 className={styles.reference}>
            <Link className={styles.link} to={`/compte/commandes/${order.id}`}>
              Commande {shortReference(order.reference)}
            </Link>
          </h3>
          <span className={styles.date}>
            Passée le <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
          </span>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className={styles.bottom}>
        <div className={styles.thumbs} aria-hidden="true">
          {shown.map((item, index) => (
            <span key={`${item.productBoutique?.id ?? "x"}-${index}`} className={styles.thumb}>
              <Thumbnail
                src={item.productBoutique?.urlImages[0] ?? item.product?.urlImages[0]}
                alt=""
                seed={item.productBoutique?.id ?? String(index)}
              />
            </span>
          ))}
          {hidden > 0 ? <span className={styles.more}>+{hidden}</span> : null}
        </div>

        <div className={styles.summary}>
          <span className={styles.amount}>{formatPrice(order.amount)}</span>
          <span className={styles.meta}>
            {order.totalItems} article{order.totalItems > 1 ? "s" : ""} ·{" "}
            {deliveryMethodLabel(order.deliveryMethod)}
          </span>
        </div>
      </div>
    </article>
  );
};
