import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getFullName } from "../../../../entities/user";
import { Alert, Button } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { useAuth } from "../../../auth";
import { AccountHeader, AccountPage } from "../../shared";
import { AddressCard } from "../components/AddressCard";
import { useAddresses } from "../hooks/useAddresses";
import type { AddressListState } from "./AddressFormPage";
import styles from "./AddressesPage.module.css";

type Feedback = { tone: "success" | "danger"; text: string } | null;

const NEW_PATH = "/compte/adresses/nouvelle";

// ─────────────────────────────────────────────
//  Mes adresses — /compte/adresses
//  La liste seule. Ajouter ou modifier ouvre une page de formulaire à part
//  (la liste disparaît le temps de la saisie) ; au retour, le message de
//  confirmation arrive par l'état de navigation, affiché une fois.
//  « Définir par défaut » et « Supprimer » restent sur place : ce sont des
//  actions d'un clic, sans saisie.
// ─────────────────────────────────────────────
export const AddressesPage = () => {
  const { user } = useAuth();
  const book = useAddresses(user?._id ?? "");
  const location = useLocation();
  const navigate = useNavigate();

  const [feedback, setFeedback] = useState<Feedback>(() => {
    const text = (location.state as AddressListState | null)?.feedback;
    return text ? { tone: "success", text } : null;
  });

  // Le message est consommé : on le retire de l'historique, sans quoi un
  // rafraîchissement ou un retour arrière le réafficherait.
  useEffect(() => {
    if ((location.state as AddressListState | null)?.feedback) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  useDocumentTitle("Mes adresses");

  if (!user) return null;

  const recipient = getFullName(user);

  const run = async (action: () => Promise<void>, success: string) => {
    setFeedback(null);
    try {
      await action();
      setFeedback({ tone: "success", text: success });
    } catch (caught) {
      setFeedback({ tone: "danger", text: (caught as Error).message });
    }
  };

  return (
    <AccountPage>
      <AccountHeader
        title="Mes adresses"
        lede="Vos adresses de livraison : domicile, bureau, chantiers. L'adresse par défaut est proposée en premier à la commande."
        trail={[{ label: "Mes adresses" }]}
        action={<Button onClick={() => navigate(NEW_PATH)}>Ajouter une adresse</Button>}
      />

      {feedback ? (
        <div className={styles.feedback}>
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      ) : null}

      {book.error ? (
        <div className={styles.state}>
          <Alert tone="danger">{book.error}</Alert>
          <Button variant="secondary" onClick={() => void book.reload()}>
            Réessayer
          </Button>
        </div>
      ) : book.isLoading ? (
        <div className={styles.grid} aria-hidden="true">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      ) : book.addresses.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Aucune adresse enregistrée</p>
          <p className={styles.emptyText}>
            Ajoutez l'adresse de votre domicile ou de votre chantier pour commander plus vite.
          </p>
          <Button variant="secondary" onClick={() => navigate(NEW_PATH)}>
            Ajouter ma première adresse
          </Button>
        </div>
      ) : (
        <div className={styles.grid}>
          {book.addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              fallbackRecipient={recipient}
              editTo={`/compte/adresses/${encodeURIComponent(address.id)}/modifier`}
              onMakeDefault={() =>
                run(
                  () => book.makeDefault(address.id),
                  `« ${address.label || "Adresse"} » est maintenant votre adresse par défaut.`
                )
              }
              onDelete={() => run(() => book.remove(address.id), "Adresse supprimée.")}
            />
          ))}
        </div>
      )}
    </AccountPage>
  );
};
