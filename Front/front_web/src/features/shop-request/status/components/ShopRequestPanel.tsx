import { Link } from "react-router-dom";
import { ShopRequestStatus } from "../../../../entities/shop-request";
import { EntityType } from "../../../../entities/user";
import { AccountPanel, formatDate } from "../../../account";
import { useAuth } from "../../../auth";
import { shopRequestPaths, ShopRequestStatusBadge, useMyShopRequests } from "../../shared";
import styles from "./ShopRequestPanel.module.css";

// ─────────────────────────────────────────────
//  « Ma boutique » dans le profil — l'entrée du parcours d'ouverture.
//  Sans demande : l'invitation à créer une boutique. Avec une demande : où
//  elle en est et l'étape suivante. Un gérant y retrouve son espace vendeur.
// ─────────────────────────────────────────────
export const ShopRequestPanel = () => {
  const { user } = useAuth();
  const requests = useMyShopRequests();

  // L'administration ouvre les boutiques, elle n'en demande pas.
  if (!user || user.role === EntityType.ADMIN) return null;

  const seller = user.role === EntityType.SHOP;
  const latest = requests.latest;

  const body = () => {
    if (requests.isLoading) return <span className={styles.loading} aria-hidden="true" />;
    if (requests.error) return <p className={styles.text}>{requests.error}</p>;

    if (latest?.status === ShopRequestStatus.PENDING) {
      return (
        <>
          <p className={styles.line}>
            <span className={styles.name}>{latest.nom}</span>
            <ShopRequestStatusBadge status={latest.status} />
          </p>
          <p className={styles.text}>
            Demande déposée le {formatDate(latest.createdAt)}, en cours d'examen par l'équipe.
          </p>
          <div className={styles.actions}>
            <Link className={styles.secondary} to={shopRequestPaths.status}>
              Suivre ma demande
            </Link>
          </div>
        </>
      );
    }

    if (latest?.status === ShopRequestStatus.REJECTED) {
      return (
        <>
          <p className={styles.line}>
            <span className={styles.name}>{latest.nom}</span>
            <ShopRequestStatusBadge status={latest.status} />
          </p>
          {latest.rejectionReason ? <p className={styles.text}>Motif : {latest.rejectionReason}</p> : null}
          <div className={styles.actions}>
            <Link className={styles.primary} to={shopRequestPaths.apply}>
              Faire une nouvelle demande
            </Link>
            <Link className={styles.secondary} to={shopRequestPaths.status}>
              Voir ma demande
            </Link>
          </div>
        </>
      );
    }

    if (seller || latest?.status === ShopRequestStatus.APPROVED) {
      return (
        <>
          <p className={styles.text}>
            {latest?.status === ShopRequestStatus.APPROVED
              ? `Votre boutique ${latest.nom} est ouverte.`
              : "Vous gérez une boutique sur la plateforme."}{" "}
            Produits, livraison et informations se règlent depuis votre espace vendeur.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} to={shopRequestPaths.seller}>
              Accéder à ma boutique
            </Link>
            <Link className={styles.secondary} to={shopRequestPaths.apply}>
              Ouvrir une autre boutique
            </Link>
          </div>
        </>
      );
    }

    return (
      <>
        <p className={styles.text}>
          Vous vendez des matériaux, de l'outillage ou des équipements ? Ouvrez votre boutique : vos
          produits seront proposés aux particuliers et aux professionnels du bâtiment.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} to={shopRequestPaths.apply}>
            Créer une boutique
          </Link>
        </div>
      </>
    );
  };

  return (
    <div id="boutique" className={styles.anchor}>
      <AccountPanel
        title="Ma boutique"
        description="L'ouverture d'une boutique est examinée par l'équipe de la plateforme."
      >
        {body()}
      </AccountPanel>
    </div>
  );
};
