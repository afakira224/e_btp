import { Link } from "react-router-dom";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { ThemeToggle } from "../../../../shared/ui";
import { LoginForm } from "../../../auth";
import { sellerPaths } from "../../shared";
import styles from "./SellerLoginPage.module.css";

const POINTS = [
  "Les nouvelles commandes à confirmer, avec leur échéance",
  "La remise au client contre son code, le suivi des livraisons",
  "Les retours et les litiges, avant qu'ils n'expirent",
  "Vos produits, vos prix, votre stock et vos modes de livraison",
];

// ─────────────────────────────────────────────
//  Connexion à l'espace boutique — /ma-boutique/connexion
//  Même compte et même session que le site : seul l'accueil diffère. Une
//  fois connecté, le gérant arrive sur le tableau de bord de sa boutique ;
//  un client sans boutique est conduit vers sa demande d'ouverture.
// ─────────────────────────────────────────────
export const SellerLoginPage = () => {
  useDocumentTitle("Connexion — Espace boutique");

  return (
    <div className={styles.page}>
      <section className={styles.intro} aria-labelledby="seller-login-intro">
        <Link className={styles.brand} to={sellerPaths.login}>
          <span className={styles.mark} aria-hidden="true">
            BTP
          </span>
          Espace boutique
        </Link>
        <div className={styles.pitch}>
          <h2 id="seller-login-intro" className={styles.pitchTitle}>
            Votre boutique, de la commande à la livraison.
          </h2>
          <ul className={styles.points}>
            {POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <p className={styles.small}>Réservé aux gérants de boutique et à l'administration de la plateforme.</p>
      </section>

      <main className={styles.panel}>
        <div className={styles.tools}>
          <Link className={styles.siteLink} to="/">
            ← Retour au site
          </Link>
          <ThemeToggle />
        </div>

        <div className={styles.card}>
          <span className={styles.eyebrow}>Espace boutique</span>
          <h1 className={styles.title}>Connexion</h1>
          <p className={styles.subtitle}>Le même compte que sur le site.</p>
          <LoginForm destination={sellerPaths.home} />
          <p className={styles.footer}>
            Pas encore de boutique ? <Link to="/compte/boutique/demande">Demander l'ouverture</Link>
          </p>
        </div>
      </main>
    </div>
  );
};
