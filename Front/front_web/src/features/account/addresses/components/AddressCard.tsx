import { useState } from "react";
import { Link } from "react-router-dom";
import { addressLocality, type Address } from "../../../../entities/address";
import { ConfirmAction } from "../../shared";
import styles from "./AddressCard.module.css";

interface AddressCardProps {
  address: Address;
  fallbackRecipient: string;
  /** Page de modification : « Modifier » est une navigation, donc un lien. */
  editTo: string;
  onMakeDefault: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export const AddressCard = ({
  address,
  fallbackRecipient,
  editTo,
  onMakeDefault,
  onDelete,
}: AddressCardProps) => {
  const [busy, setBusy] = useState(false);

  return (
    <article
      className={[styles.card, address.isDefault ? styles.default : ""].filter(Boolean).join(" ")}
      aria-label={address.label || "Adresse"}
    >
      <header className={styles.head}>
        <h3 className={styles.label}>{address.label || "Adresse"}</h3>
        {address.isDefault ? <span className={styles.badge}>Par défaut</span> : null}
      </header>

      <address className={styles.lines}>
        <span className={styles.recipient}>{address.destinataire || fallbackRecipient}</span>
        <span>{address.adresse}</span>
        <span>{addressLocality(address)}</span>
        <span className={styles.phone}>{address.telephone}</span>
      </address>

      <footer className={styles.actions}>
        <Link className={styles.action} to={editTo}>
          Modifier
        </Link>
        {!address.isDefault ? (
          <button
            type="button"
            className={styles.action}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onMakeDefault();
              } finally {
                setBusy(false);
              }
            }}
          >
            Définir par défaut
          </button>
        ) : null}
        <span className={styles.spacer} />
        <ConfirmAction
          label="Supprimer"
          question="Supprimer cette adresse ?"
          confirmLabel="Supprimer"
          disabled={busy}
          onConfirm={onDelete}
        />
      </footer>
    </article>
  );
};
