import { Alert, Button } from "../../../../shared/ui";
import { Section } from "../../../home/shared";
import {
  fetchRecommended,
  ProductCard,
  useInfiniteProducts,
  useSentinel,
} from "../../shared";
import styles from "./RecommendedSection.module.css";

const PAGE_SIZE = 8;

export const RecommendedSection = () => {
  const { items, isLoading, error, hasMore, total, loadMore, retry } =
    useInfiniteProducts(fetchRecommended, { pageSize: PAGE_SIZE });

  // L'observateur se tait pendant un chargement ou après une erreur :
  // sans cela, une panne réseau déclencherait une rafale de requêtes.
  const sentinelRef = useSentinel(loadMore, {
    enabled: hasMore && !isLoading && !error,
    dependency: items.length,
  });

  const firstLoad = isLoading && items.length === 0;

  return (
    <Section
      eyebrow="Sélection pour vous"
      title="Produits que vous aimerez aussi"
      isLoading={firstLoad}
      skeleton={{ count: PAGE_SIZE, height: 330, columns: "repeat(6, 1fr)" }}
    >
      <div className={styles.grid}>
        {items.map((item) => (
          <ProductCard key={item.id} item={item} />
        ))}

        {/* Les blocs d'attente prolongent la grille pendant le chargement
            de la page suivante, à la place exacte des vignettes à venir. */}
        {isLoading && items.length > 0
          ? Array.from({ length: PAGE_SIZE }, (_, index) => (
              <div key={`attente-${index}`} className={styles.skeleton} aria-hidden="true" />
            ))
          : null}
      </div>

      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />

      <div className={styles.foot}>
        {/* Le compteur est annoncé poliment : un lecteur d'écran doit savoir
            que la liste s'est allongée, sans être interrompu. */}
        <span className={styles.counter} role="status" aria-live="polite">
          {total > 0 ? `${items.length} sur ${total} références` : ""}
        </span>

        {error ? (
          <>
            <Alert tone="danger">{error}</Alert>
            <Button variant="secondary" onClick={retry}>
              Réessayer
            </Button>
          </>
        ) : hasMore ? (
          // Le bouton double le défilement automatique plutôt que de le
          // remplacer : au clavier, rien ne permet de « faire défiler pour
          // charger », et la liste serait sinon impossible à parcourir.
          <Button variant="secondary" onClick={loadMore} isLoading={isLoading}>
            Charger plus de produits
          </Button>
        ) : items.length > 0 ? (
          <p className={styles.end}>
            Vous avez parcouru l'ensemble de la sélection.
          </p>
        ) : null}
      </div>
    </Section>
  );
};
