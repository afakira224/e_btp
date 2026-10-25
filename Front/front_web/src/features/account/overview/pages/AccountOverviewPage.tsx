import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EntityType, ENTITY_TYPE_LABELS, getFullName, getInitials } from "../../../../entities/user";
import { Alert, Button } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { resendVerificationRequest, useAuth } from "../../../auth";
import { useCart } from "../../../cart";
import { useWishlist } from "../../../wishlist";
import { AccountHeader, AccountPage, formatDate } from "../../shared";
import { useOverview } from "../hooks/useOverview";
import styles from "./AccountOverviewPage.module.css";
import { assetUrl } from "../../../../shared/config/env";

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count > 1 ? pluralForm : singular}`;

// ─────────────────────────────────────────────
//  Mon compte — /compte
//  Page d'accueil de l'espace client : qui est connecté, puis une carte par
//  rubrique. Chaque rubrique (commandes, adresses, profil, paramètres…) est
//  une page à part entière ; la carte en donne un aperçu vivant — combien
//  de commandes en cours, quelle adresse par défaut — pour qu'on sache où
//  aller avant d'y aller.
// ─────────────────────────────────────────────
export const AccountOverviewPage = () => {
  const { user, logout } = useAuth();
  const { count: cartCount } = useCart();
  const { count: wishCount } = useWishlist();
  const navigate = useNavigate();
  const overview = useOverview(user?._id ?? "");
  const [verification, setVerification] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useDocumentTitle("Mon compte");

  if (!user) return null;

  const data = overview.data;
  const loading = overview.isLoading;
  const defaultAddress = data?.addresses.find((address) => address.isDefault) ?? data?.addresses[0];

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

  const handleLogout = async () => {
    setLeaving(true);
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  // Les comptes boutique (et l'administration) gèrent aussi des boutiques :
  // leur espace vendeur passe en tête. L'administration examine en plus les
  // demandes d'ouverture ; un client, lui, est invité à en déposer une.
  const isSeller = user.role === EntityType.SHOP || user.role === EntityType.ADMIN;
  const admin =
    user.role === EntityType.ADMIN
      ? [
          {
            to: "/admin",
            title: "Administration",
            text: "Les demandes d'ouverture de boutique : examiner, approuver, refuser.",
            summary: "Demandes de boutique",
          },
        ]
      : [];
  const seller = isSeller
    ? [
        {
          to: "/ma-boutique",
          title: "Ma boutique",
          text: "Vos produits, vos modes de livraison et les informations de votre boutique.",
          summary: "Espace vendeur",
        },
      ]
    : [];
  const openShop = isSeller
    ? []
    : [
        {
          to: "/compte/boutique/demande",
          title: "Ouvrir une boutique",
          text: "Vendez vos matériaux sur la plateforme : présentez votre activité, l'équipe examine la demande.",
          summary: "Vendre sur BTP",
        },
      ];

  const sections = [
    ...admin,
    ...seller,
    {
      to: "/compte/commandes",
      title: "Mes commandes",
      text: "Suivre une livraison, consulter une commande passée, commander à nouveau.",
      summary: loading
        ? undefined
        : data
          ? `${data.inProgress} en cours · ${data.totalOrders} au total`
          : "—",
    },
    {
      to: "/compte/adresses",
      title: "Mes adresses",
      text: "Domicile, bureau, chantiers : vos adresses de livraison.",
      summary: loading
        ? undefined
        : data
          ? data.addresses.length === 0
            ? "Aucune adresse"
            : `${plural(data.addresses.length, "adresse")}${defaultAddress?.label ? ` · Par défaut : ${defaultAddress.label}` : ""}`
          : "—",
    },
    {
      to: "/compte/profil",
      title: "Mon profil",
      text: "Nom, prénom et téléphone ; statut de votre adresse e-mail ; votre boutique.",
      summary: user.isEmailVerified ? "E-mail vérifié" : "E-mail à vérifier",
    },
    {
      to: "/compte/parametres",
      title: "Paramètres",
      text: "Mot de passe, sessions ouvertes et apparence du site.",
      summary: "Sécurité et préférences",
    },
    {
      to: "/favoris",
      title: "Mes favoris",
      text: "Les articles mis de côté pour plus tard.",
      summary: plural(wishCount, "article"),
    },
    {
      to: "/panier",
      title: "Mon panier",
      text: "Les articles prêts à être commandés.",
      summary: plural(cartCount, "article"),
    },
    ...openShop,
  ];

  return (
    <AccountPage>
      <AccountHeader
        title="Mon compte"
        action={
          <Button variant="secondary" onClick={() => void handleLogout()} isLoading={leaving}>
            Se déconnecter
          </Button>
        }
      />

      <section className={styles.identity} aria-label="Titulaire du compte">
        <span className={styles.avatar} aria-hidden="true">
          {user.avatar ? <img src={assetUrl(user.avatar)} alt="" /> : getInitials(user)}
        </span>
        <div className={styles.who}>
          <p className={styles.hello}>Bonjour {user.prenom}</p>
          <p className={styles.meta}>
            {getFullName(user)} · {user.email}
          </p>
          <p className={styles.meta}>
            {ENTITY_TYPE_LABELS[user.role]}
            {user.createdAt ? ` · Client depuis le ${formatDate(user.createdAt)}` : ""}
          </p>
        </div>
      </section>

      {!user.isEmailVerified ? (
        <div className={styles.notice}>
          <Alert tone="warning">
            <p>
              Votre adresse <strong>{user.email}</strong> n'est pas encore vérifiée. Vérifiez-la
              pour recevoir le suivi de vos commandes.
            </p>
            <div className={styles.noticeAction}>
              <Button variant="secondary" onClick={() => void resend()} isLoading={sending}>
                Renvoyer l'email de vérification
              </Button>
            </div>
          </Alert>
          {verification ? <Alert tone={verification.tone}>{verification.text}</Alert> : null}
        </div>
      ) : null}

      {overview.error ? (
        <div className={styles.notice}>
          <Alert tone="danger">{overview.error}</Alert>
        </div>
      ) : null}

      {/* Une carte = une page. Toute la carte est le lien. */}
      <nav aria-label="Rubriques du compte">
        <ul className={styles.sections}>
          {sections.map((section) => (
            <li key={section.to}>
              <Link className={styles.card} to={section.to}>
                <span className={styles.cardTitle}>
                  {section.title}
                  <span className={styles.arrow} aria-hidden="true">
                    →
                  </span>
                </span>
                <span className={styles.cardText}>{section.text}</span>
                <span className={styles.cardSummary}>
                  {section.summary ?? <span className={styles.summaryLoading} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </AccountPage>
  );
};
