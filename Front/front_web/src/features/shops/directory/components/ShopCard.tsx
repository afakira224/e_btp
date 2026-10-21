import { useCallback } from "react";
import { Link } from "react-router-dom";
import type { Shop } from "../../../../entities/shop";
import { productImage, productName } from "../../../../entities/product";
import { Thumbnail } from "../../../../shared/ui";
import { fetchListing, useResource, type ProductListPage } from "../../../catalog";
import { districtOf, ShopAvatar } from "../../shared";
import styles from "./ShopCard.module.css";

const PREVIEW = 3;

// ─────────────────────────────────────────────
//  Carte d'une boutique dans l'annuaire.
//  Un aperçu de ses trois articles les plus populaires dit ce qu'elle
//  vend mieux qu'une description ; la même requête donne le nombre total
//  d'articles. La carte entière est cliquable (lien étiré sur le nom),
//  sans imbriquer de liens.
// ─────────────────────────────────────────────
export const ShopCard = ({ shop }: { shop: Shop }) => {
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchListing({ sort: "popular", boutiqueId: shop.id }, 1, PREVIEW, signal),
    [shop.id]
  );
  const preview = useResource<ProductListPage | null>(load, null, shop.id);
  const items = preview.data?.items ?? [];
  const total = preview.data?.total;
  const district = districtOf(shop.adresse);

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <ShopAvatar shop={shop} />
        <div className={styles.identity}>
          <h2 className={styles.name}>
            <Link className={styles.link} to={`/boutiques/${shop.id}`}>
              {shop.nom}
            </Link>
          </h2>
          {district ? <span className={styles.district}>{district}</span> : null}
        </div>
      </header>

      {shop.description ? <p className={styles.description}>{shop.description}</p> : null}

      {/* Décoratif : les noms des articles sont donnés en texte alternatif
          nul, la carte parle de la boutique, pas de ses produits. */}
      <div className={styles.preview} aria-hidden="true">
        {Array.from({ length: PREVIEW }, (_, index) => {
          const item = items[index];
          if (preview.isLoading) return <span key={index} className={styles.slotLoading} />;
          if (!item) return <span key={index} className={styles.slot} />;
          return (
            <span key={item.id} className={styles.thumb} title={productName(item)}>
              <Thumbnail src={productImage(item)} alt="" seed={item.id} />
            </span>
          );
        })}
      </div>

      <footer className={styles.foot}>
        <span className={styles.count}>
          {total === undefined
            ? preview.error
              ? "Articles indisponibles"
              : "…"
            : `${total} article${total > 1 ? "s" : ""}`}
        </span>
        <span className={styles.cta} aria-hidden="true">
          Voir la boutique →
        </span>
      </footer>
    </article>
  );
};
