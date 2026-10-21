import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SEARCH_PATH, searchUrl, useRecentSearches, type Suggestion } from "../../shared";
import { useAutocomplete } from "../hooks/useAutocomplete";
import { SuggestionPanel } from "./SuggestionPanel";
import styles from "./SearchBar.module.css";

const TAXONOMY_PATH = {
  famille: "/familles",
  categorie: "/categories",
  sousCategorie: "/sous-categories",
} as const;

/** Destination d'une suggestion : chaque origine mène à sa propre page. */
const destination = (suggestion: Suggestion): string => {
  switch (suggestion.kind) {
    case "product":
      return `/produits/${suggestion.id}`;
    case "taxonomy":
      return `${TAXONOMY_PATH[suggestion.level]}/${suggestion.id}`;
    case "recent":
    case "all":
      return searchUrl(suggestion.label);
  }
};

/** Un champ de saisie a déjà l'usage de « / » : on ne le lui vole pas. */
const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

// ─────────────────────────────────────────────
//  SearchBar
//
//  Motif ARIA « combobox » avec liste : le focus reste dans le champ, les
//  flèches déplacent une sélection virtuelle (`aria-activedescendant`),
//  Entrée ouvre la suggestion active ou lance la recherche, Échap referme
//  puis vide le champ.
//
//  Sur la page de résultats, le champ reprend le texte de l'URL : la
//  barre et la page parlent de la même recherche.
// ─────────────────────────────────────────────
export const SearchBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { remember, clear } = useRecentSearches();

  const inputId = useId();
  const listboxId = useId();
  const statusId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const urlQuery = location.pathname === SEARCH_PATH ? (params.get("q") ?? "") : "";
  const [value, setValue] = useState(urlQuery);
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // Suivre l'URL sans effet : on ajuste l'état pendant le rendu quand la
  // recherche change ailleurs (bouton Précédent, lien partagé).
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  const { query, suggestions, isTyping, isLoading, error, isEmpty } = useAutocomplete(
    value,
    isOpen
  );

  // La sélection active n'a de sens que pour la liste qui l'a vue naître.
  const [lastSuggestions, setLastSuggestions] = useState(suggestions);
  if (suggestions !== lastSuggestions) {
    setLastSuggestions(suggestions);
    setActive(-1);
  }

  // Raccourci « / » : la recherche est l'outil principal d'un catalogue.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditable(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setIsOpen(false);
    setActive(-1);
  };

  const go = (to: string, term?: string) => {
    if (term) remember(term);
    close();
    // Sur mobile, le clavier virtuel masquerait la page d'arrivée.
    inputRef.current?.blur();
    navigate(to);
  };

  const select = (suggestion: Suggestion) => {
    // Seule une recherche textuelle entre dans l'historique : ouvrir une
    // fiche produit depuis la liste n'est pas « chercher ce produit ».
    const term = suggestion.kind === "recent" || suggestion.kind === "all" ? suggestion.label : query;
    go(destination(suggestion), term);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    go(searchUrl(query), query);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = suggestions.length;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        if (count > 0) setActive((current) => (current + 1) % count);
        return;
      case "ArrowUp":
        event.preventDefault();
        if (count > 0) setActive((current) => (current <= 0 ? count - 1 : current - 1));
        return;
      case "Enter": {
        // Géré ici plutôt que laissé à la soumission implicite du
        // formulaire : pendant une composition IME, Entrée valide le mot
        // et ne doit rien lancer.
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        const chosen = isOpen && active >= 0 ? suggestions[active] : undefined;
        if (chosen) select(chosen);
        else go(searchUrl(query), query);
        return;
      }
      case "Escape":
        if (isOpen) {
          event.preventDefault();
          close();
        } else if (value) {
          event.preventDefault();
          setValue("");
        }
        return;
      case "Tab":
        close();
        return;
      default:
        return;
    }
  };

  // Le panneau se ferme quand le focus quitte *tout* le composant — pas
  // quand il passe du champ au bouton « Effacer » du panneau.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) close();
  };

  const hasPanelContent = suggestions.length > 0 || isLoading || isEmpty || error !== null;
  const expanded = isOpen && hasPanelContent;
  const activeId = active >= 0 ? `${listboxId}-${active}` : undefined;

  const status = !isOpen
    ? ""
    : isLoading && suggestions.length === 0
      ? "Recherche en cours…"
      : isEmpty
        ? `Aucune suggestion pour « ${query} ».`
        : suggestions.length > 0
          ? `${suggestions.length} suggestion${suggestions.length > 1 ? "s" : ""}, flèches pour parcourir.`
          : "";

  return (
    <div ref={wrapperRef} className={styles.wrapper} onBlur={onBlur}>
      <form role="search" className={styles.form} onSubmit={onSubmit}>
        <label htmlFor={inputId} className={styles.visuallyHidden}>
          Rechercher un produit, une marque, un rayon
        </label>

        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          type="search"
          value={value}
          placeholder="Ciment, carrelage, perforateur…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={expanded ? activeId : undefined}
          aria-describedby={statusId}
          onChange={(event) => {
            setValue(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
        />

        {value ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Effacer la recherche"
            onClick={() => {
              setValue("");
              setIsOpen(true);
              inputRef.current?.focus();
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : (
          <kbd className={styles.kbd} aria-hidden="true">
            /
          </kbd>
        )}

        <button type="submit" className={styles.submit} aria-label="Lancer la recherche">
          <span aria-hidden="true">⌕</span>
        </button>
      </form>

      <span id={statusId} className={styles.visuallyHidden} role="status" aria-live="polite">
        {status}
      </span>

      <SuggestionPanel
        isOpen={expanded}
        listboxId={listboxId}
        query={query}
        suggestions={suggestions}
        active={active}
        isTyping={isTyping}
        isLoading={isLoading}
        isEmpty={isEmpty}
        error={error}
        onHover={setActive}
        onSelect={select}
        onClearRecent={() => {
          clear();
          inputRef.current?.focus();
        }}
      />
    </div>
  );
};
