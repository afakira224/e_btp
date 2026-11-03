import { useState } from "react";
import type { Credits } from "../../../../entities/boost";
import { formatPrice } from "../../../../entities/product";
import { ApiError } from "../../../../shared/api";
import { Alert, Button, Input } from "../../../../shared/ui";
import { AccountPanel } from "../../../account";
import { paymentDestination } from "../../../orders";
import { rechargeCredits } from "../api/marketing.api";
import styles from "./Marketing.module.css";

const AMOUNTS = [50_000, 100_000, 250_000, 500_000];
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// ─────────────────────────────────────────────
//  Crédits de boost : le solde, les crédits offerts chaque mois, la
//  recharge par mobile money (prestataire de paiement) et l'historique.
//  Un budget non dépensé revient en crédits à la fin du boost.
// ─────────────────────────────────────────────
export const CreditsPanel = ({ shopId, credits, onNavigate }: { shopId: string; credits: Credits; onNavigate: (to: string) => void }) => {
  const [amount, setAmount] = useState(String(AMOUNTS[1]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLedger, setShowLedger] = useState(false);

  const recharge = async () => {
    setBusy(true);
    setError(null);
    try {
      const { redirectUrl } = await rechargeCredits(shopId, Number(amount));
      const destination = paymentDestination(redirectUrl);
      if ("external" in destination) window.location.assign(destination.external);
      else onNavigate(destination.internal);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "La recharge n'a pas été lancée.");
      setBusy(false);
    }
  };

  return (
    <AccountPanel
      title="Crédits de boost"
      description={`${formatPrice(credits.settings.monthlyCredits)} offerts chaque mois. Un boost coûte ${formatPrice(credits.settings.costPerVisit)} la visite, ou ${formatPrice(credits.settings.costPerThousandViews)} les 1 000 affichages.`}
    >
      <div className={styles.grid2}>
        <div className={styles.preview}>
          <span className={styles.eyebrow}>Solde</span>
          <span className={styles.big}>{formatPrice(credits.balance)}</span>
          <span className={styles.hint}>{`Budget minimum d'un boost : ${formatPrice(credits.settings.minDailyBudget)} par jour.`}</span>
        </div>
        <div className={styles.form}>
          <div className={styles.chipRow}>
            {AMOUNTS.map((value) => (
              <button key={value} type="button" className={String(value) === amount ? styles.chipOn : styles.chip} onClick={() => setAmount(String(value))}>
                {formatPrice(value)}
              </button>
            ))}
          </div>
          <Input label="Montant à recharger (GNF)" type="number" min={1000} value={amount} onChange={(event) => setAmount(event.target.value)} />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button onClick={() => void recharge()} isLoading={busy} disabled={!(Number(amount) >= 1000)}>
            Recharger
          </Button>
        </div>
      </div>
      {credits.ledger.length > 0 ? (
        <>
          <Button variant="ghost" onClick={() => setShowLedger((value) => !value)}>
            {showLedger ? "Masquer l'historique" : "Voir l'historique"}
          </Button>
          {showLedger ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Mouvement</th>
                    <th scope="col">Montant</th>
                    <th scope="col">Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.ledger.map((entry) => (
                    <tr key={entry.id}>
                      <td>{dateFormat.format(new Date(entry.createdAt))}</td>
                      <td>{entry.label}</td>
                      <td className={entry.delta >= 0 ? styles.positive : styles.negative}>{`${entry.delta >= 0 ? "+" : "−"}${formatPrice(Math.abs(entry.delta))}`}</td>
                      <td>{formatPrice(entry.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </AccountPanel>
  );
};
