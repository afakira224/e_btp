import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Address } from "../../../entities/address";
import { hasBlockingIssue } from "../../../entities/cart";
import { DeliveryMode, formatFee } from "../../../entities/delivery";
import { PAYMENT_METHOD_LABELS, PaymentMethod } from "../../../entities/order";
import { formatPrice } from "../../../entities/product";
import { ApiError } from "../../../shared/api";
import { useDocumentTitle } from "../../../shared/hooks/useDocumentTitle";
import { Alert, Button, Choices, Input } from "../../../shared/ui";
import type { OrderDetailState } from "../../account";
import { paymentDestination } from "../../orders";
import { useAuth } from "../../auth";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
  useResource,
} from "../../catalog";
import { AddressChoice } from "../components/AddressChoice";
import { DeliveryChoices } from "../components/DeliveryChoices";
import { fetchCheckoutAddresses, placeOrder } from "../shared/api/cart.api";
import { useCart } from "../shared/hooks/useCart";
import { useDeliveryQuote } from "../shared/hooks/useDeliveryQuote";
import styles from "./CheckoutPage.module.css";

const CRUMBS = [
  { label: "Accueil", to: "/" },
  { label: "Panier", to: "/panier" },
  { label: "Commande" },
];

/** Mêmes bornes que createOrderForm côté back : 9 à 12 caractères. */
const validPhone = (value: string) => {
  const phone = value.trim();
  return phone.length === 0 || (phone.length >= 9 && phone.length <= 12);
};

// ─────────────────────────────────────────────
//  Commande — /commande
//  Quatre décisions, dans l'ordre : un mode de livraison par boutique, une
//  adresse si une boutique livre, le paiement, puis la confirmation. Les
//  frais et le total sont ceux du devis serveur ; à la validation, le serveur
//  recalcule tout dans sa transaction et refuse ce qui ne tient plus (stock,
//  mode retiré entre-temps). La commande fige alors livraisons et frais.
//  Payée en ligne, elle n'est transmise aux boutiques qu'une fois le paiement
//  confirmé : on part vers la page du prestataire.
// ─────────────────────────────────────────────
export const CheckoutPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { cart, isLoading: cartLoading, refresh, setDeliverySelection } = useCart();
  const delivery = useDeliveryQuote();
  const userId = user?._id ?? "";

  useDocumentTitle("Commande");

  const loadAddresses = useCallback(
    (signal: AbortSignal) => fetchCheckoutAddresses(userId, signal),
    [userId]
  );
  const book = useResource<Address[] | null>(loadAddresses, null, userId);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [telephone, setTelephone] = useState(user?.telephone ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.ON_DELIVERY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (cartLoading && cart.items.length === 0) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={CRUMBS} eyebrow="Commande" title="Finaliser la commande" />
        <CatalogSkeletons count={2} />
      </CatalogPage>
    );
  }

  if (cart.items.length === 0) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={CRUMBS} eyebrow="Commande" title="Finaliser la commande" />
        <EmptyState
          title="Votre panier est vide"
          text="Ajoutez des articles avant de passer commande."
          action={{ to: "/categories", label: "Parcourir le catalogue" }}
        />
      </CatalogPage>
    );
  }

  const quote = delivery.quote;
  const groups = quote?.groups ?? [];
  // Une seule livraison à domicile suffit à exiger une adresse — la règle du
  // back. Tant qu'une boutique n'a pas de mode, l'adresse peut encore servir.
  const homeDelivery = groups.some(
    (group) => group.selectedMethod !== null && group.selectedMethod !== DeliveryMode.PICKUP
  );
  const undecided = groups.some((group) => group.selectedMethod === null);
  const pickupOnly = groups.length > 0 && !homeDelivery && !undecided;

  const addresses = book.data ?? [];
  const fallback = addresses.find((address) => address.isDefault) ?? addresses[0];
  const selectedId = addressId ?? fallback?.id ?? null;

  const blocked = hasBlockingIssue(cart);
  const quoteCurrent = quote !== null && quote.subtotal === cart.totalAmount && !delivery.isLoading;
  const phoneOk = validPhone(telephone);
  const canSubmit =
    quoteCurrent &&
    quote.ready &&
    !blocked &&
    (!homeDelivery || selectedId !== null) &&
    (!pickupOnly || phoneOk) &&
    !submitting;

  const confirm = async () => {
    if (!quote || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await placeOrder(userId, {
        // Le mode de chaque boutique, y compris celui retenu d'office.
        deliveries: Object.fromEntries(
          quote.groups.flatMap((group) =>
            group.selectedMethod ? [[group.boutiqueId, group.selectedMethod]] : []
          )
        ),
        addressId: homeDelivery ? (selectedId ?? undefined) : undefined,
        telephone: pickupOnly && telephone.trim() ? telephone.trim() : undefined,
        paymentMethod,
      });
      // La page part avant que le panier, vidé par le serveur, ne soit relu :
      // sinon elle afficherait un instant « panier vide ».
      if (order.payment?.redirectUrl) {
        const destination = paymentDestination(order.payment.redirectUrl);
        if ("external" in destination) {
          window.location.assign(destination.external);
          return;
        }
        navigate(destination.internal);
      } else {
        navigate(`/compte/commandes/${encodeURIComponent(order.id)}`, {
          state: {
            feedback: `Commande ${order.reference} enregistrée et transmise aux boutiques. Vous pouvez suivre chaque livraison ici.`,
          } satisfies OrderDetailState,
        });
      }
      setDeliverySelection({});
      void refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "La commande a échoué. Réessayez.");
      setSubmitting(false);
      // Un mode retiré, un stock épuisé : le devis et le panier sont relus
      // pour montrer ce qui a changé.
      delivery.reload();
      void refresh();
    }
  };

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={CRUMBS}
        eyebrow="Commande"
        title="Finaliser la commande"
        count={cart.totalItems}
        countLabel="articles"
      />

      {error ? (
        <div className={styles.feedback}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.steps}>
          <section className={styles.step} aria-labelledby="checkout-delivery">
            <h2 id="checkout-delivery" className={styles.stepTitle}>
              <span className={styles.stepIndex} aria-hidden="true">01</span>
              Livraison
            </h2>
            <p className={styles.stepText}>
              Une livraison par boutique : ses articles partent ensemble, les frais ne
              s'additionnent pas article par article.
            </p>
            {delivery.error ? (
              <Alert tone="danger">{delivery.error}</Alert>
            ) : quote ? (
              <DeliveryChoices
                quote={quote}
                selection={delivery.selection}
                onChoose={delivery.choose}
                disabled={submitting || delivery.isLoading}
              />
            ) : (
              <p className={styles.stepText}>Calcul des modes de livraison…</p>
            )}
          </section>

          <section className={styles.step} aria-labelledby="checkout-address">
            <h2 id="checkout-address" className={styles.stepTitle}>
              <span className={styles.stepIndex} aria-hidden="true">02</span>
              {pickupOnly ? "Retrait en boutique" : "Adresse de livraison"}
            </h2>

            {pickupOnly ? (
              <>
                <p className={styles.stepText}>
                  Aucune adresse à fournir : tout est à retirer en boutique.
                </p>
                <ul className={styles.pickups}>
                  {groups.map((group) => (
                    <li key={group.boutiqueId}>
                      <strong>{group.boutiqueNom ?? "Boutique"}</strong>
                      {group.pickupAdresse ? ` — ${group.pickupAdresse}` : ""}
                    </li>
                  ))}
                </ul>
                <div className={styles.phone}>
                  <Input
                    label="Téléphone de contact"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    optional
                    value={telephone}
                    disabled={submitting}
                    error={phoneOk ? undefined : "Entre 9 et 12 caractères."}
                    hint="La boutique vous appellera quand la commande sera prête."
                    onChange={(event) => setTelephone(event.target.value)}
                  />
                </div>
              </>
            ) : book.error ? (
              <Alert tone="danger">{book.error}</Alert>
            ) : book.isLoading ? (
              <p className={styles.stepText}>Chargement de vos adresses…</p>
            ) : (
              <>
                <p className={styles.stepText}>
                  {homeDelivery
                    ? "Les boutiques qui livrent apporteront la commande à cette adresse."
                    : "Requise dès qu'une boutique livre ; inutile si tout est retiré en boutique."}
                </p>
                <AddressChoice
                  addresses={addresses}
                  selectedId={selectedId}
                  onSelect={setAddressId}
                  disabled={submitting}
                />
              </>
            )}
          </section>

          <section className={styles.step} aria-labelledby="checkout-payment">
            <h2 id="checkout-payment" className={styles.stepTitle}>
              <span className={styles.stepIndex} aria-hidden="true">03</span>
              Paiement
            </h2>
            <Choices
              legend="Mode de paiement"
              options={[
                {
                  value: PaymentMethod.ON_DELIVERY,
                  label: PAYMENT_METHOD_LABELS.on_delivery,
                  hint: "Vous réglez chaque boutique à la remise de sa commande, sur présentation de votre code de remise.",
                },
                {
                  value: PaymentMethod.ONLINE,
                  label: PAYMENT_METHOD_LABELS.online,
                  hint: "Réglez tout maintenant, en une fois. Les boutiques reçoivent la commande dès le paiement confirmé ; vous avez 30 minutes pour payer.",
                },
              ]}
              value={paymentMethod}
              onChange={(value) => setPaymentMethod(value as PaymentMethod)}
              disabled={submitting}
            />
            <p className={styles.stepText}>
              Une boutique qui refuse ou ne confirme pas sa part sous 48 heures ne la livre pas : payée en ligne, elle
              vous est remboursée.
            </p>
          </section>
        </div>

        <aside className={styles.summary} aria-labelledby="checkout-summary">
          <h2 id="checkout-summary" className={styles.summaryTitle}>
            Récapitulatif
          </h2>

          <ul className={styles.lines}>
            {cart.items.map((item) => (
              <li key={item.productBoutiqueId} className={styles.line}>
                <span className={styles.lineName}>
                  {item.productName ?? "Article"} <span className={styles.qty}>× {item.quantity}</span>
                </span>
                <span className={styles.lineTotal}>{formatPrice(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <div className={styles.row}>
            <span>Sous-total</span>
            <span>{formatPrice(cart.totalAmount)}</span>
          </div>
          {quoteCurrent
            ? quote.groups.map((group) => (
                <div key={group.boutiqueId} className={styles.row}>
                  <span>Livraison · {group.boutiqueNom ?? "Boutique"}</span>
                  <span>{group.fee !== null ? formatFee(group.fee) : "—"}</span>
                </div>
              ))
            : null}

          <div className={styles.total}>
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.totalValue}>
              {formatPrice(quoteCurrent && quote.ready ? quote.total : cart.totalAmount)}
            </span>
          </div>

          {blocked ? (
            <div className={styles.notice}>
              <Alert tone="warning">
                Certains articles dépassent le stock disponible.{" "}
                <Link to="/panier">Ajustez les quantités</Link> avant de commander.
              </Alert>
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button fullWidth onClick={() => void confirm()} disabled={!canSubmit} isLoading={submitting}>
              {paymentMethod === PaymentMethod.ONLINE ? "Commander et payer" : "Confirmer la commande"}
            </Button>
          </div>

          <p className={styles.note}>
            {!quoteCurrent || !quote.ready
              ? "Choisissez un mode de livraison pour chaque boutique."
              : homeDelivery && selectedId === null
                ? "Ajoutez une adresse de livraison pour continuer."
                : "Frais et total sont recalculés par le serveur à la validation."}
          </p>
        </aside>
      </div>
    </CatalogPage>
  );
};
