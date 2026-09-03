// lib/programacion/creditosMatcher.ts

export interface CreditoItem {
  id?: string;
  pelicula: string;
  horaCredito: string; // HH:mm:ss o HH:mm
  horaApaga1?: string | null;
  horaPrende1?: string | null;
  horaApaga2?: string | null;
  horaPrende2?: string | null;
}

/**
 * Normaliza el título de una película para matching robusto:
 * - Pasa a minúsculas y elimina tildes/acentos
 * - Elimina viñetas, caracteres iniciales
 * - Elimina texto entre paréntesis o corchetes (ej: clasificaciones, distribuidoras)
 * - Elimina formatos de cine (2D, 3D, 4D, XD, IMAX, ATMOS, D-BOX, SCREENX, etc.)
 * - Elimina idiomas/versiones (CAS, CAST, SUB, SUBS, DOB, DOBLADA, ESP, ORIG, LAT, etc.)
 * - Elimina calificaciones sueltas (ATP, SAM13, SAM16, SAM18, +13, +16, etc.)
 * - Limpia puntuación y colapsa espacios múltiples
 */
export function normalizeForMovieMatch(rawTitle: string): string {
  if (!rawTitle) return "";
  let t = rawTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin acentos
    .toLowerCase()
    .trim();

  // Eliminar viñetas y numeración inicial
  t = t.replace(/^[•\-\*\d\.\s]+/, "");

  // Eliminar texto entre paréntesis y corchetes (calificaciones, notas)
  t = t.replace(/\([^)]*\)/g, " ");
  t = t.replace(/\[[^\]]*\]/g, " ");

  // Eliminar calificaciones habituales
  t = t.replace(
    /\b(atp|atpr|pg|pg13|r|c13|c16|c18|s13|s16|s18|s13r|s16r|s18r|sam13|sam16|sam18|sam13r|sam16r|sam18r)\b/gi,
    " "
  );
  t = t.replace(/\+\s*(13|16|18)\b/gi, " ");
  t = t.replace(/\b(apta?|apto|todo publico|todo público)\b/gi, " ");

  // Eliminar formatos de proyección y tecnologías
  t = t.replace(
    /\b(2d|3d|4d|xd|imax|atmos|atmoss|atmós|dbox|d-box|screenx|laser|plf|hfr|macro)\b/gi,
    " "
  );

  // Eliminar idiomas y doblajes
  t = t.replace(
    /\b(cas|cast|castellano|sub|subs|subt|subtitulado|subtitulada|dob|doblada|doblado|esp|espanol|español|orig|original|vose|lat|latino)\b/gi,
    " "
  );

  // Reemplazar puntuación por espacios
  t = t.replace(/[^a-z0-9\s]/g, " ");

  // Normalizar números romanos comunes en secuelas a dígitos
  t = t.replace(/\bviii\b/g, "8");
  t = t.replace(/\bvii\b/g, "7");
  t = t.replace(/\bvi\b/g, "6");
  t = t.replace(/\biv\b/g, "4");
  t = t.replace(/\bix\b/g, "9");
  t = t.replace(/\biii\b/g, "3");
  t = t.replace(/\bii\b/g, "2");
  t = t.replace(/\bv\b/g, "5");
  t = t.replace(/\bx\b/g, "10");

  // Colapsar espacios
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

/**
 * Busca en la lista de créditos cargados la mejor coincidencia para una película de la programación.
 * Aplica estrategia jerárquica:
 * 1. Coincidencia exacta de títulos limpios
 * 2. Coincidencia por inclusión / subcadena
 * 3. Coincidencia por conjunto de tokens (similitud Dice > 0.6)
 */
export function findMatchingCredito(
  progMovieTitle: string,
  creditosList: CreditoItem[]
): CreditoItem | null {
  if (!progMovieTitle || !creditosList || creditosList.length === 0) return null;

  const normProg = normalizeForMovieMatch(progMovieTitle);
  if (!normProg) return null;

  // 1. Coincidencia exacta limpia
  for (const cred of creditosList) {
    const normCred = normalizeForMovieMatch(cred.pelicula);
    if (normProg === normCred) {
      return cred;
    }
  }

  // 2. Subcadena / inclusión (priorizando la más larga)
  let bestSubMatch: { cred: CreditoItem; len: number } | null = null;
  for (const cred of creditosList) {
    const normCred = normalizeForMovieMatch(cred.pelicula);
    if (!normCred) continue;
    if (normProg.includes(normCred) || normCred.includes(normProg)) {
      const matchLen = Math.min(normProg.length, normCred.length);
      if (!bestSubMatch || matchLen > bestSubMatch.len) {
        bestSubMatch = { cred, len: matchLen };
      }
    }
  }
  if (bestSubMatch) return bestSubMatch.cred;

  // 3. Similitud de tokens (Dice coefficient sobre palabras significativas)
  const progTokens = new Set(normProg.split(" ").filter((w) => w.length > 1));
  if (progTokens.size === 0) return null;

  let bestTokenMatch: { cred: CreditoItem; score: number } | null = null;

  for (const cred of creditosList) {
    const normCred = normalizeForMovieMatch(cred.pelicula);
    const credTokens = new Set(normCred.split(" ").filter((w) => w.length > 1));
    if (credTokens.size === 0) continue;

    let commonCount = 0;
    for (const token of progTokens) {
      if (credTokens.has(token)) commonCount++;
    }

    const similarity = (2 * commonCount) / (progTokens.size + credTokens.size);
    if (similarity >= 0.6) {
      if (!bestTokenMatch || similarity > bestTokenMatch.score) {
        bestTokenMatch = { cred, score: similarity };
      }
    }
  }

  return bestTokenMatch ? bestTokenMatch.cred : null;
}

/**
 * Convierte un string de tiempo ("HH:mm:ss" o "HH:mm") a minutos totales.
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(":").map(Number);
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return (h || 0) * 60 + (m || 0) + (s || 0) / 60;
  }
  if (parts.length === 2) {
    const [h, m] = parts;
    return (h || 0) * 60 + (m || 0);
  }
  return 0;
}

/**
 * Calcula el horario reloj exacto en que inician los créditos para una función.
 *
 * Lógica:
 * - Se toma siempre `horaCredito` (primer horario donde prenden las luces).
 * - La programación tiene un bloque [inicio - fin] que incluye 15 minutos de trailers/publicidad.
 * - Duración película en programación = (fin - inicio) - 15 min.
 * - Delta desde el final = Duración película - horaCredito.
 * - Horario reloj créditos = Hora fin - Delta desde el final.
 *   (Equivalente a: Hora inicio + 15 min trailers + horaCredito).
 */
export function calculateCreditoClockTime(
  inicioStr: string,
  finStr: string,
  horaCreditoStr: string
): string {
  if (!inicioStr || !finStr || !horaCreditoStr) return "";

  const [inH, inM] = inicioStr.split(":").map(Number);
  const [finH, finM] = finStr.split(":").map(Number);

  const startMins = (inH || 0) * 60 + (inM || 0);
  let endMins = (finH || 0) * 60 + (finM || 0);

  // Manejo de trasnoche / cruce de medianoche
  if (endMins < startMins) {
    endMins += 1440;
  }

  const slotDuration = endMins - startMins;
  // Duración de la película en programación (restando 15 min de trailers)
  const movieDuration = Math.max(0, slotDuration - 15);

  const creditMins = parseTimeToMinutes(horaCreditoStr);
  if (creditMins <= 0) return "";

  // Cuenta desde el final:
  const deltaDesdeFin = movieDuration - creditMins;
  let creditClockMins = Math.round(endMins - deltaDesdeFin);

  // Ajustar formato reloj 24hs (00:00 - 23:59)
  creditClockMins = ((creditClockMins % 1440) + 1440) % 1440;

  const clockH = Math.floor(creditClockMins / 60);
  const clockM = creditClockMins % 60;

  return `${String(clockH).padStart(2, "0")}:${String(clockM).padStart(2, "0")}`;
}
