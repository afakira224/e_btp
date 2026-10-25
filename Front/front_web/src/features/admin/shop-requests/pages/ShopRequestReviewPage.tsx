import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ShopRequest } from "../../../../entities/shop-request";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPage, AccountPanel, formatDate } from "../../../account";
import { useResource } from "../../../catalog";
import { ShopRequestStatusBadge, ShopRequestSummary } from "../../../shop-request";
import { AdminHeader, adminPaths, fetchShopRequest } from "../../shared";
import { ReviewDecision } from "../components/ReviewDecision";
import styles from "./ShopRequestReviewPage.module.css";

// ─────────────────────────────────────────────
//  Examen d'une demande — /admin/demandes-boutique/:requestId
//  Les réponses du questionnaire d'un côté ; de l'autre, qui demande (pour
//  le recontacter) et la décision.
// ─────────────────────────────────────────────
export const ShopRequestReviewPage = () => {
  const { requestId = "" } = useParams<{ requestId: string }>();
  const load = useCallback((signal: AbortSignal) => fetchShopRequest(requestId, signal), [requestId]);
  const loaded = useResource<ShopRequest | null>(load, null, requestId);
  // La décision renvoie la demande à jour : elle remplace la lecture initiale.
  const [reviewed, setReviewed] = useState<ShopRequest | null>(null);
  const request = reviewed?.id === requestId ? reviewed : loaded.data;

  useDocumentTitle(request ? `Demande — ${request.nom}` : "Demande de boutique");

  const trail = (label: string) => [
    { label: "Demandes de boutique", to: adminPaths.shopRequests },
    { label },
  ];

  if (loaded.error) {
    return (
      <AccountPage>
        <AdminHeader title="Demande introuvable" trail={trail("Introuvable")} />
        <Alert tone="danger">{loaded.error}</Alert>
      </AccountPage>
    );
  }

  if (loaded.isLoading || !request) {
    return (
      <AccountPage>
        <AdminHeader title="Demande de boutique…" trail={trail("…")} />
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  const applicant = request.applicant;

  return (
    <AccountPage>
      <AdminHeader
        title={request.nom}
        lede={
          <span className={styles.lede}>
            <ShopRequestStatusBadge status={request.status} />
            Déposée le {formatDate(request.createdAt)}
          </span>
        }
        trail={trail(request.nom)}
      />

      <div className={styles.layout}>
        <AccountPanel title="Réponses du questionnaire">
          <ShopRequestSummary request={request} />
        </AccountPanel>

        <div className={styles.side}>
          <AccountPanel title="Décision">
            <ReviewDecision request={request} onReviewed={setReviewed} />
          </AccountPanel>

          <AccountPanel title="Demandeur" description="Pour le recontacter avant de décider.">
            {applicant ? (
              <dl className={styles.contact}>
                <div>
                  <dt>Nom</dt>
                  <dd>
                    {applicant.prenom} {applicant.nom}
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${applicant.email}`}>{applicant.email}</a>
                  </dd>
                </div>
                {applicant.telephone ? (
                  <div>
                    <dt>Téléphone</dt>
                    <dd>
                      <a href={`tel:${applicant.telephone}`}>{applicant.telephone}</a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className={styles.muted}>Le compte du demandeur n'existe plus.</p>
            )}
          </AccountPanel>

          <Link className={styles.back} to={adminPaths.shopRequests}>
            ← Toutes les demandes à examiner
          </Link>
        </div>
      </div>
    </AccountPage>
  );
};
