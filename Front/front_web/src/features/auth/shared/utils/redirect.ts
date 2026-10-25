import { EntityType, type User } from "../../../../entities/user";

/** `state` posé par AuthGuard en renvoyant vers /login. */
interface FromState {
  from?: { pathname?: string; search?: string };
}

/**
 * Sans page demandée, chacun arrive là où il travaille : le gérant dans sa
 * boutique, l'administration devant les demandes à examiner, le client sur
 * l'accueil.
 */
export const homeOf = (user: User): string => {
  if (user.role === EntityType.SHOP) return "/ma-boutique";
  if (user.role === EntityType.ADMIN) return "/admin";
  return "/";
};

/**
 * Où aller une fois connecté : la page demandée avant la redirection vers
 * /login, sinon `fallback` (l'accueil du compte par défaut ; l'espace boutique
 * depuis sa propre page de connexion). useLogin et GuestGuard doivent viser la
 * même destination : à la connexion, les deux naviguent dans le même rendu,
 * et c'est le dernier qui gagne.
 */
export const afterLoginPath = (state: unknown, user: User, fallback?: string): string => {
  const from = (state as FromState | null)?.from;
  return from?.pathname ? `${from.pathname}${from.search ?? ""}` : (fallback ?? homeOf(user));
};
