/**
 * Constantes compartidas en toda la aplicación
 * Centraliza arrays, configuraciones y valores constantes
 */

/**
 * Nombres completos de los días de la semana en español
 */
export const DIAS_SEMANA_FULL = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

/**
 * Nombres cortos de los días de la semana en español
 */
export const DIAS_SEMANA_SHORT = [
  "Dom",
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
] as const;

/**
 * Nombres abreviados de los meses en español
 */
export const MESES_ABBR = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/**
 * Nombres completos de los meses en español
 */
export const MESES_FULL = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/**
 * Emails de administradores del sistema
 */
export const ADMIN_EMAILS = [
  "cinemarkproyecto@equipo.local"
] as const;

/**
 * Configuración de paginación por defecto
 */
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
} as const;

/**
 * Timeouts para operaciones
 */
export const TIMEOUTS = {
  IP_CHECK_MS: 10000,
  DEFAULT_DEBOUNCE_MS: 300,
  SEARCH_DEBOUNCE_MS: 300,
} as const;

/**
 * Configuración de métricas
 */
export const METRICS_CONFIG = {
  FLUSH_INTERVAL_MS: 10000, // 10 segundos para desarrollo, cambiar a 60000 en producción
  BATCH_SIZE: 100,
} as const;

/**
 * Tipos de calendario
 */
export const CALENDAR_TYPES = {
  TTA: "TTA",
  MTM: "MTM",
  EVENTO: "EVENTO",
  ESPECIAL: "Especial",
} as const;

/**
 * Colores para tipos de calendario
 */
export const CALENDAR_TYPE_COLORS = {
  tta: "#3b82f6",
  mtm: "#ef4444",
  evento: "#10b981",
  especial: "#a855f7",
} as const;

/**
 * Estados de RMA
 */
export const RMA_ESTADOS = {
  ABIERTO: "abierto",
  EN_PROGRESO: "en_progreso",
  CERRADO: "cerrado",
} as const;

/**
 * Prioridades de RMA
 */
export const RMA_PRIORIDADES = {
  BAJA: "baja",
  MEDIA: "media",
  ALTA: "alta",
} as const;

/**
 * Tipos de IP autorizadas
 */
export const IP_TYPES = {
  FIXED: "fixed",
  MOBILE: "mobile",
} as const;
