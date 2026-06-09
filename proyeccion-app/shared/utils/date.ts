/**
 * Utilidades para manejo de fechas y horas
 * Centraliza todas las funciones de formateo y parseo de fechas
 */

/**
 * Formatea una fecha para input type="date" (YYYY-MM-DD)
 */
export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formatea una hora para input type="time" (HH:mm)
 */
export function formatTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Parsea un string de fecha en formato YYYY-MM-DD
 * @returns Date o null si el formato es inválido
 */
export function parseWebDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  const date = new Date();
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);

  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parsea un string de hora en formato HH:mm
 * @returns Objeto con h y min, o null si el formato es inválido
 */
export function parseWebTime(value: string): { h: number; min: number } | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const h = Number(match[1]);
  const min = Number(match[2]);

  if (h < 0 || h > 23 || min < 0 || min > 59) return null;

  return { h, min };
}

/**
 * Formatea una hora en formato corto (HH:mm)
 */
export function horaCorta(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Crea una fecha para hoy a una hora específica
 */
export function todayAt(hour: number, minute: number = 0): Date {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

/**
 * Convierte un valor de Firestore Timestamp a Date
 */
export function toDate(value: any): Date {
  return value?.toDate ? value.toDate() : new Date(value);
}

/**
 * Formatea una fecha completa en español
 * Ejemplo: "lunes, 15 de marzo"
 */
export function formatFechaCompleta(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Normaliza una hora en formato HH:mm:ss
 * @returns String normalizado o null si es inválido
 */
export function normalizeHHMMSS(input: string): string | null {
  const parts = input.trim().split(":");
  if (parts.length !== 3) return null;

  const [hStr, mStr, sStr] = parts;
  const h = Number(hStr);
  const m = Number(mStr);
  const s = Number(sStr);

  if (
    [h, m, s].some(Number.isNaN) ||
    m < 0 ||
    m > 59 ||
    s < 0 ||
    s > 59 ||
    h < 0
  ) {
    return null;
  }

  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/**
 * Agrega cero a la izquierda si el número es menor a 10
 */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Convierte una fecha a formato YYYY-MM-DD local
 */
export function toLocalYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Obtiene el rango de fechas de un mes específico
 */
export function monthRange(year: number, month1_12: number) {
  const start = new Date(year, month1_12 - 1, 1, 0, 0, 0, 0);
  const next = new Date(year, month1_12, 1, 0, 0, 0, 0);
  const startStr = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-01`;
  const nextStr = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01`;
  
  return { start, next, startStr, nextStr };
}
