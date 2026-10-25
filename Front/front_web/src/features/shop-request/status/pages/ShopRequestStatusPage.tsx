import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShopRequestStatus, type ShopRequest } from "../../../../entities/shop-request";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountHeader, AccountPage, AccountPanel, ConfirmAction, formatDate } from "../../../account";
import {
  cancelShopRequest,
  shopRequestPaths,
  ShopRequestStatusBadge,
  ShopRequestSummary,
  useMyShopRequests,
} from "../../shared";
import styles from "./ShopRequestStatusPage.module.css";

/** Ce que dit la page selon l'issue de la demande la plus récente. */
const Outcome = ({ request, onCancel }: { request: ShopRequest; onCancel: () => Promise<void> }) => {
  switch (request.status) {
    case ShopRequestStatus.PENDING:
      return (
        <div className={styles.outcome}>
          <Alert tone="info">
            Votre demande est en cours d'examen. Vous recevrez un email dès qu'elle aura été traitée ;
            l'équipe peut aussi vous contacter pour la compléter.
          </Alert>
          <ConfirmAction
            label="Annuler ma demande"
            question="Retirer cette demande ?"
            confirmLabel="Retirer"
            onConfirm={onCancel}
          />
        </div>
      );
    case ShopRequestStatus.APPROVED:
      return (
        <div className={styles.outcome}>
          <Alert tone="success">
            Votre boutique <strong>{request.nom}</strong> est ouverte
            {request.reviewedAt ? ` depuis le ${formatDate(request.reviewedAt)}` : ""}. Ajoutez vos
            produits et réglez vos modes de livraison.
          </Alert>
          <Link className={styles.primary} to={shopRequestPaths.seller}>
            Accéder à ma boutique →
          </Link>
        </div>
      );
    case ShopRequestStatus.REJECTED:
      return (
        <div className={styles.outcome}>
          <Alert tone="warning">
            <p>Votre demande n'a pas été retenue.</p>
            {request.rejectionReason ? <p className={styles.reason}>{request.rejectionReason}</p> : null}
          </Alert>
          <Link className={styles.primary} to={shopRequestPaths.apply}>
            Faire une nouvelle demande →
          </Link>
        </div>
      );
    default:
      return (
        <div className={styles.outcome}>
          <Alert tone="info">Vous avez retiré cette demande avant son examen.</Alert>
          <Link className={styles.primary} to={shopRequestPaths.apply}>
            Faire une nouvelle demande →
          </Link>
        </div>
      );
  }
};

// ─────────────────────────────────────────────
//  Ma demande de boutique — /compte/boutique
//  La demande la plus récente : son issue, ce que l'on peut faire ensuite,
//  les réponses déposées. Les demandes précédentes suivent, en historique.
// ─────────────────────────────────────────────
export const ShopRequestStatusPage = () => {
  const requests = useMyShopRequests();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const submitted = (location.state as { submitted?: boolean } | null)?.submitted === true;
  useDocumentTitle("Ma demande de boutique");

  const header = (
    <AccountHeader
      title="Ma demande de boutique"
      trail={[{ label: "Mon profil", to: "/compte/profil" }, { label: "Ma demande de boutique" }]}
    />
  );

  if (requests.error) {
    return (
      <AccountPage width="narrow">
        {header}
        <Alert tone="danger">{requests.error}</Alert>
      </AccountPage>
    );
  }

  if (requests.isLoading || !requests.data) {
    return (
      <AccountPage width="narrow">
        {header}
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  const [latest, ...history] = requests.data;
  // Rien à suivre : la page n'a de sens qu'avec une demande.
  if (!latest) return <Navigate to={shopRequestPaths.apply} replace />;

  const cancel = async () => {
    setError(null);
    try {
      await cancelShopRequest(latest.id);
      requests.reload();
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  return (
    <AccountPage width="narrow">
      {header}

      <div className={styles.stack}>
        {submitted && latest.status === ShopRequestStatus.PENDING ? (
          <Alert tone="success">Demande envoyée. Un email de confirmation vous a été adressé.</Alert>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <section className={styles.current} aria-labelledby="current-request">
          <div className={styles.headline}>
            <h2 id="current-request" className={styles.name}>
              {latest.nom}
            </h2>
            <ShopRequestStatusBadge status={latest.status} />
          </div>
          <p className={styles.dates}>
            Déposée le {formatDate(latest.createdAt)}
            {latest.reviewedAt ? ` · Examinée le ${formatDate(latest.reviewedAt)}` : ""}
          </p>
          <Outcome request={latest} onCancel={cancel} />
        </section>

        <AccountPanel title="Vos réponses" description="Telles que transmises à l'équipe.">
          <ShopRequestSummary request={latest} />
        </AccountPanel>

        {history.length > 0 ? (
          <AccountPanel title="Demandes précédentes">
            <ul className={styles.history}>
              {history.map((request) => (
                <li key={request.id} className={styles.past}>
                  <span className={styles.pastName}>{request.nom}</span>
                  <span className={styles.pastDate}>{formatDate(request.createdAt)}</span>
                  <ShopRequestStatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          </AccountPanel>
        ) : null}
      </div>
    </AccountPage>
  );
};
