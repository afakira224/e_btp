import { useEffect, useId, useState } from "react";
import type { Product } from "../../../../entities/product";
import { Input } from "../../../../shared/ui";
import { searchCatalogProducts } from "../../shared";
import styles from "./ProductPicker.module.css";

interface ProductPickerProps {
  value: string;
  onChange: (productId: string) => void;
  onBlur: () => void;
  error?: string | undefined;
}

// ─────────────────────────────────────────────
//  Choix de la fiche produit.
//  Une boutique ne crée pas de fiche : elle met en vente une fiche du
//  catalogue (GET /products), avec son prix, son stock et sa livraison.
// ─────────────────────────────────────────────
export const ProductPicker = ({ value, onChange, onBlur, error }: ProductPickerProps) => {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const errorId = useId();

  useEffect(() => {
    const controller = new AbortController();
    // Une requête par pause de frappe, pas par touche.
    const timer = window.setTimeout(() => {
      // oxlint-disable-next-line react/set-state-in-effect
      setIsLoading(true);
      void searchCatalogProducts(search, controller.signal)
        .then((products) => {
          if (!controller.signal.aborted) setResults(products);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const pick = (product: Product) => {
    setSelected(product);
    onChange(product.id);
  };

  return (
    <div className={styles.picker} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur();
    }}>
      <Input
        label="Produit du catalogue"
        type="search"
        placeholder="Ciment, câble, carrelage…"
        value={search}
        hint="Recherchez la fiche du produit que vous mettez en vente."
        onChange={(event) => setSearch(event.target.value)}
      />

      {selected && value === selected.id ? (
        <p className={styles.selected}>
          Sélectionné : <strong>{selected.name}</strong>
        </p>
      ) : null}

      <div
        className={styles.results}
        role="radiogroup"
        aria-label="Résultats du catalogue"
        aria-describedby={error ? errorId : undefined}
        aria-busy={isLoading}
      >
        {results.length === 0 ? (
          <p className={styles.empty}>{isLoading ? "Recherche…" : "Aucun produit ne correspond."}</p>
        ) : (
          results.map((product) => (
            <label key={product.id} className={styles.result}>
              <input
                type="radio"
                name="productId"
                value={product.id}
                checked={value === product.id}
                onChange={() => pick(product)}
              />
              <span className={styles.name}>{product.name}</span>
              <span className={styles.category}>{product.categories[0]?.nom ?? ""}</span>
            </label>
          ))
        )}
      </div>

      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};
