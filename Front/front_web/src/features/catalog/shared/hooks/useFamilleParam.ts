import { useSearchParams } from "react-router-dom";

export const FAMILLE_PARAM = "famille";

/** Domaine filtré, lu dans l'URL : la sélection reste partageable. */
export const useFamilleParam = (): string | undefined => {
  const [params] = useSearchParams();
  return params.get(FAMILLE_PARAM) ?? undefined;
};
