export class BaseResponse<T = null> {
  success: boolean;
  message: string;
  statusCode: number;
  data: T | null;

  constructor(success: boolean, message: string, statusCode: number, data: T | null = null) {
    this.success = success;
    this.message = message;
    this.statusCode = statusCode;
    this.data = data;
  }

  static WithSuccess<T>(data: T | null = null, message = "Opération réussie"): BaseResponse<T> {
    return new BaseResponse<T>(true, message, 200, data);
  }

  static Created<T>(data: T | null = null, message = "Ressource créée avec succès"): BaseResponse<T> {
    return new BaseResponse<T>(true, message, 201, data);
  }

  static NotFound(message = "Ressource introuvable"): BaseResponse<null> {
    return new BaseResponse(false, message, 404, null);
  }

  static BadRequest(message = "Requête invalide"): BaseResponse<null> {
    return new BaseResponse(false, message, 400, null);
  }

  static UnAuthorized(message = "Authentification requise ou invalide"): BaseResponse<null> {
    return new BaseResponse(false, message, 401, null);
  }

  static Forbidden(message = "Accès refusé, vous n'avez pas les permissions nécessaires"): BaseResponse<null> {
    return new BaseResponse(false, message, 403, null);
  }

  static Conflict(message = "Conflit : la ressource existe déjà"): BaseResponse<null> {
    return new BaseResponse(false, message, 409, null);
  }

  static ServerError(message = "Erreur interne du serveur"): BaseResponse<null> {
    return new BaseResponse(false, message, 500, null);
  }
}

export default BaseResponse;
