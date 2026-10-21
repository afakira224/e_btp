import { useMemo } from "react";
import { assetUrl } from "../../config/env";
import styles from "./Thumbnail.module.css";

interface ThumbnailProps {
  /** Première entrée de `urlImages` quand l'API en fournit une. */
  src?: string | undefined;
  /** Texte alternatif — le nom du produit. */
  alt: string;
  /** Graine du motif de repli : l'identifiant du produit. */
  seed: string;
  /** Mention discrète en bas de vignette (catégorie, boutique). */
  caption?: string | undefined;
  ratio?: "square" | "wide";
}

/** Hachage stable : la même graine redonne toujours le même motif. */
const hash = (value: string): number => {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
};

/**
 * Motif de repli.
 * Trois familles de composition, tirées de la graine, toutes construites
 * sur la même grille : le catalogue reste cohérent d'une vignette à l'autre.
 */
const Pattern = ({ seed }: { seed: string }) => {
  const shapes = useMemo(() => {
    const code = hash(seed);
    const variant = code % 3;
    const offset = (code >> 3) % 5;

    if (variant === 0) {
      // Empilement — sacs, palettes, matériaux en vrac.
      return [...Array(4)].map((_, index) => (
        <rect
          key={index}
          x={22 + index * 3}
          y={70 - index * 14}
          width={56 - index * 6}
          height={12}
          rx="2"
          fill="currentColor"
          opacity={0.14 + index * 0.06}
        />
      ));
    }

    if (variant === 1) {
      // Concentrique — bobines, câbles, tuyauterie.
      return [...Array(4)].map((_, index) => (
        <circle
          key={index}
          cx="50"
          cy="50"
          r={34 - index * 8}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          opacity={0.16 + index * 0.08}
        />
      ));
    }

    // Trame — carrelage, revêtements, surfaces.
    return [...Array(9)].map((_, index) => (
      <rect
        key={index}
        x={20 + (index % 3) * 21}
        y={20 + Math.floor(index / 3) * 21}
        width="17"
        height="17"
        rx="2"
        fill="currentColor"
        opacity={index === offset ? 0.34 : 0.12}
      />
    ));
  }, [seed]);

  return (
    <svg
      className={styles.pattern}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      // `currentColor` hérite du texte : le motif suit le thème clair/sombre.
      style={{ color: "var(--color-text)" }}
    >
      {shapes}
    </svg>
  );
};

export const Thumbnail = ({
  src,
  alt,
  seed,
  caption,
  ratio = "square",
}: ThumbnailProps) => (
  <span className={[styles.thumb, ratio === "wide" ? styles.wide : ""].join(" ")}>
    {src ? (
      <img className={styles.image} src={assetUrl(src)} alt={alt} loading="lazy" />
    ) : (
      <Pattern seed={seed} />
    )}
    {caption ? <span className={styles.caption}>{caption}</span> : null}
  </span>
);
