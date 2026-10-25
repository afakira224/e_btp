import { useState, type ReactNode } from "react";
import { isPickupDelivery, type ShopOrder, type ShopOrderViewer } from "../../../../entities/order";
import { Alert } from "../../../../shared/ui";
import { ShopOrderPanel } from "./ShopOrderPanel";
import styles from "./ShopOrderDetail.module.css";

interface ShopOrderDetailProps {
  part: ShopOrder;
  viewer: Exclude<ShopOrderViewer, "client">;
  onUpdated: (part: ShopOrder) => void;
  /** Bloc ajouté en colonne (ex. la boutique, pour l'administration). */
  aside?: ReactNode;
}

// ─────────────────────────────────────────────
//  Fiche d'une sous-commande côté boutique et administration : la commande
//  et ses actions, et en colonne de quoi livrer — le client, son téléphone,
//  l'adresse ou le lieu de retrait.
// ─────────────────────────────────────────────
export const ShopOrderDetail = ({ part, viewer, onUpdated, aside }: ShopOrderDetailProps) => {
  const [feedback, setFeedback] = useState<string | null>(null);
  const address = part.shippingAddress;
  const customer = part.customer;

  return (
    <div className={styles.detail}>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}

      <div className={styles.layout}>
        <ShopOrderPanel
          part={part}
          viewer={viewer}
          title={customer ? `${customer.prenom} ${customer.nom}`.trim() : "Commande"}
          historyOpen
          onUpdated={(updated, message) => {
            setFeedback(message);
            onUpdated(updated);
          }}
        />

        <div className={styles.side}>
          <section className={styles.box}>
            <h2 className={styles.boxTitle}>Client</h2>
            {customer ? (
              <p className={styles.line}>
                <strong>{`${customer.prenom} ${customer.nom}`.trim()}</strong>
                {customer.telephone ? (
                  <a className={styles.phone} href={`tel:${customer.telephone}`}>
                    {customer.telephone}
                  </a>
                ) : (
                  <span className={styles.muted}>Téléphone non renseigné</span>
                )}
              </p>
            ) : (
              <p className={styles.muted}>Coordonnées indisponibles.</p>
            )}
          </section>

          <section className={styles.box}>
            <h2 className={styles.boxTitle}>{isPickupDelivery(part.delivery) ? "Retrait en boutique" : "Livraison"}</h2>
            {isPickupDelivery(part.delivery) ? (
              <p className={styles.line}>
                <span>Le client vient chercher sa commande{part.delivery.pickupAdresse ? " :" : "."}</span>
                {part.delivery.pickupAdresse ? <span>{part.delivery.pickupAdresse}</span> : null}
              </p>
            ) : address ? (
              <address className={styles.line}>
                {address.destinataire ? <strong>{address.destinataire}</strong> : null}
                <span>{address.adresse}</span>
                <span>{[address.commune, address.ville].filter(Boolean).join(", ")}</span>
                {address.pays !== "Guinée" ? <span>{address.pays}</span> : null}
                <a className={styles.phone} href={`tel:${address.telephone}`}>
                  {address.telephone}
                </a>
              </address>
            ) : (
              <p className={styles.muted}>Adresse non renseignée.</p>
            )}
            <p className={styles.muted}>Tentatives de livraison : {part.deliveryAttempts}</p>
          </section>

          {aside}
        </div>
      </div>
    </div>
  );
};
