import { Link } from "react-router-dom";
import { describeOptions } from "../../../../entities/delivery";
import {
  formatPrice,
  hasDiscount,
  effectivePrice,
  productImage,
  productName,
  type ProductBoutique,
} from "../../../../entities/product";
import { Badge, Thumbnail } from "../../../../shared/ui";
import { sellerPaths } from "../../shared";
import styles from "./OfferRow.module.css";

/** Un produit de la boutique : prix, stock, et d'où vient sa livraison. */
export const OfferRow = ({ shopId, offer }: { shopId: string; offer: ProductBoutique }) => {
  const delivery = offer.delivery;
  const custom = delivery?.source === "product";
  const name = productName(offer);

  return (
    <li className={styles.row}>
      <span className={styles.thumb}>
        <Thumbnail src={productImage(offer)} alt="" seed={offer.id} />
      </span>

      <div className={styles.body}>
        <span className={styles.name}>{name}</span>
        <span className={styles.meta}>
          {formatPrice(effectivePrice(offer))}
          {hasDiscount(offer) ? <s className={styles.was}>{formatPrice(offer.price)}</s> : null}
          {" · "}
          {offer.stock > 0 ? `${offer.stock} en stock` : "Rupture"}
        </span>
      </div>

      <div className={styles.delivery}>
        <Badge tone={custom ? "solid" : "neutral"}>
          {custom ? "Livraison personnalisée" : "Paramètres de la boutique"}
        </Badge>
        <span className={styles.modes}>
          {delivery && delivery.options.length > 0 ? describeOptions(delivery.options) : "—"}
        </span>
      </div>

      <Link
        className={styles.edit}
        to={sellerPaths.editProduct(shopId, offer.id)}
        aria-label={`Modifier ${name}`}
      >
        Modifier
      </Link>
    </li>
  );
};
