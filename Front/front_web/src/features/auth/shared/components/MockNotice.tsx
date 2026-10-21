import { Link } from "react-router-dom";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../../../../shared/api";
import { env } from "../../../../shared/config/env";
import styles from "./MockNotice.module.css";

// ─────────────────────────────────────────────
//  Rappel des identifiants de démonstration.
//  Sans back, personne ne peut deviner le compte du jeu de départ.
//  Le bloc s'efface entièrement dès que le mode simulé est coupé.
// ─────────────────────────────────────────────
export const MockCredentials = () => {
  if (!env.useMock) return null;

  return (
    <div className={styles.notice}>
      <span className={styles.tag}>Données simulées — compte de démonstration</span>
      <div className={styles.rows}>
        <span className={styles.row}>
          <span className={styles.key}>Email</span>
          {DEMO_EMAIL}
        </span>
        <span className={styles.row}>
          <span className={styles.key}>Mot de passe</span>
          {DEMO_PASSWORD}
        </span>
      </div>
    </div>
  );
};

interface MockLinkProps {
  /** Lien renvoyé par la couche simulée ; absent avec la vraie API. */
  href?: string | undefined;
  label: string;
}

// ─────────────────────────────────────────────
//  Lien normalement reçu par email.
//  Aucun message ne part en mode simulé : sans ce relais, les parcours de
//  vérification et de réinitialisation seraient impossibles à suivre.
// ─────────────────────────────────────────────
export const MockLink = ({ href, label }: MockLinkProps) => {
  if (!env.useMock || !href) return null;

  // Le routeur attend un chemin, pas une URL absolue.
  const path = href.replace(window.location.origin, "");

  return (
    <div className={styles.notice}>
      <span className={styles.tag}>Données simulées — aucun email envoyé</span>
      <Link className={styles.link} to={path}>
        {label} : {path}
      </Link>
    </div>
  );
};
