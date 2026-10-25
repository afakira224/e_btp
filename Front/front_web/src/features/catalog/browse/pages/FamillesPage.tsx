import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert } from "../../../../shared/ui";
import { filterFamilles, fold } from "../../domains/model/filterFamilles";
import {
  CatalogHeader,
  CatalogPage,
  CatalogSkeletons,
  EmptyState,
} from "../../shared/components/CatalogPage";
import { fetchFamilles, useResource } from "../../shared";
import { CategorieTile, CategorieTiles } from "../components/CategorieTile";
import styles from "./FamillesPage.module.css";

// ─────────────────────────────────────────────
//  Racine du catalogue : un navigateur à deux volets.
//  À gauche les domaines (filtrables), à droite les catégories du domaine
//  choisi, chacune avec ses premiers rayons. Le domaine choisi est dans
//  l'URL (?domaine=) : retour arrière et lien partagé le retrouvent.
//
//  Avec une centaine de domaines et des milliers de rayons, tout afficher
//  d'un coup noyait l'essentiel : on montre un domaine à la fois.
// ─────────────────────────────────────────────

export const FamillesPage = () => {
  const { data, isLoading, error } = useResource(fetchFamilles, []);
  const [params, setParams] = useSearchParams();
  const [filtre, setFiltre] = useState("");
  const listeRef = useRef<HTMLElement>(null);

  const recherche = fold(filtre);
  // Même filtre que le menu « Domaine » : nom, catégories et rayons.
  const visibles = useMemo(() => filterFamilles(data, filtre), [data, filtre]);
  const nbCategories = data.reduce((total, famille) => total + famille.categories.length, 0);

  // Le domaine demandé s'il est visible, sinon le premier de la liste.
  const demande = params.get("domaine");
  const actif = visibles.find((f) => f.id === demande) ?? visibles[0];

  // Le domaine choisi reste visible dans sa liste : verticale sur ordinateur,
  // bande horizontale sur téléphone. Seule la liste défile, jamais la page.
  const actifId = actif?.id;
  useEffect(() => {
    const liste = listeRef.current;
    const bouton = liste?.querySelector<HTMLElement>("[aria-current]");
    if (!liste || !bouton) return;
    const l = liste.getBoundingClientRect();
    const b = bouton.getBoundingClientRect();
    // La bande du téléphone est en flex ; la liste de l'ordinateur en grille.
    const horizontale = getComputedStyle(liste).display === "flex";
    liste.scrollTo(
      horizontale
        ? { left: liste.scrollLeft + b.left - l.left - (l.width - b.width) / 2 }
        : { top: liste.scrollTop + b.top - l.top - (l.height - b.height) / 2 }
    );
  }, [actifId]);

  const choisir = (id: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("domaine", id);
        return next;
      },
      { replace: true }
    );

  // Le filtre s'applique aussi aux catégories du domaine affiché, sauf
  // quand c'est le domaine lui-même qui correspond.
  const categories = actif
    ? actif.categories.filter(
        (c) =>
          !recherche ||
          fold(actif.nom).includes(recherche) ||
          fold(c.nom).includes(recherche) ||
          (c.sousCategories ?? []).some((s) => fold(s.nom).includes(recherche))
      )
    : [];

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={[{ label: "Accueil", to: "/" }, { label: "Catalogue" }]}
        eyebrow="Parcourir"
        title="Catalogue"
        lede="Choisissez un domaine, puis une catégorie ou directement un rayon."
        {...(isLoading || error
          ? {}
          : { count: data.length, countLabel: `domaines · ${nbCategories} catégories` })}
      />

      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : isLoading ? (
        <CatalogSkeletons count={4} />
      ) : data.length === 0 ? (
        <EmptyState
          title="Catalogue vide"
          text="Aucun domaine n'est publié pour le moment."
          action={{ to: "/", label: "Retour à l'accueil" }}
        />
      ) : (
        <div className={styles.layout}>
          <aside className={styles.side} aria-label="Domaines">
            <input
              className={styles.filtre}
              type="search"
              value={filtre}
              onChange={(event) => setFiltre(event.target.value)}
              placeholder="Filtrer : carrelage, câble…"
              aria-label="Filtrer les domaines et catégories"
            />
            <nav ref={listeRef} className={styles.domaines}>
              {visibles.map((famille) => (
                <button
                  key={famille.id}
                  type="button"
                  className={[styles.domaine, famille.id === actif?.id ? styles.domaineActif : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={famille.id === actif?.id ? "true" : undefined}
                  onClick={() => choisir(famille.id)}
                >
                  <span className={styles.domaineNom}>{famille.nom}</span>
                  <span className={styles.domaineCount}>{famille.categories.length}</span>
                </button>
              ))}
            </nav>
            {visibles.length === 0 ? <p className={styles.vide}>Aucun domaine ne correspond.</p> : null}
          </aside>

          {actif ? (
            <section className={styles.panel} aria-labelledby="domaine-actif">
              <header className={styles.panelHead}>
                <div>
                  <h2 id="domaine-actif" className={styles.panelTitre}>
                    {actif.nom}
                  </h2>
                  {actif.description ? <p className={styles.panelDesc}>{actif.description}</p> : null}
                </div>
                <Link className={styles.panelLien} to={`/familles/${actif.id}`}>
                  Voir tout le domaine →
                </Link>
              </header>

              <CategorieTiles>
                {categories.map((categorie) => (
                  <CategorieTile key={categorie.id} categorie={categorie} />
                ))}
              </CategorieTiles>
            </section>
          ) : null}
        </div>
      )}
    </CatalogPage>
  );
};
