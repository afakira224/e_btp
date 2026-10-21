// ─────────────────────────────────────────────
//  Erreur d'API : porte le code HTTP en plus du message.
//  Les hooks s'en servent pour distinguer 401 (session absente),
//  409 (email déjà pris) ou 422 (validation) sans parser le texte.
// ─────────────────────────────────────────────
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }
}
