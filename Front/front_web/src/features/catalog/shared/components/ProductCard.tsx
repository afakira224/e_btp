import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Badge, Thumbnail } from "../../../../shared/ui";
import {
  shopName,
  productName,
  productImage,
  discountPercent,
  effectivePrice,
  formatPrice,
  hasDiscount,
  isLowStock,
  isNew,
  isOutOfStock,
  type ProductBoutique,
} from "../../../../entities/product";
import { useAuth } from "../../../auth";
import { useCart } from "../../../cart";
import { useWishlist } from "../../../wishlist";
import { RatingStars } from "./RatingStars";
import styles from "./ProductCard.module.css";

interface ProductCardProps {
  item: ProductBoutique;
}

export const ProductCard = ({ item }: ProductCardProps) => {
  const { isAuthenticated } = useAuth();
  const { has, toggle } = useWishlist();
  const { add } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const [busy, setBusy] = useState(false);

  const remise = discountPercent(item);
  const rupture = isOutOfStock(item);
  const favori = has(item.id);

  // Panier et favoris sont des ressources rattachées à un compte : hors
  // session, le back répondrait 401. On emmène vers la connexion en
  // gardant la page d'origine plutôt que d'afficher une erreur.
  const exigeSession = (): boolean => {
    if (isAuthenticated) return false;
    navigate("/login", { state: { from: location } });
    return true;
  };

  const run = async (action: () => Promise<void>) => {
    if (exigeSession()) return;
    setBusy(true);
    try {
      await action();
    } catch {
      // L'échec est silencieux ici : la vignette n'a pas la place
      // d'afficher un message, et les pages dédiées le font déjà.
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <div className={styles.flags}>
          {remise !== null ? <Badge tone="accent">{`−${remise} %`}</Badge> : null}
          {isNew(item) ? <Badge tone="neutral">Nouveau</Badge> : null}
        </div>

        <button
          type="button"
          className={[styles.wish, favori ? styles.wishOn : ""].filter(Boolean).join(" ")}
          onClick={() => void run(() => toggle(item.id))}
          disabled={busy}
          aria-pressed={favori}
          aria-label={
            favori
              ? `Retirer ${productName(item)} des favoris`
              : `Ajouter ${productName(item)} aux favoris`
          }
        >
          <span aria-hidden="true">{favori ? "♥" : "♡"}</span>
        </button>

        <Thumbnail
          src={productImage(item)}
          alt={productName(item)}
          seed={item.id}
        />
      </div>

      <div className={styles.body}>
        {item.boutique ? (
          <Link
            className={`${styles.shop} ${styles.shopLink}`}
            to={`/boutiques/${item.boutique.id}`}
          >
            {shopName(item)}
          </Link>
        ) : (
          <span className={styles.shop}>{shopName(item)}</span>
        )}
        <h3 className={styles.name}>
          <Link className={styles.nameLink} to={`/produits/${item.id}`}>
            {productName(item)}
          </Link>
        </h3>

        {item.rating !== undefined ? (
          <RatingStars value={item.rating} count={item.reviewsCount} />
        ) : null}

        <div className={styles.prices}>
          <span className={styles.price}>{formatPrice(effectivePrice(item))}</span>
          {hasDiscount(item) ? (
            <span className={styles.was}>{formatPrice(item.price)}</span>
          ) : null}
        </div>
      </div>

      <div className={styles.footer}>
        <span
          className={[
            styles.stock,
            rupture ? styles.out : isLowStock(item) ? styles.low : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {rupture
            ? "Rupture"
            : isLowStock(item)
              ? `Plus que ${item.stock}`
              : "En stock"}
        </span>

        <button
          type="button"
          className={styles.add}
          onClick={() => void run(() => add(item.id, 1))}
          disabled={rupture || busy}
          aria-label={`Ajouter ${productName(item)} au panier`}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </article>
  );
};
