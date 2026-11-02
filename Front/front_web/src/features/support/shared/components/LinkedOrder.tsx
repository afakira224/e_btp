import { Link } from "react-router-dom";
import { Alert } from "../../../../shared/ui";
import { ShopOrderActions, ShopOrderStatusBadge, useShopOrder } from "../../../orders";
import styles from "./LinkedOrder.module.css";

interface LinkedOrderProps {
  partId: string;
  /** Lien vers la commande dans l'espace de ce lecteur. */
  href: string | null;
  onUpdated: () => void;
}

/**
 * La sous-commande d'une demande, avec ses actions : accepter ou refuser un
 * retour, trancher le litige, annuler d'office. L'argent passe toujours par
 * la commande, jamais par la demande.
 */
export const LinkedOrder = ({ partId, href, onUpdated }: LinkedOrderProps) => {
  const { part, error, replace } = useShopOrder(partId);
  if (error) return <Alert tone="warning">Commande liée indisponible : {error}</Alert>;
  if (!part) return <div className={styles.skeleton} aria-hidden="true" />;
  return (
    <section className={styles.order} aria-label={`Commande ${part.reference}`}>
      <div className={styles.head}>
        <span className={styles.title}>Commande {part.reference}</span>
        <ShopOrderStatusBadge status={part.status} />
      </div>
      <p className={styles.meta}>
        {part.boutique.nom ?? "Boutique"} · {part.totalItems} article{part.totalItems > 1 ? "s" : ""}
        {href ? (
          <>
            {" · "}
            <Link to={href}>Ouvrir la commande</Link>
          </>
        ) : null}
      </p>
      <ShopOrderActions
        part={part}
        onUpdated={(updated) => {
          replace(updated);
          onUpdated();
        }}
      />
    </section>
  );
};
