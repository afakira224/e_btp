import type { KeyboardEvent } from "react";
import {
  fetchBestSellers,
  fetchNewArrivals,
  useResource,
} from "../../../catalog/shared";
import { useCarousel } from "../hooks/useCarousel";
import { HERO_SLIDES, pickProducts } from "../model/slides";
import { HeroSlide } from "./HeroSlide";
import styles from "./Hero.module.css";

const PROOF = [
  { value: "240", label: "Boutiques" },
  { value: "12 000", label: "Références" },
  { value: "48 h", label: "Livraison Conakry" },
];

export const Hero = () => {
  // Les diapositives mettent en avant de vrais articles du catalogue plutôt
  // que des visuels décoratifs : ce qui est montré est réellement achetable.
  const bestSellers = useResource(fetchBestSellers, []);
  const newArrivals = useResource(fetchNewArrivals, []);

  const { index, goTo, next, previous, isPlaying, containerProps } = useCarousel({
    count: HERO_SLIDES.length,
  });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      previous();
    }
  };

  return (
    <section
      className={styles.hero}
      role="region"
      aria-roledescription="carrousel"
      aria-label="Mises en avant"
      onKeyDown={onKeyDown}
      {...containerProps}
    >
      <div className="container">
        <div
          className={styles.viewport}
          // Muet pendant le défilement automatique : annoncer une nouvelle
          // diapositive toutes les six secondes rendrait la page
          // inutilisable au lecteur d'écran. Dès que l'utilisateur prend la
          // main, les changements redeviennent audibles.
          aria-live={isPlaying ? "off" : "polite"}
        >
          <div
            className={styles.track}
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {HERO_SLIDES.map((slide, position) => (
              <HeroSlide
                key={slide.id}
                slide={slide}
                products={pickProducts(
                  slide.source,
                  bestSellers.data,
                  newArrivals.data
                )}
                position={position + 1}
                total={HERO_SLIDES.length}
                isActive={position === index}
              />
            ))}
          </div>
        </div>

        <div className={styles.bottom}>
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.arrow}
              onClick={previous}
              aria-label="Diapositive précédente"
            >
              <span aria-hidden="true">←</span>
            </button>

            <div className={styles.dots}>
              {HERO_SLIDES.map((slide, position) => (
                <button
                  key={slide.id}
                  type="button"
                  className={[
                    styles.dotButton,
                    position === index ? styles.dotActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => goTo(position)}
                  aria-label={`Aller à la diapositive ${position + 1} : ${slide.eyebrow}`}
                  aria-current={position === index}
                />
              ))}
            </div>

            <button
              type="button"
              className={styles.arrow}
              onClick={next}
              aria-label="Diapositive suivante"
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <dl className={styles.proof}>
            {PROOF.map((entry) => (
              <div key={entry.label}>
                <dd className={styles.proofValue}>{entry.value}</dd>
                <dt className={styles.proofLabel}>{entry.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
};
