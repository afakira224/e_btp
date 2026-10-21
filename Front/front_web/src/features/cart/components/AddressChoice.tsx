import { Link } from "react-router-dom";
import { addressLocality, type Address } from "../../../entities/address";
import type { AddressFormState } from "../../account";
import styles from "./AddressChoice.module.css";

interface AddressChoiceProps {
  addresses: Address[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

const NEW_ADDRESS_STATE: AddressFormState = { returnTo: "/commande" };

// ─────────────────────────────────────────────
//  Adresse de livraison, choisie dans le carnet.
//  La commande en garde une copie : modifier ou supprimer l'adresse ensuite
//  ne change pas ce qui a été commandé.
// ─────────────────────────────────────────────
export const AddressChoice = ({ addresses, selectedId, onSelect, disabled = false }: AddressChoiceProps) => (
  <div className={styles.choice}>
    {addresses.length === 0 ? (
      <p className={styles.empty}>
        Aucune adresse enregistrée. Ajoutez celle du chantier ou du domicile où livrer.
      </p>
    ) : (
      <div className={styles.list} role="radiogroup" aria-label="Adresses enregistrées">
        {addresses.map((address) => (
          <label key={address.id} className={styles.address}>
            <input
              type="radio"
              name="addressId"
              value={address.id}
              checked={selectedId === address.id}
              disabled={disabled}
              onChange={() => onSelect(address.id)}
            />
            <span className={styles.text}>
              <span className={styles.label}>
                {address.label || "Adresse"}
                {address.isDefault ? <span className={styles.tag}>Par défaut</span> : null}
              </span>
              {address.destinataire ? <span>{address.destinataire}</span> : null}
              <span>{address.adresse}</span>
              <span className={styles.muted}>{addressLocality(address)}</span>
              <span className={styles.muted}>Joignable au {address.telephone}</span>
            </span>
          </label>
        ))}
      </div>
    )}

    <Link className={styles.add} to="/compte/adresses/nouvelle" state={NEW_ADDRESS_STATE}>
      + Ajouter une adresse
    </Link>
  </div>
);
