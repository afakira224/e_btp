import { validationResult, type ValidationChain } from "express-validator";

export interface ValidationOutcome {
  /** true si aucune règle n'a échoué */
  isValid: boolean;
  /** messages d'erreur (`withMessage`) dans l'ordre de déclaration */
  errors: string[];
  /** requête après passage des sanitizers (toInt, toDate, trim, ...) */
  req: Record<string, any>;
}

/**
 * Exécute une liste de ValidationChain express-validator sur une fausse requête
 * et renvoie le résultat, sans démarrer de serveur Express.
 */
export const runValidation = async (
  chains: ValidationChain[],
  init: {
    body?: Record<string, unknown>;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
  } = {}
): Promise<ValidationOutcome> => {
  const req: any = {
    body: init.body ?? {},
    params: init.params ?? {},
    query: init.query ?? {},
    headers: {},
    cookies: {},
  };

  for (const chain of chains) {
    await chain.run(req);
  }

  const result = validationResult(req);

  return {
    isValid: result.isEmpty(),
    errors: result.array().map((e) => String(e.msg)),
    req,
  };
};

/** ObjectId valide, utile pour satisfaire les règles `.isMongoId()`. */
export const VALID_OBJECT_ID = "507f1f77bcf86cd799439011";
