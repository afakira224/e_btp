import { useState } from "react";
import { Link } from "react-router-dom";
import { SANCTION_LABELS, type Sanction } from "../../../../entities/support";
import { Alert, Button } from "../../../../shared/ui";
import { liftSanction, requestSanctionLift } from "../api/support.api";
import { formatMoment } from "../utils/format";
import styles from "./SanctionList.module.css";

const STATE_LABELS: Record<Sanction["state"], string> = { active: "En cours", ended: "Terminée", lifted: "Levée" };

interface SanctionListProps {
  sanctions: Sanction[];
  /** « concerned » : la personne visée ; « admin » : l'équipe qui peut lever. */
  viewer: "concerned" | "admin";
  onChanged?: ((sanction: Sanction) => void) | undefined;
  /** Lien pour contester une mesure (personne visée). */
  appealPath?: ((sanction: Sanction) => string) | undefined;
  empty?: string | undefined;
}

/** Les mesures : leur motif, leur état, et ce qu'on peut en faire. */
export const SanctionList = ({ sanctions, viewer, onChanged, appealPath, empty = "Aucune mesure." }: SanctionListProps) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (sanctions.length === 0) return <p className={styles.empty}>{empty}</p>;

  const run = async (sanction: Sanction, work: () => Promise<Sanction>, done: string) => {
    setBusy(sanction.id);
    setError(null);
    try {
      const updated = await work();
      setFeedback(done);
      onChanged?.(updated);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.wrap}>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <ul className={styles.list}>
        {sanctions.map((sanction) => (
          <li key={sanction.id} className={[styles.item, styles[sanction.state]].join(" ")}>
            <div className={styles.head}>
              <span className={styles.type}>
                {SANCTION_LABELS[sanction.type]}
                {sanction.provisional ? " provisoire" : ""}
              </span>
              <span className={styles.state}>{STATE_LABELS[sanction.state]}</span>
            </div>
            <p className={styles.target}>{sanction.target.label}</p>
            <p className={styles.reason}>{sanction.reason}</p>
            <p className={styles.dates}>
              Le {formatMoment(sanction.startsAt)}
              {sanction.endsAt && sanction.endsAt < "9999" ? ` · jusqu'au ${formatMoment(sanction.endsAt)}` : ""}
              {sanction.liftedAt ? ` · levée le ${formatMoment(sanction.liftedAt)}` : ""}
              {sanction.liftRequestedAt && !sanction.liftedAt ? " · remise en ligne demandée" : ""}
            </p>
            {sanction.state === "active" ? (
              <div className={styles.actions}>
                {viewer === "admin" ? (
                  <Button variant="secondary" isLoading={busy === sanction.id} onClick={() => void run(sanction, () => liftSanction(sanction.id), "Mesure levée.")}>
                    {sanction.liftRequestedAt ? "Remettre en ligne" : "Lever la mesure"}
                  </Button>
                ) : (
                  <>
                    {sanction.type === "hide" && sanction.target.kind === "offer" && !sanction.liftRequestedAt ? (
                      <Button
                        variant="secondary"
                        isLoading={busy === sanction.id}
                        onClick={() => void run(sanction, () => requestSanctionLift(sanction.id), "Demande transmise : l'équipe vérifie l'annonce corrigée.")}
                      >
                        J'ai corrigé : remettre en ligne
                      </Button>
                    ) : null}
                    {appealPath ? (
                      <Link className={styles.link} to={appealPath(sanction)}>
                        Contester
                      </Link>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
};
