/**
 * Forme de comparaison : minuscules, sans accents ni espaces superflus.
 * « Électricité » et « electricite » doivent se retrouver — personne ne
 * tape les accents dans une barre de recherche.
 */
export const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Découpe `text` autour de la première occurrence de `query`, en ignorant
 * accents et casse. La NFD ne change pas la longueur des lettres de base
 * une fois les diacritiques retirés un par un : on compare caractère par
 * caractère pour garder les index du texte d'origine.
 */
export const splitMatch = (
  text: string,
  query: string
): { before: string; match: string; after: string } | null => {
  const needle = normalize(query);
  if (!needle) return null;

  const folded = [...text].map((char) =>
    char.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  );
  const haystack = folded.join("");
  const start = haystack.indexOf(needle);
  if (start < 0) return null;

  // Ramène l'index du texte replié à celui du texte d'origine.
  let consumed = 0;
  let from = -1;
  let to = -1;
  folded.forEach((piece, index) => {
    if (from < 0 && consumed >= start) from = index;
    consumed += piece.length;
    if (to < 0 && consumed >= start + needle.length) to = index + 1;
  });
  if (from < 0 || to < 0) return null;

  const chars = [...text];
  return {
    before: chars.slice(0, from).join(""),
    match: chars.slice(from, to).join(""),
    after: chars.slice(to).join(""),
  };
};
