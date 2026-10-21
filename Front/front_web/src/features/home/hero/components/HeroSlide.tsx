import { Link } from "react-router-dom";
import { Button, Thumbnail } from "../../../../shared/ui";
import {
  productName,
  productImage,
  effectivePrice,
  formatPrice,
  type ProductBoutique,
} from "../../../../entities/product";
import type { HeroSlide as Slide } from "../model/slides";
import styles from "./Hero.module.css";

interface HeroSlideProps {
  slide: Slide;
  products: ProductBoutique[];
  /** Position dans le carrousel, annoncée aux technologies d'assistance. */
  position: number;
  total: number;
  isActive: boolean;
}

export const HeroSlide = ({
  slide,
  products,
  position,
  total,
  isActive,
}: HeroSlideProps) => (
  <div
    className={styles.slide}
    role="group"
    aria-roledescription="diapositive"
    aria-label={`${position} sur ${total} — ${slide.eyebrow}`}
    // `inert` retire la diapositive masquée du focus et de l'arbre
    // d'accessibilité : sans cela, la tabulation emmène l'utilisateur sur
    // des liens invisibles hors de l'écran.
    inert={!isActive}
  >
    <div className={styles.copy}>
      <span className={styles.eyebrow}>
        {slide.flagged ? <span className={styles.dot} aria-hidden="true" /> : null}
        {slide.eyebrow}
      </span>

      <h1 className={styles.title}>{slide.title}</h1>
      <p className={styles.lede}>{slide.lede}</p>

      <div className={styles.actions}>
        <Link to={slide.primary.to}>
          <Button>{slide.primary.label}</Button>
        </Link>
        <Link to={slide.secondary.to}>
          <Button variant="secondary">{slide.secondary.label}</Button>
        </Link>
      </div>
    </div>

    <div className={styles.showcase}>
      {products.map((item, rank) => (
        <Link
          key={item.id}
          to={`/produits/${item.id}`}
          className={[styles.spot, rank === 0 ? styles.spotLead : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={styles.thumb}>
            <Thumbnail
              src={productImage(item)}
              alt={productName(item)}
              seed={item.id}
            />
          </span>
          <span className={styles.spotBody}>
            <span className={styles.spotName}>{productName(item)}</span>
            <span className={styles.spotPrice}>
              {formatPrice(effectivePrice(item))}
            </span>
          </span>
        </Link>
      ))}
    </div>
  </div>
);
