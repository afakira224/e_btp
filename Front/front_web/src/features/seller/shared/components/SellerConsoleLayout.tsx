import { Link, Outlet, useNavigate } from "react-router-dom";
import { getInitials } from "../../../../entities/user";
import { ScrollToTop } from "../../../../shared/layout";
import { ThemeToggle } from "../../../../shared/ui";
import { useAuth } from "../../../auth";
import { sellerPaths } from "../utils/paths";
import styles from "./SellerConsoleLayout.module.css";

// ─────────────────────────────────────────────
//  Espace boutique — l'ossature de tout /ma-boutique.
//
//  Une application de travail, distincte du site marchand : ni bandeau
//  promotionnel, ni recherche, ni panier. Une barre sombre (la marque, le
//  compte, la déconnexion) au-dessus de chaque écran ; la boutique ouverte
//  ajoute son menu latéral (SellerShopLayout). C'est l'architecture « header
//  + sidebar sombres, contenu clair » de la charte graphique.
// ─────────────────────────────────────────────
export const SellerConsoleLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await logout();
    navigate(sellerPaths.login, { replace: true });
  };

  return (
    <div className={styles.console}>
      <ScrollToTop />
      <a className={styles.skip} href="#console-content">
        Aller au contenu
      </a>

      <header className={styles.topbar}>
        <Link className={styles.brand} to={sellerPaths.home}>
          <span className={styles.mark} aria-hidden="true">
            BTP
          </span>
          <span className={styles.brandText}>Espace boutique</span>
        </Link>

        <div className={styles.tools}>
          <Link className={styles.siteLink} to="/">
            Voir le site
          </Link>
          <ThemeToggle />
          {user ? (
            <span className={styles.user} title={user.email}>
              <span className={styles.avatar} aria-hidden="true">
                {getInitials(user)}
              </span>
              <span className={styles.userName}>{`${user.prenom} ${user.nom}`.trim()}</span>
            </span>
          ) : null}
          <button type="button" className={styles.signOut} onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <Outlet />
      </div>
    </div>
  );
};
