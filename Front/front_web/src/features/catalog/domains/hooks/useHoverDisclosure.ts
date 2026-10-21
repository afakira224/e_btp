import { useCallback, useEffect, useRef, useState } from "react";

/** L'appareil possède-t-il un vrai survol ? Faux sur écran tactile. */
const hasHover = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: hover)").matches;
};

// ─────────────────────────────────────────────
//  useHoverDisclosure
//
//  Un menu qui ne s'ouvre qu'au survol est inutilisable au clavier et au
//  doigt. Celui-ci répond à trois gestes : survol, focus et clic.
//
//  La fermeture est retardée volontairement : en allant en diagonale du
//  déclencheur vers le panneau, le pointeur sort une fraction de seconde de
//  la zone, et un menu qui se referme dans cet intervalle est impossible à
//  attraper.
// ─────────────────────────────────────────────
export const useHoverDisclosure = (closeDelay = 180) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pointerHasHover] = useState(hasHover);

  const timer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const cancelClose = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const open = useCallback(() => {
    cancelClose();
    setIsOpen(true);
  }, [cancelClose]);

  const close = useCallback(
    (delay = 0) => {
      cancelClose();
      if (delay <= 0) {
        setIsOpen(false);
        return;
      }
      timer.current = window.setTimeout(() => setIsOpen(false), delay);
    },
    [cancelClose]
  );

  const toggle = useCallback(() => {
    cancelClose();
    setIsOpen((current) => !current);
  }, [cancelClose]);

  // Échappement et clic extérieur. Le clavier reprend la main sur le
  // déclencheur : sans cela le focus resterait dans un panneau fermé.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen]);

  useEffect(() => cancelClose, [cancelClose]);

  return {
    isOpen,
    open,
    close,
    toggle,
    containerRef,
    triggerRef,
    /** Gestes de survol — neutralisés sur écran tactile, où « survoler »
        signifierait ouvrir au premier effleurement sans pouvoir refermer. */
    hoverProps: pointerHasHover
      ? {
          onMouseEnter: open,
          onMouseLeave: () => close(closeDelay),
        }
      : {},
    /** Le focus ouvre, la sortie du bloc ferme sans délai. */
    focusProps: {
      onFocus: open,
      onBlur: (event: React.FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          close(0);
        }
      },
    },
  };
};
