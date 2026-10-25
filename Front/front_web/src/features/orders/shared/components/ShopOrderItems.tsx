import { Link } from "react-router-dom";
import type { ShopOrderItem } from "../../../../entities/order";
import { formatPrice } from "../../../../entities/product";
import { Thumbnail } from "../../../../shared/ui";
import styles from "./ShopOrderItems.module.css";

/** Articles d'une sous-commande, au prix figé à la commande. */
export const ShopOrderItems = ({ items, linkProducts = true }: { items: ShopOrderItem[]; linkProducts?: boolean }) => (
  <ul className={styles.items}>
    {items.map((item, index) => (
      <li key={`${item.productBoutiqueId}-${index}`} className={styles.item}>
        <span className={styles.thumb}>
          <Thumbnail src={item.urlImages[0]} alt="" seed={item.productBoutiqueId} />
        </span>
        <div className={styles.body}>
          {linkProducts ? (
            <Link className={styles.name} to={`/produits/${item.productBoutiqueId}`}>
              {item.productName ?? "Article"}
            </Link>
          ) : (
            <span className={styles.name}>{item.productName ?? "Article"}</span>
          )}
          <span className={styles.qty}>
            {item.quantity} × {formatPrice(item.price)}
          </span>
        </div>
        <span className={styles.total}>{formatPrice(item.lineTotal)}</span>
      </li>
    ))}
  </ul>
);
