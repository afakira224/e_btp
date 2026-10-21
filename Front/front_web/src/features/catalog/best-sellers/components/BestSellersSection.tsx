import { Badge, Button, Thumbnail } from "../../../../shared/ui";
import {
  productName,
  productImage,
  productDescription,
  effectivePrice,
  formatPrice,
  hasDiscount,
  isOutOfStock,
} from "../../../../entities/product";
import { Section } from "../../../home/shared";
import { fetchBestSellers, RatingStars, useResource } from "../../shared";
import styles from "./BestSellersSection.module.css";

const LIMIT = 3;

export const BestSellersSection = () => {
  const { data, isLoading, error } = useResource(fetchBestSellers, []);
  const items = data.slice(0, LIMIT);

  return (
    <Section
      eyebrow="Les plus commandés"
      title="Meilleures ventes"
      moreTo="/meilleures-ventes"
      isLoading={isLoading}
      error={error}
      skeleton={{ count: LIMIT, height: 196, columns: "repeat(3, 1fr)" }}
    >
      <div className={styles.grid}>
        {items.map((item) => (
          <article key={item.id} className={styles.card}>
            <div className={styles.media}>
              <span className={styles.flag}>
                <Badge tone="solid">Top vente</Badge>
              </span>
              <Thumbnail
                src={productImage(item)}
                alt={productName(item)}
                seed={item.id}
              />
            </div>

            <div className={styles.body}>
              <h3 className={styles.name}>{productName(item)}</h3>

              {item.rating !== undefined ? (
                <RatingStars value={item.rating} count={item.reviewsCount} />
              ) : null}

              <p className={styles.desc}>{productDescription(item)}</p>

              <div className={styles.prices}>
                <span className={styles.price}>
                  {formatPrice(effectivePrice(item))}
                </span>
                {hasDiscount(item) ? (
                  <span className={styles.was}>{formatPrice(item.price)}</span>
                ) : null}
              </div>

              <div className={styles.action}>
                <Button variant="secondary" disabled={isOutOfStock(item)}>
                  {isOutOfStock(item) ? "Rupture de stock" : "Ajouter au panier"}
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
};
