import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SUPPORT_REASONS } from "../../../../entities/support";
import { Alert, Button, Input, Select, TextArea } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { useAuth } from "../../../auth";
import { Breadcrumb } from "../../../catalog";
import { contactSupport, NewTicketForm, supportPaths } from "../../shared";
import styles from "./ContactPage.module.css";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REASONS = Object.entries(SUPPORT_REASONS.general_question).map(([value, label]) => ({ value, label }));

/** Ce qu'on vient chercher ici le plus souvent, et où le trouver plus vite. */
const SHORTCUTS = [
  { title: "Un souci avec une commande", text: "Ouvrez la commande dans votre compte : « Signaler un problème » sous la boutique concernée. La boutique a 48 heures pour répondre." },
  { title: "Retourner un produit", text: "Dans les 7 jours après la livraison, depuis la commande : « Demander un retour »." },
  { title: "Une annonce ou une boutique douteuse", text: "« Signaler » sur la page de l'annonce ou de la boutique. Le vendeur ne saura pas qui l'a signalée." },
];

// ─────────────────────────────────────────────
//  Nous contacter — /contact
//  Connecté, on ouvre une demande suivie dans « Mon compte » ; visiteur, on
//  laisse un email où l'équipe répond. Les cas courants (commande, retour,
//  signalement) ont leur bouton là où ils se produisent : on y renvoie.
// ─────────────────────────────────────────────
export const ContactPage = () => {
  const { user, status } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle("Nous contacter");

  return (
    <div className={`container ${styles.page}`}>
      <Breadcrumb items={[{ label: "Accueil", to: "/" }, { label: "Nous contacter" }]} />
      <header className={styles.head}>
        <h1 className={styles.title}>Nous contacter</h1>
        <p className={styles.lede}>L'équipe de la plateforme répond sous 24 heures ouvrées, ici et par email.</p>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          {status === "pending" ? null : user ? (
            <>
              <NewTicketForm
                type="general_question"
                onCreated={(ticket) => navigate(supportPaths.ticket(ticket.id), { state: { feedback: `Demande ${ticket.number} envoyée : la réponse arrivera ici.` } })}
              />
              <p className={styles.note}>
                Vos demandes et leurs réponses : <Link to={supportPaths.list}>Mon compte › Support</Link>.
              </p>
            </>
          ) : (
            <VisitorForm />
          )}
        </div>

        <aside className={styles.side}>
          <h2 className={styles.sideTitle}>Plus rapide</h2>
          <ul className={styles.shortcuts}>
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.title}>
                <p className={styles.shortcutTitle}>{shortcut.title}</p>
                <p className={styles.shortcutText}>{shortcut.text}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
};

/** Visiteur : nom, email et message ; la réponse part par email. */
const VisitorForm = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("other");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  if (sent) {
    return (
      <div className={styles.sent}>
        <Alert tone="success">{sent}</Alert>
        <p className={styles.note}>
          Vous avez un compte ? <Link to="/login">Connectez-vous</Link> pour suivre vos demandes depuis « Mon compte ».
        </p>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Indiquez votre nom.");
    if (!EMAIL.test(email.trim())) return setError("Indiquez un email valide : la réponse y sera envoyée.");
    if (message.trim().length < 10) return setError("Votre message doit faire 10 caractères au moins.");
    setBusy(true);
    setError(null);
    try {
      setSent(await contactSupport({ name: name.trim(), email: email.trim(), reason, subject: subject.trim() || undefined, message: message.trim() }));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <p className={styles.note}>
        Vous avez un compte ? <Link to="/login">Connectez-vous</Link> : la demande sera suivie dans « Mon compte ».
      </p>
      <div className={styles.row}>
        <Input label="Nom" autoComplete="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
        <Input label="Email" type="email" autoComplete="email" maxLength={120} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
      </div>
      <Select label="Sujet" options={REASONS} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
      <Input label="Objet" optional maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} disabled={busy} />
      <TextArea label="Message" rows={6} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} disabled={busy} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div>
        <Button type="submit" isLoading={busy}>
          Envoyer
        </Button>
      </div>
    </form>
  );
};
