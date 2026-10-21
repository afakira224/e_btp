import { Section } from "../../../home/shared";
import { fetchNewArrivals, ProductCard, useResource } from "../../shared";
import styles from "./NewArrivalsSection.module.css";

/** Nombre de vignettes affichées : une rangée pleine sur grand écran. */
const LIMIT = 6;

export const NewArrivalsSection = () => {
  const { data, isLoading, error } = useResource(fetchNewArrivals, []);
  const items = data.slice(0, LIMIT);

  return (
    <Section
      eyebrow="Derniers arrivages"
      title="Nouveautés du catalogue"
      moreTo="/nouveautes"
      isLoading={isLoading}
      error={error}
      skeleton={{ count: LIMIT, height: 330, columns: "repeat(6, 1fr)" }}
    >
      {items.length === 0 ? (
        <p className={styles.empty}>Aucun arrivage sur les trente derniers jours.</p>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <ProductCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </Section>
  );
};
