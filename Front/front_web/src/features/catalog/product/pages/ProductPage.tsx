import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Thumbnail } from "../../../../shared/ui";
import {
  categorieOf,
  discountPercent,
  familleOf,
  isNew,
  productDescription,
  productImage,
  productName,
  shopName,
  sousCategorieOf,
  type ProductBoutique,
} from "../../../../entities/product";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
} from "../../shared/components/CatalogPage";
import {
  fetchOffer,
  fetchRecentlyViewed,
  fetchShopOffers,
  fetchSuggestions,
  RatingStars,
  useResource,
} from "../../shared";
import { useAuth } from "../../../auth";
import { BuyBox } from "../components/BuyBox";
import { ProductStrip } from "../components/ProductStrip";
import styles from "../components/ProductDetail.module.css";

// ─────────────────────────────────────────────
//  Fiche produit.
//  L'identifiant de l'URL est celui de l'offre (`product_boutique`), pas
//  du produit : c'est l'offre qui porte le prix, le stock et la boutique.
//  Un même produit vendu par deux dépôts a deux fiches, avec deux prix.
// ─────────────────────────────────────────────
export const ProductPage = () => {
  const { offreId = "" } = useParams<{ offreId: string }>();

  const loadOffre = useCallback(
    (signal: AbortSignal) => fetchOffer(offreId, signal),
    [offreId]
  );
  const offre = useResource<ProductBoutique | null>(loadOffre, null, offreId);
  const item = offre.data;

  // Produits similaires : le back applique sa propre cascade de pertinence
  // (même sous-catégorie > catégorie > famille). On ne la réimplémente pas.
  const loadSimilaires = useCallback(
    (signal: AbortSignal) =>
      offreId ? fetchSuggestions(offreId, 8, signal) : Promise.resolve([]),
    [offreId]
  );
  const similaires = useResource<ProductBoutique[]>(loadSimilaires, [], offreId);

  // Autres articles du dépôt qui vend celui-ci.
  const boutiqueId = item?.boutique?.id ?? "";
  const loadDuDepot = useCallback(
    (signal: AbortSignal) =>
      boutiqueId ? fetchShopOffers(boutiqueId, signal) : Promise.resolve([]),
    [boutiqueId]
  );
  const duDepot = useResource<ProductBoutique[]>(loadDuDepot, [], boutiqueId);

  // Historique de consultation : la route exige une session, un visiteur
  // anonyme n'en a pas. Aucun repli local — ce serait une donnée que le
  // serveur ne connaîtrait pas.
  const { user } = useAuth();
  const userId = user?._id ?? "";
  const loadVus = useCallback(
    (signal: AbortSignal) =>
      userId ? fetchRecentlyViewed(userId, signal) : Promise.resolve([]),
    [userId]
  );
  const recemmentVus = useResource<ProductBoutique[]>(loadVus, [], `${userId}:${offreId}`);

  if (offre.error) {
    return (
      <CatalogPage>
        <CatalogHeader
          crumbs={[
            { label: "Accueil", to: "/" },
            { label: "Catalogue", to: "/categories" },
            { label: "Introuvable" },
          ]}
          eyebrow="Produit"
          title="Produit introuvable"
        />
        <EmptyState
          title="Ce produit n'existe pas"
          text={offre.error}
          action={{ to: "/categories", label: "Voir tous les domaines" }}
        />
      </CatalogPage>
    );
  }

  if (offre.isLoading || !item) {
    return (
      <CatalogPage>
        <CatalogHeader
          crumbs={[{ label: "Accueil", to: "/" }, { label: "Catalogue", to: "/categories" }]}
          eyebrow="Produit"
          title="…"
        />
        <CatalogSkeletons count={4} />
      </CatalogPage>
    );
  }

  // Remontée de la chaîne pour le fil d'Ariane.
  // La taxonomie est déjà imbriquée dans le DTO du produit : inutile de la
  // reconstituer depuis l'arbre des domaines.
  const categorie = categorieOf(item);
  const famille = familleOf(item);
  const sousCategorie = sousCategorieOf(item);

  const remise = discountPercent(item);

  // L'article courant n'a rien à faire dans ses propres suggestions, ni dans
  // l'historique affiché depuis sa propre fiche.
  const autresDuDepot = duDepot.data.filter((candidate) => candidate.id !== item.id);
  const historique = recemmentVus.data.filter((candidate) => candidate.id !== item.id);

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[
          { label: "Accueil", to: "/" },
          { label: "Catalogue", to: "/categories" },
          ...(famille ? [{ label: famille.nom, to: `/familles/${famille.id}` }] : []),
          ...(categorie
            ? [{ label: categorie.nom, to: `/categories/${categorie.id}` }]
            : []),
          ...(sousCategorie
            ? [{ label: sousCategorie.nom, to: `/sous-categories/${sousCategorie.id}` }]
            : []),
          { label: productName(item) },
        ]}
        eyebrow="Produit"
        title={productName(item)}
      />

      <div className={styles.layout}>
        <div className={styles.media}>
          <div className={styles.mediaMain}>
            <div className={styles.flags}>
              {remise !== null ? (
                <Badge tone="accent">{`−${remise} %`}</Badge>
              ) : null}
              {isNew(item) ? <Badge tone="neutral">Nouveau</Badge> : null}
            </div>
            <Thumbnail
              src={productImage(item)}
              alt={productName(item)}
              seed={item.id}
              ratio="wide"
            />
          </div>
        </div>

        <div className={styles.info}>
          <div>
            <span className={styles.shop}>
              Vendu par{" "}
              <Link to={`/boutiques/${item.boutique?.id ?? ""}`}>{shopName(item)}</Link>
            </span>
            <h2 className={styles.name}>{productName(item)}</h2>
          </div>

          {item.rating !== undefined ? (
            <div className={styles.rating}>
              <RatingStars value={item.rating} count={item.reviewsCount} />
            </div>
          ) : null}

          <BuyBox item={item} />

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>Description</h3>
            <p className={styles.description}>{productDescription(item)}</p>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>Caractéristiques</h3>
            <dl className={styles.specs}>
              <div className={styles.specRow}>
                <dt className={styles.specKey}>Référence</dt>
                <dd className={styles.specValue}>{item.id}</dd>
              </div>
              <div className={styles.specRow}>
                <dt className={styles.specKey}>Boutique</dt>
                <dd className={styles.specValue}>{shopName(item)}</dd>
              </div>
              {categorie ? (
                <div className={styles.specRow}>
                  <dt className={styles.specKey}>Catégorie</dt>
                  <dd className={styles.specValue}>{categorie.nom}</dd>
                </div>
              ) : null}
              {sousCategorie ? (
                <div className={styles.specRow}>
                  <dt className={styles.specKey}>Sous-catégorie</dt>
                  <dd className={styles.specValue}>{sousCategorie.nom}</dd>
                </div>
              ) : null}
              {item.tags.length > 0 ? (
                <div className={styles.specRow}>
                  <dt className={styles.specKey}>Mots-clés</dt>
                  <dd className={styles.specValue}>
                    <span className={styles.tags}>
                      {item.tags.map((tag: string) => (
                        <Badge key={tag} tone="muted">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>

      <ProductStrip
        title="Produits similaires"
        note="Même sous-catégorie en priorité, puis même catégorie, puis même domaine."
        items={similaires.data}
        isLoading={similaires.isLoading}
        {...(sousCategorie
          ? {
              moreTo: `/sous-categories/${sousCategorie.id}`,
              moreLabel: `Toute la sous-catégorie ${sousCategorie.nom}`,
            }
          : {})}
      />

      <ProductStrip
        title={`Autres articles de ${shopName(item)}`}
        items={autresDuDepot}
        isLoading={duDepot.isLoading}
        {...(item.boutique ? { moreTo: `/boutiques/${item.boutique.id}` } : {})}
      />

      <ProductStrip
        title="Récemment vus"
        note="Votre historique de consultation, le plus récent en tête."
        items={historique}
        isLoading={recemmentVus.isLoading}
      />
    </CatalogPage>
  );
};
