import type { Shop } from "../../../../entities/shop";
import { Breadcrumb } from "../../../catalog";
import { districtOf, formatSince, mapsHref, ShopAvatar } from "../../shared";
import styles from "./ShopProfile.module.css";

interface ShopProfileProps {
  shop: Shop;
  /** Décomptes lus à part : `undefined` tant qu'ils ne sont pas arrivés. */
  articles?: number | undefined;
  promotions?: number | undefined;
}

const plural = (count: number, word: string) => `${word}${count > 1 ? "s" : ""}`;

// ─────────────────────────────────────────────
//  En-tête d'une boutique : identité, chiffres clés, coordonnées.
//  Les coordonnées sont de vrais liens (e-mail, itinéraire). Le téléphone
//  de la boutique n'est jamais affiché, par règle métier : il n'existe
//  d'ailleurs pas dans l'entité `Shop`.
// ─────────────────────────────────────────────
export const ShopProfile = ({ shop, articles, promotions }: ShopProfileProps) => {
  const district = districtOf(shop.adresse);

  return (
    <header className={styles.profile}>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Boutiques", to: "/boutiques" },
          { label: shop.nom },
        ]}
      />

      <div className={styles.layout}>
        <div className={styles.identity}>
          <ShopAvatar shop={shop} size="lg" />

          <div className={styles.copy}>
            <span className={styles.eyebrow}>
              Dépôt partenaire{district ? ` · ${district}` : ""}
            </span>
            <h1 className={styles.title}>{shop.nom}</h1>
            {shop.description ? <p className={styles.lede}>{shop.description}</p> : null}

            <ul className={styles.stats}>
              <li className={styles.stat}>
                <span className={styles.statValue}>{articles ?? "—"}</span>
                <span className={styles.statLabel}>
                  {articles === undefined ? "Articles" : plural(articles, "Article")}
                </span>
              </li>
              <li className={styles.stat}>
                <span className={styles.statValue}>{promotions ?? "—"}</span>
                <span className={styles.statLabel}>En promotion</span>
              </li>
              <li className={styles.stat}>
                <span className={styles.statValue}>{formatSince(shop.createdAt)}</span>
                <span className={styles.statLabel}>Sur la plateforme depuis</span>
              </li>
            </ul>
          </div>
        </div>

        <aside className={styles.contact} aria-label="Coordonnées de la boutique">
          <h2 className={styles.contactTitle}>Contacter la boutique</h2>
          <dl className={styles.list}>
            {shop.email ? (
              <div className={styles.row}>
                <dt className={styles.key}>E-mail</dt>
                <dd className={styles.value}>
                  <a href={`mailto:${shop.email}`}>{shop.email}</a>
                </dd>
              </div>
            ) : null}
            {shop.adresse ? (
              <div className={styles.row}>
                <dt className={styles.key}>Adresse</dt>
                <dd className={styles.value}>
                  {shop.adresse}
                  <a
                    className={styles.maps}
                    href={mapsHref(shop.adresse)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Itinéraire
                    <span aria-hidden="true"> ↗</span>
                    <span className={styles.visuallyHidden}> (nouvel onglet)</span>
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>

          {!shop.email && !shop.adresse ? (
            <p className={styles.none}>Cette boutique n'a pas encore renseigné ses coordonnées.</p>
          ) : null}
        </aside>
      </div>
    </header>
  );
};
