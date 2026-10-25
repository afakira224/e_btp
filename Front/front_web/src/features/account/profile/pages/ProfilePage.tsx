import { useMemo, useState } from "react";
import { ENTITY_TYPE_LABELS, type User } from "../../../../entities/user";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { resendVerificationRequest, useAuth } from "../../../auth";
import { ShopRequestPanel } from "../../../shop-request";
import {
  AccountHeader,
  AccountPage,
  AccountPanel,
  formatDate,
  updateProfile,
} from "../../shared";
import { profileSchema, type ProfileValues } from "../validation/profile.schema";
import styles from "./ProfilePage.module.css";

type Feedback = { tone: "success" | "danger"; text: string } | null;

const valuesOf = (user: User): ProfileValues => ({
  prenom: user.prenom,
  nom: user.nom,
  telephone: user.telephone ?? "",
});

/**
 * Formulaire isolé : il repart des valeurs du compte à chaque enregistrement
 * (la page le remonte). Le message de succès vit donc dans la page, sans
 * quoi il disparaîtrait avec le remontage ; seule l'erreur reste ici.
 */
const ProfileForm = ({
  user,
  onSaving,
  onSaved,
}: {
  user: User;
  onSaving: () => void;
  onSaved: (user: User) => void;
}) => {
  const [error, setError] = useState<string | null>(null);
  const initialValues = useMemo(() => valuesOf(user), [user]);

  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit, reset } =
    useForm<ProfileValues>({
      initialValues,
      schema: profileSchema,
      onSubmit: async (submitted) => {
        setError(null);
        onSaving();
        try {
          const updated = await updateProfile({
            prenom: submitted.prenom.trim(),
            nom: submitted.nom.trim(),
            telephone: submitted.telephone.trim(),
          });
          onSaved(updated);
        } catch (caught) {
          setError((caught as Error).message);
        }
      },
    });

  // Rien n'a changé : enregistrer ne ferait qu'un aller-retour inutile.
  const dirty = (Object.keys(values) as (keyof ProfileValues)[]).some(
    (key) => values[key].trim() !== initialValues[key].trim()
  );

  const field = <K extends keyof ProfileValues>(name: K) => ({
    name,
    value: values[name],
    error: errorOf(name),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(name, event.target.value),
    onBlur: () => handleBlur(name),
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className={styles.row}>
        <Input label="Prénom" autoComplete="given-name" {...field("prenom")} />
        <Input label="Nom" autoComplete="family-name" {...field("nom")} />
      </div>
      <Input
        label="Téléphone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="Utilisé par les dépôts pour vous joindre au sujet de vos commandes."
        {...field("telephone")}
      />

      <div className={styles.actions}>
        <Button type="submit" isLoading={isSubmitting} disabled={!dirty}>
          Enregistrer
        </Button>
        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              setError(null);
            }}
            disabled={isSubmitting}
          >
            Annuler les modifications
          </Button>
        ) : null}
      </div>
    </form>
  );
};

// ─────────────────────────────────────────────
//  Mon profil — /compte/profil
//  Informations personnelles modifiables (PUT /auth/me : nom, prénom,
//  téléphone) et identifiants en lecture seule. L'email ne se change pas :
//  c'est l'identifiant de connexion, le back ne l'accepte pas ici.
// ─────────────────────────────────────────────
export const ProfilePage = () => {
  const { user, setUser } = useAuth();
  const [saved, setSaved] = useState(false);
  const [verification, setVerification] = useState<Feedback>(null);
  const [sending, setSending] = useState(false);

  useDocumentTitle("Mon profil");

  if (!user) return null;

  const resend = async () => {
    setSending(true);
    try {
      setVerification({ tone: "success", text: await resendVerificationRequest() });
    } catch (caught) {
      setVerification({ tone: "danger", text: (caught as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <AccountPage width="narrow">
      <AccountHeader
        title="Mon profil"
        lede="Vos informations personnelles, telles que les dépôts les voient sur vos commandes."
        trail={[{ label: "Mon profil" }]}
      />

      <div className={styles.stack}>
        <AccountPanel title="Informations personnelles">
          {saved ? (
            <div className={styles.saved}>
              <Alert tone="success">Vos informations ont été enregistrées.</Alert>
            </div>
          ) : null}
          {/* La clé remonte le formulaire après enregistrement : ses valeurs
              de départ deviennent celles que le serveur a renvoyées. */}
          <ProfileForm
            key={user.updatedAt ?? ""}
            user={user}
            onSaving={() => setSaved(false)}
            onSaved={(updated) => {
              setUser(updated);
              setSaved(true);
            }}
          />
        </AccountPanel>

        <AccountPanel
          title="Identifiant de connexion"
          description="L'adresse e-mail sert à vous connecter et à recevoir le suivi de vos commandes."
        >
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>E-mail</dt>
              <dd>
                {user.email}
                <span
                  className={[styles.status, user.isEmailVerified ? styles.verified : styles.unverified].join(" ")}
                >
                  {user.isEmailVerified ? "Vérifiée" : "Non vérifiée"}
                </span>
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Type de compte</dt>
              <dd>{ENTITY_TYPE_LABELS[user.role]}</dd>
            </div>
            {user.createdAt ? (
              <div className={styles.fact}>
                <dt>Client depuis</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
            ) : null}
          </dl>

          {!user.isEmailVerified ? (
            <div className={styles.verify}>
              <Button variant="secondary" onClick={() => void resend()} isLoading={sending}>
                Renvoyer l'email de vérification
              </Button>
              {verification ? <Alert tone={verification.tone}>{verification.text}</Alert> : null}
            </div>
          ) : null}
        </AccountPanel>

        {/* Ouvrir une boutique part d'ici : demande, suivi, accès à l'espace vendeur. */}
        <ShopRequestPanel />
      </div>
    </AccountPage>
  );
};
