import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Button } from "../../../../shared/ui";
import { ApiError } from "../../../../shared/api";
import {
  discountPercent,
  effectivePrice,
  formatPrice,
  hasDiscount,
  isLowStock,
  isOutOfStock,
  type ProductBoutique,
} from "../../../../entities/product";
import { DELIVERY_MODE_LABELS, formatFee } from "../../../../entities/delivery";
import { useAuth } from "../../../auth";
import { useCart } from "../../../cart";
import styles from "./ProductDetail.module.css";

interface BuyBoxProps {
  item: ProductBoutique;
}

export const BuyBox = ({ item }: BuyBoxProps) => {
  const { add } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const rupture = isOutOfStock(item);
  const remise = discountPercent(item);
  const economie = item.price - effectivePrice(item);

  // La quantité ne peut jamais dépasser le stock : le serveur refuserait,
  // autant ne pas laisser l'utilisateur composer une commande impossible.
  const max = Math.max(1, item.stock);

  const ajouter = async () => {
    // Le panier est rattaché à un compte : hors session le back répondrait
    // 401. On emmène vers la connexion en gardant la page d'origine.
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location } });
      return;
    }

    setState("sending");
    setError(null);
    try {
      await add(item.id, quantity);
      setState("done");
    } catch (caught) {
      setState("idle");
      setError(
        caught instanceof ApiError ? caught.message : "L'ajout a échoué. Réessayez."
      );
    }
  };

  return (
    <div className={styles.buy}>
      <div className={styles.prices}>
        <span className={styles.price}>{formatPrice(effectivePrice(item))}</span>
        {hasDiscount(item) ? (
          <span className={styles.was}>{formatPrice(item.price)}</span>
        ) : null}
      </div>

      {remise !== null ? (
        <p className={styles.saving}>
          {`Vous économisez ${formatPrice(economie)} (−${remise} %)`}
        </p>
      ) : null}

      <span className={styles.stock}>
        <span
          className={[
            styles.dot,
            rupture ? styles.dotOut : isLowStock(item) ? styles.dotLow : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        />
        {rupture
          ? "Rupture de stock"
          : isLowStock(item)
            ? `Plus que ${item.stock} en stock`
            : `${item.stock} en stock`}
      </span>

      {/* Modes effectifs du produit — ceux de la boutique ou les siens.
          Les frais définitifs sont calculés au panier, par boutique. */}
      {item.delivery && item.delivery.options.length > 0 ? (
        <ul className={styles.delivery} aria-label="Modes de livraison">
          {item.delivery.options.map((option) => (
            <li key={option.method}>
              <span>{DELIVERY_MODE_LABELS[option.method]}</span>
              <span className={styles.deliveryFee}>{formatFee(option.fee)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.actions}>
        <div className={styles.quantity}>
          <button
            type="button"
            className={styles.step}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            disabled={rupture || quantity <= 1}
            aria-label="Diminuer la quantité"
          >
            −
          </button>
          {/* Lu comme un champ de saisie par les technologies d'assistance,
              même si la valeur se règle avec les deux boutons. */}
          <span
            className={styles.qtyValue}
            role="status"
            aria-live="polite"
            aria-label={`Quantité : ${quantity}`}
          >
            {quantity}
          </span>
          <button
            type="button"
            className={styles.step}
            onClick={() => setQuantity((value) => Math.min(max, value + 1))}
            disabled={rupture || quantity >= max}
            aria-label="Augmenter la quantité"
          >
            +
          </button>
        </div>

        <Button
          onClick={ajouter}
          disabled={rupture}
          isLoading={state === "sending"}
        >
          {rupture ? "Indisponible" : "Ajouter au panier"}
        </Button>
      </div>

      {error ? (
        <div className={styles.feedback}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : state === "done" ? (
        <div className={styles.feedback}>
          <Alert tone="success">
            {quantity > 1
              ? `${quantity} articles ajoutés au panier.`
              : "Article ajouté au panier."}
          </Alert>
        </div>
      ) : null}
    </div>
  );
};
