import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  deliveryMethodLabel,
  SHOP_ORDER_GROUP_KEYS,
  SHOP_ORDER_GROUP_LABELS,
  ShopOrderStatus,
  type ShopOrder,
  type ShopOrderGroup,
} from "../../../../entities/order";
import { formatPrice } from "../../../../entities/product";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useResource } from "../../../catalog";
import { fetchShopOrders, type ShopOrderPage } from "../api/orders.api";
import { useNow } from "../hooks/useNow";
import { formatDeadline, formatStep, timeLeft } from "../utils/format";
import { ShopOrderStatusBadge } from "./ShopOrderStatusBadge";
import styles from "./ShopOrderBoard.module.css";

const PAGE_SIZE = 20;

/** Ce que l'échéance d'un statut déclenche, dit en deux mots. */
const DEADLINE_LABELS: Partial<Record<ShopOrderStatus, string>> = {
  pending: "Expire",
  ready_for_pickup: "Retrait avant",
  delivered: "Retours jusqu'au",
  return_requested: "Réponse avant",
};

/** Ce qui ne peut pas attendre : une échéance à moins de 12 heures. */
const URGENT_MS = 12 * 60 * 60 * 1000;

const EMPTY_TEXTS: Record<ShopOrderGroup, string> = {
  todo: "Aucune commande à confirmer. Les nouvelles commandes arrivent ici.",
  preparing: "Aucune commande en préparation.",
  delivering: "Aucune commande en livraison ou en attente de retrait.",
  delivered: "Aucune commande livrée dans sa période de retour.",
  issues: "Aucun problème en cours : ni échec de livraison, ni retour, ni litige.",
  done: "Aucune commande terminée pour l'instant.",
};

const isGroup = (value: string | null): value is ShopOrderGroup =>
  value !== null && (SHOP_ORDER_GROUP_KEYS as string[]).includes(value);

interface ShopOrderBoardProps {
  /** Boutique dont on lit les commandes ; absente : toutes (administration). */
  boutiqueId?: string | undefined;
  /** Onglet ouvert par défaut. */
  defaultGroup: ShopOrderGroup;
  detailPath: (part: ShopOrder) => string;
  /** Afficher la boutique de chaque commande (vue d'ensemble de l'administration). */
  showShop?: boolean;
}

// ─────────────────────────────────────────────
//  Tableau des commandes d'une boutique, ou de toutes pour l'administration.
//  Un onglet par étape — à confirmer, en préparation, en livraison, livrées,
//  problèmes, terminées — avec son compte : on voit d'un coup d'œil ce qui
//  attend. « À confirmer » se lit comme une file, la plus ancienne d'abord.
//  Onglet, recherche et page vivent dans l'URL.
// ─────────────────────────────────────────────
export const ShopOrderBoard = ({ boutiqueId, defaultGroup, detailPath, showShop = false }: ShopOrderBoardProps) => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("onglet");
  const group: ShopOrderGroup = isGroup(raw) ? raw : defaultGroup;
  const search = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const [draft, setDraft] = useState(search);

  const load = useCallback(
    (signal: AbortSignal) => fetchShopOrders({ boutiqueId, group, search, page, limit: PAGE_SIZE }, signal),
    [boutiqueId, group, search, page]
  );
  const list = useResource<ShopOrderPage | null>(load, null, `${boutiqueId ?? "all"}:${group}:${search}:${page}`);
  const data = list.data;
  const now = useNow();

  const hrefFor = (next: { onglet?: ShopOrderGroup; page?: number }) => {
    const query = new URLSearchParams();
    query.set("onglet", next.onglet ?? group);
    if (search) query.set("q", search);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    return `?${query.toString()}`;
  };

  return (
    <div className={styles.board}>
      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label="Étapes des commandes">
          {SHOP_ORDER_GROUP_KEYS.map((key) => {
            const active = key === group;
            const count = data?.counts[key];
            // Ce qui attend une action est mis en avant même hors de l'onglet.
            const waiting = (key === "todo" || key === "issues") && count !== undefined && count > 0;
            return (
              <Link
                key={key}
                to={hrefFor({ onglet: key })}
                className={[styles.tab, active ? styles.tabActive : "", waiting && !active ? styles.tabWaiting : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {SHOP_ORDER_GROUP_LABELS[key]}
                {count !== undefined ? <span className={styles.count}>{count}</span> : null}
              </Link>
            );
          })}
        </nav>

        <form
          className={styles.search}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const query = new URLSearchParams({ onglet: group });
            if (draft.trim()) query.set("q", draft.trim());
            setParams(query);
          }}
        >
          <Input
            label="Rechercher une commande"
            type="search"
            placeholder="Référence, ex. CMD-123456"
            value={draft}
            maxLength={60}
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
            {search ? `Aucune commande « ${search} » dans cet onglet` : SHOP_ORDER_GROUP_LABELS[group]}
          </p>
          <p className={styles.emptyText}>{search ? "Essayez un autre onglet." : EMPTY_TEXTS[group]}</p>
        </div>
      ) : (
        <>
          <ul className={[styles.list, list.isLoading ? styles.stale : ""].filter(Boolean).join(" ")}>
            {data.items.map((part) => {
              const deadlineLabel = DEADLINE_LABELS[part.status];
              const urgent =
                part.deadlineAt !== null &&
                (part.status === ShopOrderStatus.PENDING || part.status === ShopOrderStatus.RETURN_REQUESTED) &&
                new Date(part.deadlineAt).getTime() - now < URGENT_MS;
              return (
                <li key={part.id}>
                  <Link className={styles.card} to={detailPath(part)}>
                    <span className={styles.cardHead}>
                      <span className={styles.reference}>{part.reference}</span>
                      <ShopOrderStatusBadge status={part.status} />
                    </span>
                    <span className={styles.customer}>
                      {part.customer ? `${part.customer.prenom} ${part.customer.nom}`.trim() : "Client"}
                      {showShop ? ` · ${part.boutique.nom ?? "Boutique"}` : ""}
                    </span>
                    <span className={styles.meta}>
                      {part.totalItems} article{part.totalItems > 1 ? "s" : ""} · {formatPrice(part.amount)} ·{" "}
                      {deliveryMethodLabel(part.delivery.method)}
                    </span>
                    <span className={styles.foot}>
                      <span className={styles.date}>Passée le {formatStep(part.createdAt)}</span>
                      {part.deadlineAt && deadlineLabel ? (
                        <span className={[styles.deadline, urgent ? styles.urgent : ""].filter(Boolean).join(" ")}>
                          {deadlineLabel} {formatDeadline(part.deadlineAt)} · {timeLeft(part.deadlineAt, now)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
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
    </div>
  );
};
