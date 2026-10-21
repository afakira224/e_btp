import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Thumbnail } from "../../../shared/ui";
import { ApiError } from "../../../shared/api";
import { formatPrice } from "../../../entities/product";
import {
  currentPrice,
  exceedsStock,
  hasBlockingIssue,
  isOutOfStock,
  priceChanged,
  priceDelta,
  type CartItem,
} from "../../../entities/cart";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
} from "../../catalog/shared/components/CatalogPage";
import { useCart } from "../shared/hooks/useCart";
import styles from "./CartPage.module.css";

const CRUMBS = [{ label: "Accueil", to: "/" }, { label: "Panier" }];

// ─────────────────────────────────────────────
//  Une ligne de panier.
//  Le DTO expose le prix figé à l'ajout *et* le prix courant : quand les
//  deux divergent, on le dit ici plutôt que de laisser l'utilisateur le
//  découvrir au paiement.
// ─────────────────────────────────────────────
const Line = ({
  item,
  onQuantity,
  onRemove,
  busy,
}: {
  item: CartItem;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  busy: boolean;
}) => {
  const rupture = isOutOfStock(item);
  const trop = exceedsStock(item);
  const delta = priceDelta(item);

  return (
    <div className={styles.line}>
      <span className={styles.thumb}>
        <Thumbnail
          src={item.urlImages[0]}
          alt={item.productName ?? "Produit"}
          seed={item.productBoutiqueId}
        />
      </span>

      <div className={styles.body}>
        <Link className={styles.name} to={`/produits/${item.productBoutiqueId}`}>
          {item.productName ?? "Produit indisponible"}
        </Link>

        <span className={styles.unit}>
          {formatPrice(item.unitPrice)} l'unité
        </span>

        {rupture ? (
          <span className={[styles.warn, styles.danger].join(" ")}>
            Cet article n'est plus en stock
          </span>
        ) : trop ? (
          <span className={[styles.warn, styles.danger].join(" ")}>
            Plus que {item.stock} en stock — réduisez la quantité
          </span>
        ) : null}

        {priceChanged(item) ? (
          <span className={[styles.warn, styles.info].join(" ")}>
            Prix actuel : {formatPrice(currentPrice(item))} (
            {delta > 0 ? "+" : "−"}
            {formatPrice(Math.abs(delta))} depuis l'ajout)
          </span>
        ) : null}
      </div>

      <div className={styles.controls}>
        <span className={styles.lineTotal}>{formatPrice(item.lineTotal)}</span>

        <div className={styles.quantity}>
          <button
            type="button"
            className={styles.step}
            onClick={() => onQuantity(item.quantity - 1)}
            disabled={busy || item.quantity <= 1}
            aria-label={`Diminuer la quantité de ${item.productName ?? "l'article"}`}
          >
            −
          </button>
          <span
            className={styles.qtyValue}
            aria-label={`Quantité : ${item.quantity}`}
            role="status"
          >
            {item.quantity}
          </span>
          <button
            type="button"
            className={styles.step}
            onClick={() => onQuantity(item.quantity + 1)}
            disabled={busy || item.quantity >= item.stock}
            aria-label={`Augmenter la quantité de ${item.productName ?? "l'article"}`}
          >
            +
          </button>
        </div>

        <button type="button" className={styles.remove} onClick={onRemove} disabled={busy}>
          Retirer
        </button>
      </div>
    </div>
  );
};

export const CartPage = () => {
  const { cart, isLoading, setQuantity, remove, clear } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toute écriture renvoie le panier complet : il suffit d'attendre et de
  // rapporter l'échec éventuel.
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "L'opération a échoué. Réessayez."
      );
    } finally {
      setBusy(false);
    }
  };

  if (isLoading && cart.items.length === 0) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={CRUMBS} eyebrow="Commande" title="Votre panier" />
        <CatalogSkeletons count={3} />
      </CatalogPage>
    );
  }

  if (cart.items.length === 0) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={CRUMBS} eyebrow="Commande" title="Votre panier" />
        <EmptyState
          title="Votre panier est vide"
          text="Parcourez le catalogue et ajoutez les matériaux dont vous avez besoin."
          action={{ to: "/categories", label: "Parcourir le catalogue" }}
        />
      </CatalogPage>
    );
  }

  const bloquant = hasBlockingIssue(cart);

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={CRUMBS}
        eyebrow="Commande"
        title="Votre panier"
        count={cart.totalItems}
        countLabel="articles"
      />

      {error ? (
        <div className={styles.feedback}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div>
          <div className={styles.lines}>
            {cart.items.map((item) => (
              <Line
                key={item.productBoutiqueId}
                item={item}
                busy={busy}
                onQuantity={(quantity) =>
                  void run(() => setQuantity(item.productBoutiqueId, quantity))
                }
                onRemove={() => void run(() => remove(item.productBoutiqueId))}
              />
            ))}
          </div>

          <div className={styles.footer}>
            <Link to="/categories">
              <Button variant="ghost">← Continuer mes achats</Button>
            </Link>
            <Button variant="ghost" onClick={() => void run(clear)} disabled={busy}>
              Vider le panier
            </Button>
          </div>
        </div>

        <aside className={styles.summary}>
          <h2 className={styles.summaryTitle}>Récapitulatif</h2>

          <div className={styles.row}>
            <span>Articles</span>
            <span>{cart.totalItems}</span>
          </div>
          <div className={styles.row}>
            <span>Références</span>
            <span>{cart.items.length}</span>
          </div>

          <div className={styles.total}>
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.totalValue}>{formatPrice(cart.totalAmount)}</span>
          </div>

          {bloquant ? (
            <div className={styles.actions}>
              <Alert tone="warning">
                Certains articles dépassent le stock disponible. Ajustez les
                quantités avant de commander.
              </Alert>
            </div>
          ) : null}

          <div className={styles.actions}>
            {/* La commande n'existe pas encore côté front : plutôt qu'un
                bouton qui ne ferait rien, on l'annonce. */}
            <Button fullWidth disabled>
              Passer commande
            </Button>
          </div>

          <p className={styles.note}>
            Le tunnel de commande n'est pas encore branché. Les frais de
            livraison seront calculés à l'étape suivante.
          </p>
        </aside>
      </div>
    </CatalogPage>
  );
};
