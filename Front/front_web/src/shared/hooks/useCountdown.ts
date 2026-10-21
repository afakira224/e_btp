import { useEffect, useState } from "react";
import { countdownTo, type Countdown } from "../../entities/promotion";

/**
 * Compte à rebours jusqu'à une date.
 *
 * L'intervalle est nettoyé au démontage et s'arrête de lui-même une fois la
 * date passée : une page laissée ouverte ne garde pas un timer inutile.
 */
export const useCountdown = (endDate: string): Countdown => {
  const [value, setValue] = useState<Countdown>(() => countdownTo(endDate));

  useEffect(() => {
    if (countdownTo(endDate).expired) return;

    const id = window.setInterval(() => {
      const next = countdownTo(endDate);
      setValue(next);
      if (next.expired) window.clearInterval(id);
    }, 1000);

    return () => window.clearInterval(id);
  }, [endDate]);

  return value;
};
