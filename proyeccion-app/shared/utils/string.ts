/**
 * Utilidades para manejo de strings
 * Centraliza todas las funciones de transformación y validación de strings
 */

/**
 * Sanitiza un ID de cine para usar en Firestore
 * Convierte a minúsculas, elimina acentos, espacios y caracteres especiales
 */
export function sanitizeCineId(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-_]/g, "");
}

/**
 * Capitaliza la primera letra de un string
 */
export function capitalize(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Convierte un string a formato de título (primera letra de cada palabra en mayúscula)
 */
export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");
}

/**
 * Trunca un string a una longitud máxima y agrega "..." si es necesario
 */
export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength - 3) + "...";
}

/**
 * Normaliza un string para búsqueda (minúsculas, sin acentos)
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Valida si un email tiene formato válido
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extrae el nombre de usuario de un email (parte antes del @)
 */
export function getUsernameFromEmail(email: string): string {
  return email.split("@")[0] || "";
}

/**
 * Genera un slug a partir de un string (para URLs)
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}
