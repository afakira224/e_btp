import { useEffect, useRef, useState } from "react";
import styles from "./ConfirmAction.module.css";

interface ConfirmActionProps {
  /** Libellé du bouton de départ : « Supprimer ». */
  label: string;
  /** Question posée à la place : « Supprimer cette adresse ? ». */
  question: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
}

// ─────────────────────────────────────────────
//  Action irréversible en deux temps, sur place.
//  Plutôt qu'une boîte `confirm()` du navigateur (bloquante, non stylable),
//  le bouton se change en question avec « Confirmer » et « Annuler ». Le
//  focus passe sur « Annuler » : une double frappe sur Entrée ne supprime
//  rien par accident.
// ─────────────────────────────────────────────
export const ConfirmAction = ({
  label,
  question,
  confirmLabel,
  onConfirm,
  disabled = false,
}: ConfirmActionProps) => {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (asking) cancelRef.current?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setAsking(true)}
        disabled={disabled}
      >
        {label}
      </button>
    );
  }

  return (
    <span className={styles.confirm} role="group" aria-label={question}>
      <span className={styles.question}>{question}</span>
      <button
        type="button"
        className={styles.danger}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        {busy ? "…" : confirmLabel}
      </button>
      <button
        ref={cancelRef}
        type="button"
        className={styles.trigger}
        disabled={busy}
        onClick={() => setAsking(false)}
      >
        Annuler
      </button>
    </span>
  );
};
