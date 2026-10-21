import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, ThemeToggle } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { logoutAllRequest, useAuth } from "../../../auth";
import { AccountHeader, AccountPage, AccountPanel, ConfirmAction } from "../../shared";
import { PasswordForm } from "../components/PasswordForm";
import styles from "./SettingsPage.module.css";

// ─────────────────────────────────────────────
//  Paramètres — /compte/parametres
//  Sécurité (mot de passe, sessions) et préférences d'affichage.
//
//  « Déconnecter tous les appareils » ferme aussi la session courante côté
//  back (`logoutAll` détruit la session de la requête) : on le dit avant,
//  et on renvoie vers la connexion après.
// ─────────────────────────────────────────────
export const SettingsPage = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle("Paramètres");

  const logoutEverywhere = async () => {
    setError(null);
    try {
      await logoutAllRequest();
    } catch (caught) {
      setError((caught as Error).message);
      return;
    }
    // La session est déjà détruite côté serveur : cet appel remet seulement
    // l'état du front en « anonyme ».
    await logout().catch(() => undefined);
    navigate("/login", { replace: true });
  };

  return (
    <AccountPage width="narrow">
      <AccountHeader
        title="Paramètres"
        lede="Sécurité de votre compte et préférences d'affichage."
        trail={[{ label: "Paramètres" }]}
      />

      <div className={styles.stack}>
        <AccountPanel
          title="Mot de passe"
          description="Changer de mot de passe déconnecte vos autres appareils. Vous restez connecté sur celui-ci."
        >
          <PasswordForm />
        </AccountPanel>

        <AccountPanel
          title="Sessions"
          description="Un appareil perdu, un ordinateur partagé ? Fermez toutes les sessions ouvertes, y compris celle-ci."
        >
          {error ? (
            <div className={styles.alert}>
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}
          <ConfirmAction
            label="Déconnecter tous les appareils"
            question="Vous serez aussi déconnecté ici. Continuer ?"
            confirmLabel="Tout déconnecter"
            onConfirm={logoutEverywhere}
          />
        </AccountPanel>

        <AccountPanel
          title="Apparence"
          description="Le thème est mémorisé sur cet appareil. Sans choix de votre part, il suit celui du système."
        >
          <ThemeToggle />
        </AccountPanel>
      </div>
    </AccountPage>
  );
};
