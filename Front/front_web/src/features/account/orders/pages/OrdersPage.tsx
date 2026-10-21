import { Link, useSearchParams } from "react-router-dom";
import { OrderStatus, ORDER_STATUS_LABELS } from "../../../../entities/order";
import { Alert, Button } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { useAuth } from "../../../auth";
import { AccountHeader, AccountPage, OrderCard } from "../../shared";
import { PAGE_SIZE, useOrderList } from "../hooks/useOrderList";
import styles from "./OrdersPage.module.css";

const STATUS_PARAM = "statut";

/** Filtres proposés, dans l'ordre de vie d'une commande. */
const FILTERS: readonly (OrderStatus | undefined)[] = [
  undefined,
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

/** Un filtre désigne un ensemble de commandes : au pluriel, contrairement au badge. */
const FILTER_LABELS: Record<OrderStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmées",
  shipped: "Expédiées",
  delivered: "Livrées",
  cancelled: "Annulées",
};

const isStatus = (value: string | null): value is OrderStatus =>
  value !== null && Object.values(OrderStatus).includes(value as OrderStatus);

// ─────────────────────────────────────────────
//  Mes commandes — /compte/commandes?statut=…
//  Le filtre vit dans l'URL : de vrais liens, partageables, et le bouton
//  Précédent revient au filtre d'avant.
// ─────────────────────────────────────────────
export const OrdersPage = () => {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const raw = params.get(STATUS_PARAM);
  const status = isStatus(raw) ? raw : undefined;
  const list = useOrderList(user?._id ?? "", status);
  const { orders, isLoading, error, total, hasMore } = list;

  useDocumentTitle("Mes commandes");

  const firstLoad = isLoading && orders.length === 0;

  return (
    <AccountPage width="narrow">
      <AccountHeader
        title="Mes commandes"
        lede="Suivez l'avancement de vos commandes, de la confirmation par le dépôt jusqu'à la livraison."
        trail={[{ label: "Mes commandes" }]}
      />

      <nav className={styles.filters} aria-label="Filtrer par statut">
        {FILTERS.map((filter) => {
          const active = filter === status;
          return (
            <Link
              key={filter ?? "all"}
              to={filter ? `?${STATUS_PARAM}=${filter}` : "."}
              className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
              aria-current={active ? "page" : undefined}
            >
              {filter ? FILTER_LABELS[filter] : "Toutes"}
              {active && !firstLoad ? <span className={styles.chipCount}>{total}</span> : null}
            </Link>
          );
        })}
      </nav>

      {error && orders.length === 0 ? (
        <div className={styles.state}>
          <Alert tone="danger">{error}</Alert>
          <Button variant="secondary" onClick={list.retry}>
            Réessayer
          </Button>
        </div>
      ) : firstLoad ? (
        <div className={styles.list} aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {status
              ? `Aucune commande « ${ORDER_STATUS_LABELS[status].toLowerCase()} »`
              : "Vous n'avez pas encore passé de commande"}
          </p>
          <p className={styles.emptyText}>
            {status
              ? "Essayez un autre filtre pour retrouver vos commandes."
              : "Vos commandes apparaîtront ici dès votre premier achat."}
          </p>
          <Link className={styles.emptyLink} to={status ? "." : "/categories"}>
            {status ? "Voir toutes mes commandes" : "Parcourir le catalogue"} →
          </Link>
        </div>
      ) : (
        <>
          <div className={[styles.list, isLoading ? styles.stale : ""].filter(Boolean).join(" ")}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>

          <div className={styles.foot}>
            <span className={styles.counter} role="status" aria-live="polite">
              {orders.length} sur {total} commande{total > 1 ? "s" : ""}
            </span>
            {error ? (
              <>
                <Alert tone="danger">{error}</Alert>
                <Button variant="secondary" onClick={list.retry}>
                  Réessayer
                </Button>
              </>
            ) : hasMore ? (
              <Button variant="secondary" onClick={list.loadMore} isLoading={isLoading}>
                Voir {Math.min(PAGE_SIZE, total - orders.length)} commandes de plus
              </Button>
            ) : null}
          </div>
        </>
      )}
    </AccountPage>
  );
};
