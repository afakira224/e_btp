import styles from "./RatingStars.module.css";

interface RatingStarsProps {
  /** Note sur 5. */
  value: number;
  count?: number | undefined;
}

const STARS = "★★★★★";

export const RatingStars = ({ value, count }: RatingStarsProps) => {
  const ratio = Math.max(0, Math.min(1, value / 5));

  return (
    <span className={styles.rating}>
      <span
        className={styles.track}
        // Une note se lit, elle ne se déchiffre pas : le libellé donne la
        // valeur, les étoiles ne sont qu'un raccourci visuel.
        role="img"
        aria-label={`Note ${value.toFixed(1)} sur 5`}
      >
        {STARS}
        <span className={styles.fill} style={{ width: `${ratio * 100}%` }} aria-hidden="true">
          {STARS}
        </span>
      </span>
      {count !== undefined ? <span className={styles.count}>({count})</span> : null}
    </span>
  );
};
