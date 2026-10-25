import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import type { Shop } from "../../../../entities/shop";
import { EntityType } from "../../../../entities/user";
import { Alert } from "../../../../shared/ui";
import { useAuth } from "../../../auth";
import { useResource } from "../../../catalog";
import { fetchShop } from "../../../shops";
import { canManageShop, fetchManagedShops } from "../api/seller.api";
import { useShopOrderCounts } from "../hooks/useShopOrderCounts";
import type { SellerShopContext } from "../hooks/useSellerShop";
import { sellerPaths } from "../utils/paths";
import {
  DashboardIcon,
  DeliveryIcon,
  ExternalIcon,
  MenuIcon,
  OrdersIcon,
  ProductsIcon,
  ShopIcon,
} from "./ConsoleIcons";
import styles from "./SellerShopLayout.module.css";

/** Rubriques du menu, dans l'ordre du travail quotidien. */
const SECTIONS: readonly {
  key: string;
  label: string;
  lede: string;
  icon: ReactNode;
  path: (shopId: string) => string;
}[] = [
  {
    key: "",
    label: "Tableau de bord",
    lede: "Ce qui attend une action aujourd'hui, et les échéances qui approchent.",
    icon: <DashboardIcon />,
    path: sellerPaths.dashboard,
  },
  {
    key: "commandes",
    label: "Commandes",
    lede: "Confirmez, préparez, livrez — et répondez aux retours avant leur échéance.",
    icon: <OrdersIcon />,
    path: sellerPaths.orders,
  },
  {
    key: "produits",
    label: "Produits",
    lede: "Vos offres, leurs prix, leur stock et leur livraison.",
    icon: <ProductsIcon />,
    path: sellerPaths.products,
  },
  {
    key: "livraison",
    label: "Livraison",
    lede: "Les modes proposés par défaut pour tous vos produits.",
    icon: <DeliveryIcon />,
    path: sellerPaths.delivery,
  },
  {
    key: "informations",
    label: "Informations",
    lede: "Ce que les clients lisent sur votre vitrine.",
    icon: <ShopIcon />,
    path: sellerPaths.info,
  },
];

const itemClass = ({ isActive }: { isActive: boolean }) =>
  [styles.item, isActive ? styles.active : ""].filter(Boolean).join(" ");

const initialsOf = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

// ─────────────────────────────────────────────
//  Une boutique dans l'espace boutique — /ma-boutique/:boutiqueId/…
//  Charge la boutique une fois et la passe à ses rubriques (contexte de
//  l'Outlet), avec le nombre de commandes par onglet. Menu latéral sombre ;
//  sur mobile, il devient un tiroir ouvert par « Menu ».
// ─────────────────────────────────────────────
export const SellerShopLayout = () => {
  const { boutiqueId = "" } = useParams<{ boutiqueId: string }>();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback((signal: AbortSignal) => fetchShop(boutiqueId, signal), [boutiqueId]);
  const shop = useResource<Shop | null>(load, null, boutiqueId);
  // Après une modification des informations, la version enregistrée fait
  // foi : le menu suit sans relecture, et la rubrique reste montée.
  const [updated, setUpdated] = useState<Shop | null>(null);
  const { counts, refresh } = useShopOrderCounts(boutiqueId);

  // Plusieurs boutiques (ou l'administration) : un lien ramène au choix.
  const loadShops = useCallback(
    (signal: AbortSignal) => (user ? fetchManagedShops(user, signal) : Promise.resolve([])),
    [user]
  );
  const managed = useResource<Shop[] | null>(loadShops, null, user?._id ?? "");
  const several = (managed.data?.length ?? 0) > 1;

  // Le tiroir se referme à chaque navigation, et avec Échap.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  // Une rubrique relue (après une commande traitée ailleurs, par exemple)
  // relit aussi les compteurs du menu.
  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  const segment = pathname.split("/")[3] ?? "";
  const section = SECTIONS.find((candidate) => candidate.key === segment) ?? SECTIONS[0]!;

  if (shop.error) {
    return (
      <div className={styles.solo}>
        <h1 className={styles.title}>Boutique introuvable</h1>
        <Alert tone="danger">{shop.error}</Alert>
        <Link className={styles.back} to={sellerPaths.home}>
          ← Mes boutiques
        </Link>
      </div>
    );
  }

  if (shop.isLoading || !shop.data) {
    return (
      <div className={styles.solo}>
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  const data = updated?.id === shop.data.id ? updated : shop.data;

  // Le back refuserait toute écriture : autant ne pas proposer de formulaire.
  if (!canManageShop(user, data)) {
    return (
      <div className={styles.solo}>
        <h1 className={styles.title}>{data.nom}</h1>
        <Alert tone="danger">
          Cette boutique n'est pas la vôtre : seuls son gérant et l'administration peuvent la gérer.
        </Alert>
        <Link className={styles.back} to={sellerPaths.home}>
          ← Mes boutiques
        </Link>
      </div>
    );
  }

  const waiting = counts ? counts.todo + counts.issues : 0;
  const context: SellerShopContext = {
    shop: data,
    onShopUpdated: setUpdated,
    orderCounts: counts,
    refreshOrderCounts: () => void refresh(),
  };

  return (
    <div className={styles.shell}>
      {menuOpen ? <button type="button" className={styles.backdrop} aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} /> : null}

      <aside className={[styles.sidebar, menuOpen ? styles.open : ""].filter(Boolean).join(" ")} id="console-menu">
        <div className={styles.shop}>
          {data.logo ? (
            <img className={styles.logo} src={data.logo} alt="" />
          ) : (
            <span className={styles.logo} aria-hidden="true">
              {initialsOf(data.nom)}
            </span>
          )}
          <span className={styles.shopText}>
            <span className={styles.shopName}>{data.nom}</span>
            <span className={styles.shopAddress}>{data.adresse ?? "Adresse non renseignée"}</span>
          </span>
        </div>

        <nav className={styles.nav} aria-label="Menu de la boutique">
          {SECTIONS.map((item) => (
            <NavLink key={item.key || "dashboard"} className={itemClass} to={item.path(data.id)} end={item.key === ""}>
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
              {item.key === "commandes" && waiting > 0 ? (
                <span className={styles.badge} aria-label={`${waiting} à traiter`}>
                  {waiting}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}>
          <Link className={styles.footerLink} to={sellerPaths.storefront(data.id)} target="_blank" rel="noreferrer">
            <span className={styles.icon}>
              <ExternalIcon />
            </span>
            Voir ma vitrine
          </Link>
          {several || user?.role === EntityType.ADMIN ? (
            <Link className={styles.footerLink} to={sellerPaths.home}>
              <span className={styles.icon} aria-hidden="true">
                ⇄
              </span>
              Changer de boutique
            </Link>
          ) : null}
        </div>
      </aside>

      <main className={styles.content} id="console-content">
        <div className={styles.mobileBar}>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls="console-menu"
            onClick={() => setMenuOpen(true)}
          >
            <MenuIcon />
            Menu
          </button>
          <span className={styles.mobileShop}>{data.nom}</span>
          {waiting > 0 ? <span className={styles.badge}>{waiting}</span> : null}
        </div>

        <header className={styles.head}>
          <h1 className={styles.title}>{section.label}</h1>
          <p className={styles.lede}>{section.lede}</p>
        </header>

        <Outlet context={context} />
      </main>
    </div>
  );
};
