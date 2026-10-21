import { NavLink, Link } from "react-router-dom";
import { ThemeToggle } from "../ui";
import { useAuth } from "../../features/auth";
import { DomainMenu } from "../../features/catalog";
import { useCart } from "../../features/cart";
import { useWishlist } from "../../features/wishlist";
import { SearchBar } from "../../features/search";
import { getInitials } from "../../entities/user";
import styles from "./SiteHeader.module.css";

const ANNOUNCEMENTS = [
  "Livraison chantier offerte dès 2 000 000 GNF",
  "Déstockage — jusqu'à 20 % sur une sélection",
  "Retrait en dépôt sous 2 heures",
];

const HOME = { to: "/", label: "Accueil", end: true };

const NAV = [
  { to: "/nouveautes", label: "Nouveautés" },
  { to: "/meilleures-ventes", label: "Meilleures ventes" },
  { to: "/promotions", label: "Promotions" },
  { to: "/boutiques", label: "Boutiques" },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [styles.link, isActive ? styles.active : ""].filter(Boolean).join(" ");

export const AnnouncementBar = () => (
  <div className={styles.announce}>
    <div className={`container ${styles.announceInner}`}>
      {ANNOUNCEMENTS.map((text) => (
        <span key={text} className={styles.announceItem}>
          {text}
        </span>
      ))}
    </div>
  </div>
);

export const SiteHeader = () => {
  const { user, isAuthenticated } = useAuth();
  const { count: cartCount } = useCart();
  const { count: wishCount } = useWishlist();

  return (
    <header className={styles.header}>
      {/* Première ligne : marque, recherche, outils. La recherche prend
          toute la place libre — c'est l'outil principal d'un catalogue de
          plusieurs milliers de références. */}
      <div className={`container ${styles.headerInner}`}>
        <Link className={styles.brand} to="/">
          BTP Platform
        </Link>

        <div className={styles.search}>
          <SearchBar />
        </div>

        <div className={styles.tools}>
          <ThemeToggle />

          <Link
            className={styles.icon}
            to="/favoris"
            aria-label={
              wishCount > 0 ? `Mes favoris, ${wishCount} articles` : "Mes favoris, vide"
            }
          >
            <span aria-hidden="true">♡</span>
            {wishCount > 0 ? <span className={styles.count}>{wishCount}</span> : null}
          </Link>

          <Link
            className={styles.icon}
            to="/panier"
            aria-label={
              cartCount > 0 ? `Panier, ${cartCount} articles` : "Panier, vide"
            }
          >
            <span aria-hidden="true">▤</span>
            {cartCount > 0 ? <span className={styles.count}>{cartCount}</span> : null}
          </Link>

          {isAuthenticated && user ? (
            <Link className={styles.account} to="/compte">
              <span aria-hidden="true">{getInitials(user)}</span>
              <span className={styles.accountLabel}>{user.prenom}</span>
            </Link>
          ) : (
            <Link className={styles.account} to="/login">
              <span className={styles.accountLabel}>Se connecter</span>
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </div>

      {/* Seconde ligne : la navigation, libérée de la concurrence avec la
          barre de recherche. */}
      <div className={styles.navRow}>
        <div className="container">
          <nav className={styles.nav} aria-label="Navigation principale">
            <NavLink to={HOME.to} end className={linkClass}>
              {HOME.label}
            </NavLink>

            {/* « Domaine » prend la place de l'ancienne entrée « Catalogue » :
                au survol elle déroule les familles, plutôt que de mener à une
                page de plus. */}
            <DomainMenu />

            {NAV.map((entry) => (
              <NavLink key={entry.to} to={entry.to} className={linkClass}>
                {entry.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};
