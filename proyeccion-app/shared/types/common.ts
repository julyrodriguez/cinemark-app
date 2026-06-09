/**
 * Tipos comunes compartidos en toda la aplicación
 */

export type ID = string;

/**
 * Documento base con campos comunes de Firestore
 */
export interface BaseDoc {
  id?: ID;
  createdAt?: any; // Firestore Timestamp
  createdBy?: string;
  createdName?: string;
}

/**
 * Resultado de operaciones que pueden fallar
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Estado de carga genérico
 */
export type LoadingState<T> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "success"; data: T }
  | { state: "error"; error: string };

/**
 * Opciones de paginación
 */
export interface PaginationOptions {
  pageSize?: number;
  startAfter?: any;
}

/**
 * Resultado paginado
 */
export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  lastDoc?: any;
}

/**
 * Opciones de búsqueda
 */
export interface SearchOptions {
  query: string;
  limit?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
}

/**
 * Roles de usuario
 */
export type UserRole = "admin" | "oficinas" | "cine";

/**
 * Información de sesión de usuario
 */
export interface UserSession {
  uid: string;
  email: string | null;
  displayName: string;
  role: UserRole;
  cineId?: string;
}
