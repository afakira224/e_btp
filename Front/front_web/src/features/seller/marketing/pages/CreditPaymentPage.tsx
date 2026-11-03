import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatPrice } from "../../../../entities/product";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { Alert, Button } from "../../../../shared/ui";
import { CatalogHeader, CatalogPage, CatalogSkeletons, useResource } from "../../../catalog";
import { sellerPaths } from "../../shared";
import { fetchCreditPurchase, settleCreditPurchase } from "../api/marketing.api";

// ─────────────────────────────────────────────
//  Paiement d'une recharge de crédits — /paiement/credits-<boutique>-<recharge>
//  La page du prestataire simulé : aucun argent ne circule, on choisit
//  l'issue. Un paiement accepté ajoute les crédits au portefeuille.
// ─────────────────────────────────────────────
export const CreditPaymentPage = ({ shopId, purchaseId }: { shopId: string; purchaseId: string }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"paid" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = sellerPaths.boosts(shopId);
  const crumbs = [
    { label: "Mise en avant", to: back },
    { label: "Recharge de crédits" },
  ];

  const load = useCallback((signal: AbortSignal) => fetchCreditPurchase(shopId, purchaseId, signal), [shopId, purchaseId]);
  const purchase = useResource(load, null, purchaseId);
  useDocumentTitle("Recharge de crédits");

  const settle = async (outcome: "paid" | "failed") => {
    setBusy(outcome);
    setError(null);
    try {
      const message = await settleCreditPurchase(shopId, purchaseId, outcome);
      navigate(back, { state: { feedback: message } });
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(null);
    }
  };

  if (purchase.error) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={crumbs} eyebrow="Paiement" title="Recharge introuvable" />
        <Alert tone="danger">{purchase.error}</Alert>
      </CatalogPage>
    );
  }
  if (purchase.isLoading || !purchase.data) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={crumbs} eyebrow="Paiement" title="Paiement…" />
        <CatalogSkeletons count={1} />
      </CatalogPage>
    );
  }

  const { amount, status } = purchase.data;
  return (
    <CatalogPage>
      <CatalogHeader crumbs={crumbs} eyebrow="Paiement sécurisé" title={`Payer ${formatPrice(amount)}`} lede="Recharge des crédits de boost" />
      <div style={{ display: "grid", gap: "var(--space-4)", maxWidth: 560 }}>
        <p>
          Le paiement passe ici par un prestataire simulé : aucun argent n'est débité. Un paiement accepté ajoute {formatPrice(amount)} à vos crédits ; un refus
          n'ajoute rien.
        </p>
        {status !== "pending" ? (
          <Alert tone={status === "paid" ? "success" : "warning"}>
            {status === "paid" ? "Cette recharge est déjà payée." : "Ce paiement a été refusé."} <Link to={back}>Retour à la mise en avant</Link>
          </Alert>
        ) : (
          <>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <Button onClick={() => void settle("paid")} isLoading={busy === "paid"} disabled={busy !== null}>
                Payer {formatPrice(amount)}
              </Button>
              <Button variant="secondary" onClick={() => void settle("failed")} isLoading={busy === "failed"} disabled={busy !== null}>
                Simuler un refus
              </Button>
            </div>
          </>
        )}
      </div>
    </CatalogPage>
  );
};
