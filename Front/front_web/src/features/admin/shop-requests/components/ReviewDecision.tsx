import { useState } from "react";
import { Link } from "react-router-dom";
import { ShopRequestStatus, type ShopRequest } from "../../../../entities/shop-request";
import { Alert, Button, TextArea } from "../../../../shared/ui";
import { formatDate } from "../../../account";
import { approveShopRequest, rejectShopRequest } from "../../shared";
import styles from "./ReviewDecision.module.css";

const REASON_MIN = 10;
const REASON_MAX = 500;

type Mode = "idle" | "approve" | "reject";

interface ReviewDecisionProps {
  request: ShopRequest;
  onReviewed: (request: ShopRequest) => void;
}

// ─────────────────────────────────────────────
//  Décision sur une demande en attente.
//  Les deux issues se confirment sur place : approuver ouvre une boutique et
//  change le type d'un compte, refuser envoie un motif au demandeur — ni
//  l'une ni l'autre ne doit partir sur un clic égaré. Une demande déjà
//  traitée affiche son issue, sans action.
// ─────────────────────────────────────────────
export const ReviewDecision = ({ request, onReviewed }: ReviewDecisionProps) => {
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [reasonTouched, setReasonTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (request.status === ShopRequestStatus.APPROVED) {
    return (
      <div className={styles.stack}>
        <Alert tone="success">
          Boutique ouverte{request.reviewedAt ? ` le ${formatDate(request.reviewedAt)}` : ""}. Le
          demandeur gère désormais sa boutique depuis son espace vendeur.
        </Alert>
        {request.shopId ? (
          <Link className={styles.link} to={`/boutiques/${encodeURIComponent(request.shopId)}`}>
            Voir la boutique →
          </Link>
        ) : null}
      </div>
    );
  }

  if (request.status === ShopRequestStatus.REJECTED) {
    return (
      <Alert tone="warning">
        <p>Demande refusée{request.reviewedAt ? ` le ${formatDate(request.reviewedAt)}` : ""}.</p>
        {request.rejectionReason ? <p className={styles.reason}>{request.rejectionReason}</p> : null}
      </Alert>
    );
  }

  if (request.status === ShopRequestStatus.CANCELLED) {
    return <Alert tone="info">Le demandeur a retiré sa demande avant examen.</Alert>;
  }

  const trimmed = reason.trim();
  const reasonError =
    trimmed.length < REASON_MIN
      ? `Expliquez le refus en ${REASON_MIN} caractères au moins : le demandeur le lira.`
      : undefined;

  const run = async (action: () => Promise<ShopRequest>) => {
    setBusy(true);
    setError(null);
    try {
      onReviewed(await action());
    } catch (caught) {
      // 409 : une boutique porte déjà ce nom ; 400 : la demande a été traitée entre-temps.
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applicant = request.applicant ? `${request.applicant.prenom} ${request.applicant.nom}` : "le demandeur";

  return (
    <div className={styles.stack}>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {mode === "idle" ? (
        <div className={styles.actions}>
          <Button onClick={() => setMode("approve")}>Approuver</Button>
          <Button variant="secondary" onClick={() => setMode("reject")}>
            Refuser
          </Button>
        </div>
      ) : null}

      {mode === "approve" ? (
        <div className={styles.confirm} role="group" aria-label="Confirmer l'approbation">
          <p className={styles.question}>
            La boutique <strong>{request.nom}</strong> sera ouverte et le compte de {applicant} deviendra
            gérant. Un email l'en informera.
          </p>
          <div className={styles.actions}>
            <Button isLoading={busy} onClick={() => void run(() => approveShopRequest(request.id))}>
              Confirmer l'ouverture
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setMode("idle")}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "reject" ? (
        <form
          className={styles.confirm}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setReasonTouched(true);
            if (reasonError) return;
            void run(() => rejectShopRequest(request.id, trimmed));
          }}
        >
          <TextArea
            label="Motif du refus"
            rows={4}
            maxLength={REASON_MAX}
            placeholder="Ce qui manque ou pose problème, et ce que le demandeur peut corriger."
            hint="Envoyé au demandeur par email et affiché dans son profil."
            value={reason}
            error={reasonTouched ? reasonError : undefined}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setReasonTouched(true)}
            autoFocus
          />
          <div className={styles.actions}>
            <Button type="submit" isLoading={busy}>
              Refuser la demande
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode("idle")}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
};
