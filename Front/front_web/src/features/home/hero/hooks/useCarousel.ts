import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  count: number;
  /** Durée d'affichage d'une diapositive, en millisecondes. */
  interval?: number;
}

interface Carousel {
  index: number;
  goTo: (next: number) => void;
  next: () => void;
  previous: () => void;
  /** Vrai quand le défilement automatique tourne réellement. */
  isPlaying: boolean;
  /** À poser sur le conteneur : suspend le défilement pendant la lecture. */
  containerProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: (event: React.FocusEvent<HTMLElement>) => void;
  };
}

/** L'utilisateur a demandé moins d'animations : on ne fait rien défiler tout seul. */
const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

// ─────────────────────────────────────────────
//  useCarousel
//
//  Un carrousel qui avance tout seul est une source d'agacement dès qu'il
//  ignore ce que fait l'utilisateur. Celui-ci s'arrête dans quatre cas :
//   • l'utilisateur a demandé moins d'animations (réglage système) ;
//   • le pointeur survole le bloc — on est probablement en train de lire ;
//   • le focus clavier est à l'intérieur — sinon la cible se dérobe ;
//   • l'onglet est en arrière-plan — inutile de défiler pour personne.
// ─────────────────────────────────────────────
export const useCarousel = ({ count, interval = 6500 }: Options): Carousel => {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );
  const [reducedMotion] = useState(prefersReducedMotion);

  // Change à chaque navigation manuelle : le minuteur repart de zéro plutôt
  // que d'enchaîner aussitôt sur la diapositive suivante.
  const nudge = useRef(0);
  const [tick, setTick] = useState(0);

  const goTo = useCallback(
    (target: number) => {
      if (count === 0) return;
      // Modulo positif : reculer depuis la première renvoie à la dernière.
      setIndex(((target % count) + count) % count);
      nudge.current += 1;
      setTick(nudge.current);
    },
    [count]
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const previous = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const isPlaying =
    !reducedMotion && !hovered && !focused && visible && count > 1;

  useEffect(() => {
    if (!isPlaying) return;

    const id = window.setTimeout(
      () => setIndex((current) => (current + 1) % count),
      interval
    );
    return () => window.clearTimeout(id);
    // `tick` remet le minuteur à zéro après une action manuelle.
  }, [count, index, interval, isPlaying, tick]);

  return {
    index,
    goTo,
    next,
    previous,
    isPlaying,
    containerProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: (event) => {
        // `onBlur` remonte depuis les enfants : on ne relance que si le
        // focus a réellement quitté le carrousel.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      },
    },
  };
};
