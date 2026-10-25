import { useCallback } from "react";
import { Link } from "react-router-dom";
import type { ShopOrderGroup } from "../../../../entities/order";
import type { ProductBoutique } from "../../../../entities/product";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { Alert, Button } from "../../../../shared/ui";
import { AccountPanel } from "../../../account";
import { useAuth } from "../../../auth";
import { useResource } from "../../../catalog";
import { fetchShopOrders, useNow } from "../../../orders";
import { fetchShopOffers, sellerPaths, useSellerShop } from "../../shared";
import { OrderQueue } from "../components/OrderQueue";
import styles from "./SellerDashboardPage.module.css";

/** Un produit à 5 unités ou moins mérite un réassort. */
const LOW_STOCK = 5;
const QUEUE_SIZE = 5;

const STAGES: readonly { group: ShopOrderGroup; label: string; hint: string; watch?: boolean }[] = [
  { group: "todo", label: "À confirmer", hint: "48 h pour répondre", watch: true },
  { group: "preparing", label: "En préparation", hint: "À expédier ou mettre à disposition" },
  { group: "delivering", label: "En livraison", hint: "Remise contre le code du client" },
  { group: "issues", label: "Problèmes", hint: "Échecs, retours, litiges", watch: true },
];

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

// ─────────────────────────────────────────────
//  Tableau de bord — /ma-boutique/:boutiqueId
//  L'accueil de l'espace boutique : combien de commandes à chaque étape,
//  ce qui expire bientôt, et les produits qui vont manquer.
// ─────────────────────────────────────────────
export const SellerDashboardPage = () => {
  const { shop, orderCounts } = useSellerShop();
  const { user } = useAuth();
  const now = useNow();
  useDocumentTitle(`Tableau de bord — ${shop.nom}`);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const [todo, issues, offers] = await Promise.all([
        fetchShopOrders({ boutiqueId: shop.id, group: "todo", limit: QUEUE_SIZE }, signal),
        fetchShopOrders({ boutiqueId: shop.id, group: "issues", limit: QUEUE_SIZE }, signal),
        fetchShopOffers(shop.id, 1, 100, signal),
      ]);
      const lowStock: ProductBoutique[] = offers.items
        .filter((offer) => offer.stock <= LOW_STOCK)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, QUEUE_SIZE);
      return { todo, issues, lowStock };
    },
    [shop.id]
  );
  const data = useResource(load, null, shop.id);
  const counts = orderCounts ?? data.data?.todo.counts ?? null;
  const detail = (part: { id: string }) => sellerPaths.order(shop.id, part.id);

  return (
    <div className={styles.page}>
      <p className={styles.today}>
        Bonjour {user?.prenom ?? ""}, nous sommes {dayFormat.format(now)}.
      </p>

      <ul className={styles.stages}>
        {STAGES.map((stage) => {
          const value = counts?.[stage.group];
          const alert = stage.watch === true && value !== undefined && value > 0;
          return (
            <li key={stage.group}>
              <Link
                className={[styles.stage, alert ? styles.alert : ""].filter(Boolean).join(" ")}
                to={`${sellerPaths.orders(shop.id)}?onglet=${stage.group}`}
              >
                <span className={styles.stageValue}>{value ?? "—"}</span>
                <span className={styles.stageLabel}>{stage.label}</span>
                <span className={styles.stageHint}>{stage.hint}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {data.error ? <Alert tone="danger">{data.error}</Alert> : null}

      <div className={styles.grid}>
        <AccountPanel
          title="À confirmer"
          description="Les plus anciennes d'abord : sans réponse sous 48 heures, une commande expire."
          more={{ to: `${sellerPaths.orders(shop.id)}?onglet=todo`, label: "Toutes" }}
        >
          {data.data ? (
            <OrderQueue
              orders={data.data.todo.items}
              now={now}
              detailPath={detail}
              empty="Aucune commande à confirmer. Les nouvelles commandes arrivent ici."
            />
          ) : (
            <div className={styles.skeleton} aria-hidden="true" />
          )}
        </AccountPanel>

        <AccountPanel
          title="Problèmes"
          description="Livraisons échouées, retours à traiter, litiges en cours."
          more={{ to: `${sellerPaths.orders(shop.id)}?onglet=issues`, label: "Tous" }}
        >
          {data.data ? (
            <OrderQueue
              orders={data.data.issues.items}
              now={now}
              detailPath={detail}
              showStatus
              empty="Aucun problème en cours."
            />
          ) : (
            <div className={styles.skeleton} aria-hidden="true" />
          )}
        </AccountPanel>

        <AccountPanel
          title="Stock bas"
          description={`Produits à ${LOW_STOCK} unités ou moins : une commande au-delà serait refusée.`}
          more={{ to: sellerPaths.products(shop.id), label: "Produits" }}
        >
          {data.data ? (
            data.data.lowStock.length === 0 ? (
              <p className={styles.empty}>Aucun produit en stock bas.</p>
            ) : (
              <ul className={styles.stock}>
                {data.data.lowStock.map((offer) => (
                  <li key={offer.id}>
                    <Link className={styles.stockRow} to={sellerPaths.editProduct(shop.id, offer.id)}>
                      <span className={styles.stockName}>{offer.product?.name ?? "Produit"}</span>
                      <span className={[styles.stockValue, offer.stock === 0 ? styles.out : ""].filter(Boolean).join(" ")}>
                        {offer.stock === 0 ? "Rupture" : `${offer.stock} en stock`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className={styles.skeleton} aria-hidden="true" />
          )}
        </AccountPanel>

        <AccountPanel title="Raccourcis">
          <div className={styles.shortcuts}>
            <Link to={sellerPaths.newProduct(shop.id)}>
              <Button fullWidth>Ajouter un produit</Button>
            </Link>
            <Link to={sellerPaths.delivery(shop.id)}>
              <Button variant="secondary" fullWidth>
                Modes de livraison
              </Button>
            </Link>
            <Link to={sellerPaths.storefront(shop.id)} target="_blank" rel="noreferrer">
              <Button variant="ghost" fullWidth>
                Voir ma vitrine
              </Button>
            </Link>
          </div>
        </AccountPanel>
      </div>
    </div>
  );
};
