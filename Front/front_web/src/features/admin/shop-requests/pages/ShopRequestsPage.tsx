import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  SHOP_REQUEST_STATUSES,
  ShopRequestStatus,
} from "../../../../entities/shop-request";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPage, formatDate } from "../../../account";
import { useResource } from "../../../catalog";
import { ShopRequestStatusBadge } from "../../../shop-request";
import { AdminHeader, AdminNav, adminPaths, fetchShopRequests, type ShopRequestPage } from "../../shared";
import styles from "./ShopRequestsPage.module.css";

const PAGE_SIZE = 10;

/** Un filtre désigne un ensemble de demandes : au pluriel, contrairement au badge. */
const FILTER_LABELS: Record<ShopRequestStatus, string> = {
  pending: "À examiner",
  approved: "Approuvées",
  rejected: "Refusées",
  cancelled: "Annulées",
};

const isStatus = (value: string | null): value is ShopRequestStatus =>
  value !== null && (SHOP_REQUEST_STATUSES as readonly string[]).includes(value);

// ─────────────────────────────────────────────
//  Demandes de boutique — /admin/demandes-boutique?statut=&q=&page=
//  Par défaut, la file d'attente : les demandes à examiner, les plus
//  anciennes d'abord (ordre du back). Statut, recherche et page vivent
//  dans l'URL : un lien partagé montre la même liste.
// ─────────────────────────────────────────────
export const ShopRequestsPage = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("statut");
  const status: ShopRequestStatus = isStatus(raw) ? raw : ShopRequestStatus.PENDING;
  const search = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const [draft, setDraft] = useState(search);

  useDocumentTitle("Demandes de boutique");

  const load = useCallback(
    (signal: AbortSignal) => fetchShopRequests({ status, search, page, limit: PAGE_SIZE }, signal),
    [page, search, status]
  );
  const list = useResource<ShopRequestPage | null>(load, null, `${status}:${search}:${page}`);

  const hrefFor = (next: { statut?: ShopRequestStatus; page?: number }) => {
    const query = new URLSearchParams();
    query.set("statut", next.statut ?? status);
    if (search) query.set("q", search);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    return `?${query.toString()}`;
  };

  const data = list.data;

  return (
    <AccountPage>
      <AdminHeader
        title="Demandes de boutique"
        lede="Les clients qui souhaitent vendre sur la plateforme. Approuver une demande ouvre la boutique et donne au demandeur l'accès à son espace vendeur."
        trail={[{ label: "Demandes de boutique" }]}
      />
      <AdminNav />

      <div className={styles.toolbar}>
        <nav className={styles.filters} aria-label="Filtrer par statut">
          {SHOP_REQUEST_STATUSES.map((filter) => {
            const active = filter === status;
            return (
              <Link
                key={filter}
                to={hrefFor({ statut: filter })}
                className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {FILTER_LABELS[filter]}
                {data ? <span className={styles.chipCount}>{data.counts[filter]}</span> : null}
              </Link>
            );
          })}
        </nav>

        <form
          className={styles.search}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const query = new URLSearchParams({ statut: status });
            if (draft.trim()) query.set("q", draft.trim());
            setParams(query);
          }}
        >
          <Input
            label="Rechercher une boutique"
            type="search"
            placeholder="Nom de la boutique"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            Rechercher
          </Button>
        </form>
      </div>

      {list.error ? (
        <Alert tone="danger">{list.error}</Alert>
      ) : list.isLoading && !data ? (
        <div className={styles.list} aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {search
              ? `Aucune demande « ${FILTER_LABELS[status].toLowerCase()} » pour « ${search} »`
              : status === ShopRequestStatus.PENDING
                ? "Aucune demande à examiner"
                : `Aucune demande « ${FILTER_LABELS[status].toLowerCase()} »`}
          </p>
          <p className={styles.emptyText}>
            {status === ShopRequestStatus.PENDING && !search
              ? "Les nouvelles demandes apparaîtront ici dès leur dépôt."
              : "Essayez un autre filtre ou une autre recherche."}
          </p>
        </div>
      ) : (
        <>
          <ul className={[styles.list, list.isLoading ? styles.stale : ""].filter(Boolean).join(" ")}>
            {data.items.map((request) => (
              <li key={request.id}>
                <Link className={styles.card} to={adminPaths.shopRequest(request.id)}>
                  <span className={styles.cardHead}>
                    <span className={styles.name}>{request.nom}</span>
                    <ShopRequestStatusBadge status={request.status} />
                  </span>
                  <span className={styles.applicant}>
                    {request.applicant
                      ? `${request.applicant.prenom} ${request.applicant.nom} · ${request.applicant.email}`
                      : "Demandeur inconnu"}
                  </span>
                  <span className={styles.meta}>
                    {request.familles.map((famille) => famille.nom ?? famille.id).join(", ")}
                    {" · "}
                    {request.adresse}
                  </span>
                  <span className={styles.foot}>
                    <span className={styles.date}>
                      Déposée le {formatDate(request.createdAt)}
                      {request.reviewedAt ? ` · examinée le ${formatDate(request.reviewedAt)}` : ""}
                    </span>
                    <span className={styles.open} aria-hidden="true">
                      {request.status === ShopRequestStatus.PENDING ? "Examiner →" : "Voir →"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {data.totalPages > 1 ? (
            <nav className={styles.pager} aria-label="Pages">
              {page > 1 ? (
                <Link className={styles.pageLink} to={hrefFor({ page: page - 1 })}>
                  ← Précédentes
                </Link>
              ) : (
                <span />
              )}
              <span className={styles.pageInfo}>
                Page {data.page} sur {data.totalPages}
              </span>
              {page < data.totalPages ? (
                <Link className={styles.pageLink} to={hrefFor({ page: page + 1 })}>
                  Suivantes →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </AccountPage>
  );
};
