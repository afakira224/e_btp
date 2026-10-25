import { Link, useNavigate } from "react-router-dom";
import { ShopRequestStatus } from "../../../../entities/shop-request";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountHeader, AccountPage } from "../../../account";
import { useAuth } from "../../../auth";
import { shopRequestPaths, useMyShopRequests } from "../../shared";
import { ShopRequestForm } from "../components/ShopRequestForm";
import { EMPTY_VALUES, valuesFrom } from "../validation/shopRequest.schema";
import styles from "./ShopRequestFormPage.module.css";

const STEPS = [
  { title: "Vous présentez votre activité", text: "Le questionnaire ci-contre, en quelques minutes." },
  { title: "L'équipe examine la demande", text: "Elle peut vous contacter par email ou téléphone pour la compléter." },
  { title: "Votre boutique ouvre", text: "Vous ajoutez vos produits et réglez vos modes de livraison." },
];

// ─────────────────────────────────────────────
//  Créer une boutique — /compte/boutique/demande
//  On y arrive depuis le profil. Une seule demande en attente par compte :
//  s'il y en a déjà une, la page renvoie vers son suivi plutôt que de
//  proposer un formulaire que le serveur refuserait (409).
// ─────────────────────────────────────────────
export const ShopRequestFormPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const requests = useMyShopRequests();
  useDocumentTitle("Créer une boutique");

  const header = (
    <AccountHeader
      title="Créer une boutique"
      lede="Vendez vos matériaux et équipements aux particuliers et aux professionnels du bâtiment."
      trail={[{ label: "Mon profil", to: "/compte/profil" }, { label: "Créer une boutique" }]}
    />
  );

  if (!user) return null;

  if (requests.error) {
    return (
      <AccountPage>
        {header}
        <Alert tone="danger">{requests.error}</Alert>
      </AccountPage>
    );
  }

  if (requests.isLoading || !requests.data) {
    return (
      <AccountPage>
        {header}
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  const latest = requests.latest;

  if (latest?.status === ShopRequestStatus.PENDING) {
    return (
      <AccountPage width="narrow">
        {header}
        <Alert tone="info">
          Votre demande pour <strong>{latest.nom}</strong> est déjà en cours d'examen. Vous pourrez en
          déposer une autre une fois qu'elle aura été traitée.{" "}
          <Link to={shopRequestPaths.status}>Suivre ma demande</Link>
        </Alert>
      </AccountPage>
    );
  }

  const rejected = latest?.status === ShopRequestStatus.REJECTED ? latest : null;

  return (
    <AccountPage>
      {header}

      <div className={styles.layout}>
        <div className={styles.main}>
          {rejected ? (
            <div className={styles.notice}>
              <Alert tone="warning">
                <p>
                  Votre demande pour <strong>{rejected.nom}</strong> n'a pas été retenue :{" "}
                  {rejected.rejectionReason}
                </p>
                <p>Vos réponses sont reprises ci-dessous : corrigez-les puis renvoyez la demande.</p>
              </Alert>
            </div>
          ) : null}

          <ShopRequestForm
            initialValues={rejected ? valuesFrom(rejected) : EMPTY_VALUES}
            accountEmail={user.email}
            onSubmitted={() => navigate(shopRequestPaths.status, { state: { submitted: true } })}
          />
        </div>

        <aside className={styles.aside} aria-label="Comment se passe l'ouverture">
          <h2 className={styles.asideTitle}>Comment ça se passe</h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepIndex} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className={styles.stepTitle}>{step.title}</span>
                  <span className={styles.stepText}>{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.asideNote}>
            Votre compte reste le même : vous continuez d'acheter avec, et vous gérez votre boutique
            depuis « Ma boutique ».
          </p>
        </aside>
      </div>
    </AccountPage>
  );
};
