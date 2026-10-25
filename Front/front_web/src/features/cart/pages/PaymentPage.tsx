import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { OrderPaymentStatus, OrderStatus, type Order } from "../../../entities/order";
import { formatPrice } from "../../../entities/product";
import { useDocumentTitle } from "../../../shared/hooks/useDocumentTitle";
import { Alert, Button } from "../../../shared/ui";
import type { OrderDetailState } from "../../account";
import { CatalogHeader, CatalogPage, CatalogSkeletons, useResource } from "../../catalog";
import { fetchOrder, formatDeadline, settleSandboxPayment, timeLeft, useNow } from "../../orders";
import { useCart } from "../shared/hooks/useCart";
import styles from "./PaymentPage.module.css";

const CRUMBS = [
  { label: "Accueil", to: "/" },
  { label: "Mes commandes", to: "/compte/commandes" },
  { label: "Paiement" },
];

// ─────────────────────────────────────────────
//  Paiement en ligne — /paiement/:orderId
//
//  La page du prestataire de paiement simulé (« sandbox ») du back : aucun
//  argent ne circule, on choisit l'issue. Un vrai prestataire aurait sa
//  propre page et préviendrait le serveur par une notification signée ;
//  ici, les deux boutons jouent ce rôle. Sans paiement sous 30 minutes, la
//  commande échoue d'elle-même et le panier revient.
// ─────────────────────────────────────────────
export const PaymentPage = () => {
  const { orderId = "" } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { refresh } = useCart();
  const now = useNow();
  const [busy, setBusy] = useState<"paid" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((signal: AbortSignal) => fetchOrder(orderId, signal), [orderId]);
  const order = useResource<Order | null>(load, null, orderId);
  const data = order.data;

  useDocumentTitle("Paiement");

  if (order.error) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={CRUMBS} eyebrow="Paiement" title="Commande introuvable" />
        <Alert tone="danger">{order.error}</Alert>
      </CatalogPage>
    );
  }

  if (order.isLoading || !data) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={CRUMBS} eyebrow="Paiement" title="Paiement…" />
        <CatalogSkeletons count={1} />
      </CatalogPage>
    );
  }

  const detail = `/compte/commandes/${encodeURIComponent(data.id)}`;
  const awaiting = data.status === OrderStatus.AWAITING_PAYMENT && data.paymentStatus === OrderPaymentStatus.PENDING;
  const expiresAt = data.paymentExpiresAt;
  const expired = expiresAt !== null && new Date(expiresAt).getTime() <= now;

  const settle = async (outcome: "paid" | "failed") => {
    setBusy(outcome);
    setError(null);
    try {
      const { message } = await settleSandboxPayment(data.id, outcome);
      // Paiement refusé : les articles sont revenus dans le panier.
      if (outcome === "failed") void refresh();
      navigate(detail, {
        state: {
          feedback:
            outcome === "paid" ? "Paiement confirmé : chaque boutique a reçu sa part de la commande." : message,
        } satisfies OrderDetailState,
      });
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(null);
    }
  };

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={CRUMBS}
        eyebrow="Paiement sécurisé"
        title={`Payer ${formatPrice(data.amount)}`}
        lede={`Commande ${data.reference}`}
      />

      <div className={styles.layout}>
        <section className={styles.card} aria-labelledby="payment-title">
          <span className={styles.sandbox}>Prestataire de test</span>
          <h2 id="payment-title" className={styles.title}>
            Aucun argent n'est débité
          </h2>
          <p className={styles.text}>
            Le paiement en ligne passe ici par un prestataire simulé. Choisissez l'issue : un paiement accepté transmet
            la commande aux boutiques ; un refus l'annule, rend le stock et remet les articles dans votre panier.
          </p>

          {!awaiting ? (
            <Alert tone={data.paymentStatus === OrderPaymentStatus.PAID ? "success" : "warning"}>
              {data.paymentStatus === OrderPaymentStatus.PAID
                ? "Cette commande est déjà payée."
                : "Cette commande n'attend plus de paiement."}{" "}
              <Link to={detail}>Voir la commande</Link>
            </Alert>
          ) : expired ? (
            <Alert tone="warning">
              Le délai de paiement est dépassé : la commande va être annulée et votre panier restauré.{" "}
              <Link to={detail}>Voir la commande</Link>
            </Alert>
          ) : (
            <>
              {expiresAt ? (
                <p className={styles.deadline}>
                  À payer avant le {formatDeadline(expiresAt)} — {timeLeft(expiresAt, now)}.
                </p>
              ) : null}
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <div className={styles.buttons}>
                <Button onClick={() => void settle("paid")} isLoading={busy === "paid"} disabled={busy !== null}>
                  Payer {formatPrice(data.amount)}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void settle("failed")}
                  isLoading={busy === "failed"}
                  disabled={busy !== null}
                >
                  Simuler un refus
                </Button>
              </div>
            </>
          )}
        </section>

        <aside className={styles.summary} aria-labelledby="payment-summary">
          <h2 id="payment-summary" className={styles.summaryTitle}>
            {data.parts.length > 1 ? `${data.parts.length} boutiques` : "Récapitulatif"}
          </h2>
          <ul className={styles.parts}>
            {data.parts.map((part) => (
              <li key={part.id} className={styles.part}>
                <span>{part.boutique.nom ?? "Boutique"}</span>
                <span className={styles.amount}>{formatPrice(part.amount)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.total}>
            <span>Total</span>
            <span className={styles.amount}>{formatPrice(data.amount)}</span>
          </div>
        </aside>
      </div>
    </CatalogPage>
  );
};
