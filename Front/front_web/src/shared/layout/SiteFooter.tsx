import { Link } from "react-router-dom";
import styles from "./SiteFooter.module.css";

const TRUST = [
  {
    icon: "⇉",
    title: "Livraison chantier",
    text: "Conakry sous 48 h, intérieur du pays sur devis",
  },
  {
    icon: "⌂",
    title: "Retrait en dépôt",
    text: "Commande prête sous 2 heures",
  },
  {
    icon: "✓",
    title: "Paiement sécurisé",
    text: "Mobile money et virement bancaire",
  },
  {
    icon: "↻",
    title: "Retours sous 14 jours",
    text: "Produits non entamés, emballage d'origine",
  },
];

const COLUMNS = [
  {
    title: "Catalogue",
    links: [
      { to: "/categories", label: "Toutes les catégories" },
      { to: "/nouveautes", label: "Nouveautés" },
      { to: "/meilleures-ventes", label: "Meilleures ventes" },
      { to: "/promotions", label: "Promotions" },
    ],
  },
  {
    title: "Services",
    links: [
      { to: "/signup", label: "Compte professionnel" },
      { to: "/devis", label: "Demander un devis" },
      { to: "/livraison", label: "Livraison et retrait" },
      { to: "/boutiques", label: "Nos dépôts" },
    ],
  },
  {
    title: "Aide",
    links: [
      { to: "/contact", label: "Nous contacter" },
      { to: "/retours", label: "Retours et remboursements" },
      { to: "/cgv", label: "Conditions de vente" },
      { to: "/confidentialite", label: "Confidentialité" },
    ],
  },
];

export const TrustBar = () => (
  <div className={styles.trust}>
    <div className={`container ${styles.trustGrid}`}>
      {TRUST.map((entry) => (
        <div key={entry.title} className={styles.trustItem}>
          <span className={styles.trustIcon} aria-hidden="true">
            {entry.icon}
          </span>
          <span>
            <span className={styles.trustTitle}>{entry.title}</span>
            <span className={styles.trustText}>{entry.text}</span>
          </span>
        </div>
      ))}
    </div>
  </div>
);

export const SiteFooter = () => (
  <footer className={styles.footer}>
    <div className="container">
      <div className={styles.columns}>
        <div>
          <span className={styles.brand}>BTP Platform</span>
          <p className={styles.pitch}>
            La place de marché des matériaux de construction en Guinée. Dépôts
            vérifiés, prix affichés, livraison suivie jusqu'au chantier.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title}>
            <span className={styles.colTitle}>{column.title}</span>
            <ul className={styles.list}>
              {column.links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={styles.legal}>
        <span>© {new Date().getFullYear()} BTP Platform — Conakry, Guinée</span>
        <span>Prix en francs guinéens (GNF), TVA incluse</span>
      </div>
    </div>
  </footer>
);
