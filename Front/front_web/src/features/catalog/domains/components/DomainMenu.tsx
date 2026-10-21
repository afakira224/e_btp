import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Famille } from "../../../../entities/taxonomy";
import { fetchFamilles, useResource } from "../../shared";
import { useHoverDisclosure } from "../hooks/useHoverDisclosure";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { filterFamilles } from "../model/filterFamilles";
import styles from "./DomainMenu.module.css";

/** Rayons montrés par catégorie avant le lien « + N rayons ». */
const RAYONS_VISIBLES = 6;

// ─────────────────────────────────────────────
//  DomainMenu — méga-menu « Domaine » de la navigation.
//
//  Pensé pour un gros catalogue (des dizaines de familles, des milliers de
//  rayons) : à gauche la liste des familles, filtrable et défilante ; à
//  droite seulement la famille active, ses catégories en cartes et leurs
//  premiers rayons. On ne rend jamais tout l'arbre d'un coup.
//
//  Survol, focus ou clic ouvrent le panneau (useHoverDisclosure) ; dans la
//  liste, le survol et les flèches changent la famille active, Entrée
//  l'ouvre. Sur petit écran, on avance en deux temps : la liste, puis la
//  famille choisie, avec un retour.
//
//  C'est une *disclosure* de liens, pas un `role="menu"` ARIA : un menu de
//  site n'a pas à imposer la navigation aux flèches d'une barre de menus.
// ─────────────────────────────────────────────
export const DomainMenu = () => {
  const panelId = useId();
  const { isOpen, close, toggle, containerRef, triggerRef, hoverProps, focusProps } =
    useHoverDisclosure();

  return (
    <div ref={containerRef} className={styles.wrapper} {...hoverProps} {...focusProps}>
      <button
        ref={triggerRef}
        type="button"
        className={[styles.trigger, isOpen ? styles.triggerOpen : ""].filter(Boolean).join(" ")}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggle}
      >
        Domaine
        <span className={[styles.chevron, isOpen ? styles.chevronOpen : ""].filter(Boolean).join(" ")} aria-hidden="true">
          ▼
        </span>
      </button>

      {/* Monté à l'ouverture seulement : filtre et famille active repartent
          de zéro à chaque fois. */}
      {isOpen ? <DomainPanel id={panelId} onNavigate={() => close(0)} /> : null}
    </div>
  );
};

const DomainPanel = ({ id, onNavigate }: { id: string; onNavigate: () => void }) => {
  const filterId = useId();
  const { data, isLoading, error } = useResource(fetchFamilles, []);
  const compact = useMediaQuery("(max-width: 1100px)");

  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  // Petit écran : la famille choisie s'affiche à la place de la liste.
  const [showDetail, setShowDetail] = useState(false);

  const visible = useMemo(() => filterFamilles(data, query), [data, query]);
  const active = visible.find((f) => f.id === activeId) ?? visible[0] ?? null;

  // Survol de la liste : un court délai évite que la famille active ne
  // change quand le pointeur traverse d'autres lignes pour rejoindre le
  // volet de droite.
  const hoverTimer = useRef<number | null>(null);
  const cancelHover = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  useEffect(() => cancelHover, []);
  const hoverFamille = (famille: string) => {
    cancelHover();
    hoverTimer.current = window.setTimeout(() => setActiveId(famille), 90);
  };

  const listRef = useRef<HTMLUListElement | null>(null);
  const itemOf = (famille: string) =>
    listRef.current?.querySelector<HTMLElement>(`[data-famille="${CSS.escape(famille)}"]`);

  const moveActive = (step: number) => {
    if (visible.length === 0) return;
    const index = active ? visible.indexOf(active) : -1;
    const next = visible[(index + step + visible.length) % visible.length]!;
    setActiveId(next.id);
    itemOf(next.id)?.scrollIntoView({ block: "nearest" });
  };

  const onFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      itemOf(active.id)?.click();
    }
  };

  return (
    <div id={id} className={[styles.panel, compact && showDetail ? styles.panelDetail : ""].filter(Boolean).join(" ")}>
      {error ? (
        <p className={styles.state}>Domaines indisponibles pour le moment.</p>
      ) : isLoading ? (
        <div className={styles.loading} aria-label="Chargement des domaines">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={styles.skeleton} />
          ))}
        </div>
      ) : (
        <>
          {/* ── Volet gauche : familles ───────────── */}
          <div className={styles.rail}>
            <div className={styles.filter}>
              <label htmlFor={filterId} className={styles.srOnly}>
                Filtrer les domaines
              </label>
              <span className={styles.filterIcon} aria-hidden="true">
                ⌕
              </span>
              <input
                id={filterId}
                className={styles.filterInput}
                type="search"
                value={query}
                placeholder={`Filtrer ${data.length} domaines…`}
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveId(null);
                }}
                onKeyDown={onFilterKeyDown}
              />
            </div>

            {visible.length === 0 ? (
              <p className={styles.empty}>Aucun domaine ni rayon ne correspond à « {query.trim()} ».</p>
            ) : (
              <ul ref={listRef} className={styles.familles} onMouseLeave={cancelHover}>
                {visible.map((famille) => {
                  const isActive = famille.id === active?.id;
                  const className = [styles.familleItem, isActive ? styles.familleActive : ""].filter(Boolean).join(" ");
                  const content = (
                    <>
                      <span className={styles.familleText}>
                        <span className={styles.familleName}>{famille.nom}</span>
                        <span className={styles.familleMeta}>
                          {famille.categories.length} catégorie{famille.categories.length > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className={styles.familleChevron} aria-hidden="true">
                        ›
                      </span>
                    </>
                  );
                  return (
                    <li key={famille.id}>
                      {compact ? (
                        // Petit écran : toucher une famille l'ouvre dans le panneau.
                        <button
                          type="button"
                          data-famille={famille.id}
                          className={className}
                          onClick={() => {
                            setActiveId(famille.id);
                            setShowDetail(true);
                          }}
                        >
                          {content}
                        </button>
                      ) : (
                        <Link
                          data-famille={famille.id}
                          to={`/familles/${famille.id}`}
                          className={className}
                          aria-current={isActive ? "true" : undefined}
                          onMouseEnter={() => hoverFamille(famille.id)}
                          onFocus={() => setActiveId(famille.id)}
                          onClick={onNavigate}
                        >
                          {content}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <Link className={styles.railFoot} to="/categories" onClick={onNavigate}>
              Tout le catalogue →
            </Link>
          </div>

          {/* ── Volet droit : la famille active ───── */}
          {active ? (
            <FamilleDetail famille={active} compact={compact} onBack={() => setShowDetail(false)} onNavigate={onNavigate} />
          ) : null}
        </>
      )}
    </div>
  );
};

const FamilleDetail = ({
  famille,
  compact,
  onBack,
  onNavigate,
}: {
  famille: Famille;
  compact: boolean;
  onBack: () => void;
  onNavigate: () => void;
}) => (
  <section className={styles.detail} aria-label={famille.nom}>
    {compact ? (
      <button type="button" className={styles.back} onClick={onBack}>
        ← Domaines
      </button>
    ) : null}

    <header className={styles.detailHead}>
      <div className={styles.detailTitle}>
        <h2 className={styles.detailName}>{famille.nom}</h2>
        {famille.description ? <p className={styles.detailDesc}>{famille.description}</p> : null}
      </div>
      <Link className={styles.detailLink} to={`/familles/${famille.id}`} onClick={onNavigate}>
        Voir le domaine →
      </Link>
    </header>

    {famille.categories.length === 0 ? (
      <p className={styles.state}>Ce domaine n'a pas encore de catégorie.</p>
    ) : (
      <div className={styles.categories}>
        {famille.categories.map((categorie) => {
          const rayons = categorie.sousCategories ?? [];
          const hidden = rayons.length - RAYONS_VISIBLES;
          return (
            <div key={categorie.id} className={styles.categorie}>
              <Link className={styles.categorieName} to={`/categories/${categorie.id}`} onClick={onNavigate}>
                {categorie.nom}
                <span className={styles.categorieCount}>{rayons.length}</span>
              </Link>
              {rayons.length > 0 ? (
                <ul className={styles.rayons}>
                  {rayons.slice(0, RAYONS_VISIBLES).map((rayon) => (
                    <li key={rayon.id}>
                      <Link className={styles.rayon} to={`/sous-categories/${rayon.id}`} onClick={onNavigate}>
                        {rayon.nom}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {hidden > 0 ? (
                <Link className={styles.more} to={`/categories/${categorie.id}`} onClick={onNavigate}>
                  + {hidden} rayon{hidden > 1 ? "s" : ""} →
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    )}
  </section>
);
