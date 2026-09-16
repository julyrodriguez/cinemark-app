import * as XLSX from "xlsx";
import dayjs from "dayjs";

export const POZI_CATEGORIAS = {
  OV: {
    codigo: "OV",
    nombre: "Ventas",
    desc: "Empleado de Ventas",
    color: "#1D4ED8",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  OS: {
    codigo: "OS",
    nombre: "Servicios",
    desc: "Empleado de Servicios",
    color: "#7C3AED",
    bg: "#F5F3FF",
    border: "#DDD6FE",
  },
  OT: {
    codigo: "OT",
    nombre: "Técnico",
    desc: "Técnico",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
  OC: {
    codigo: "OC",
    nombre: "Encargado",
    desc: "Encargado",
    color: "#DC2626",
    bg: "#FEF2F2",
    border: "#FECACA",
  },
  EI: {
    codigo: "EI",
    nombre: "EI (Ventas/Serv)",
    desc: "Ventas o Servicios (EI)",
    color: "#0D9488",
    bg: "#F0FDFA",
    border: "#99F6E4",
  },
} as const;

export type PoziCategoriaCodigo = keyof typeof POZI_CATEGORIAS;

/**
 * Días de la semana cinematográfica (comienza el Jueves y termina el Miércoles)
 */
export const CINEMA_WEEKDAYS = [
  { key: "jueves", label: "Jueves", short: "JUE", dayOffset: 0 },
  { key: "viernes", label: "Viernes", short: "VIE", dayOffset: 1 },
  { key: "sabado", label: "Sábado", short: "SÁB", dayOffset: 2 },
  { key: "domingo", label: "Domingo", short: "DOM", dayOffset: 3 },
  { key: "lunes", label: "Lunes", short: "LUN", dayOffset: 4 },
  { key: "martes", label: "Martes", short: "MAR", dayOffset: 5 },
  { key: "miercoles", label: "Miércoles", short: "MIÉ", dayOffset: 6 },
] as const;

/**
 * Normaliza y valida una categoría de POZI (OV, OS, OT, OC, EI).
 * Si no tiene una de estas categorías válidas, devuelve null para ser ignorado.
 */
export function normalizarCategoria(raw: unknown): PoziCategoriaCodigo | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim().toUpperCase();
  if (!str) return null;

  // Coincidencias directas por código
  if (str === "OV" || str.startsWith("OV ") || str.startsWith("OV-") || str.startsWith("OV/")) return "OV";
  if (str === "OS" || str.startsWith("OS ") || str.startsWith("OS-") || str.startsWith("OS/")) return "OS";
  if (str === "OT" || str.startsWith("OT ") || str.startsWith("OT-") || str.startsWith("OT/")) return "OT";
  if (str === "OC" || str.startsWith("OC ") || str.startsWith("OC-") || str.startsWith("OC/")) return "OC";
  if (str === "EI" || str.startsWith("EI ") || str.startsWith("EI-") || str.startsWith("EI/")) return "EI";

  // Búsqueda por descripción
  if (str.includes("VENTA")) return "OV";
  if (str.includes("SERVICIO")) return "OS";
  if (str.includes("TECNIC") || str.includes("TÉCNIC")) return "OT";
  if (str.includes("ENCARGAD") || str.includes("COORDINAD")) return "OC";
  if (str.includes("INICIAL") || str.includes("ENTRENAMIENTO")) return "EI";

  return null;
}

export type PoziEmployee = {
  id: string;
  nombre: string;
  categoria: PoziCategoriaCodigo | string;
  entra: string;
  sale: string;
  horasTrabajadas: number;
  duracionBreak: 20 | 45;
  estadoBreak: "PENDIENTE" | "EN_BREAK" | "FINALIZADO";
  breakInicio?: string | null;      // Hora en que se fue "HH:mm"
  breakRegreso?: string | null;     // Hora calculada a la que debe regresar "HH:mm"
  breakFin?: string | null;
  breakIniciadoAt?: number | null;  // Timestamp en ms
  breakFinalizadoAt?: number | null;
  encargado?: string | null;
  notas?: string | null;
};

export type PoziParsedResult = {
  empleados: PoziEmployee[];
  fileName: string;
  sheetName: string;
  totalFilas: number;
  columnasDetectadas: {
    categoriaCol?: string;
    nombreCol?: string;
    entraCol?: string;
    saleCol?: string;
    filaEncabezado?: number;
  };
  filasCrudasPrevisualizacion?: any[];
  rawSummaryText?: string;
};

export type PoziDayParsedResult = {
  diaIndex: number;
  diaKey: string;
  diaNombre: string;
  diaShort: string;
  fecha: string; // "YYYY-MM-DD"
  sheetName: string;
  empleados: PoziEmployee[];
  totalFilas: number;
  columnasDetectadas?: any;
};

export type PoziWeeklyParsedResult = {
  fileName: string;
  totalHojas: number;
  hojasProcesadas: number;
  dias: PoziDayParsedResult[];
  totalEmpleados: number;
  baseThursday: string;
};

/**
 * Obtiene la fecha del Jueves de inicio de la semana cinematográfica para cualquier fecha dada.
 */
export function getCinemaThursdayForDate(dateStr: string): string {
  const d = dayjs(dateStr);
  const dayOfWeek = d.day(); // 0 (Dom), 1 (Lun), ..., 4 (Jue), 5 (Vie), 6 (Sab)
  const daysSinceThursday = (dayOfWeek + 7 - 4) % 7;
  return d.subtract(daysSinceThursday, "day").format("YYYY-MM-DD");
}

/**
 * Normaliza cualquier formato de horario de Excel a "HH:mm".
 */
export function normalizeExcelTime(val: unknown): string {
  if (val === undefined || val === null || val === "") return "";

  // Si es instancia Date
  if (val instanceof Date) {
    const hh = val.getHours();
    const mm = val.getMinutes();
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  // Si es un número (Excel time fraction)
  if (typeof val === "number") {
    if (isNaN(val)) return "";
    // Caso fracción de día: ej. 0.583333333 => 14:00
    if (val >= 0 && val < 1) {
      const totalMinutes = Math.round(val * 24 * 60);
      const hh = Math.floor(totalMinutes / 60) % 24;
      const mm = totalMinutes % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    // Caso horas directas: ej. 14.5 => 14:30
    if (val >= 1 && val < 24) {
      const hh = Math.floor(val);
      const mm = Math.round((val - hh) * 60);
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    // Caso entero militar: ej. 1430 => 14:30
    if (val >= 100 && val <= 2400) {
      const hh = Math.floor(val / 100);
      const mm = Math.round(val % 100);
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
  }

  const str = String(val).trim();
  if (!str) return "";

  // Regex para HH:mm o H:mm o HH.mm
  const match = str.match(/(\d{1,2})[:.\s](\d{2})/);
  if (match) {
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!isNaN(hh) && !isNaN(mm) && hh >= 0 && hh <= 24 && mm >= 0 && mm < 60) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
  }

  // Regex para "14h" o "14hs" o "14"
  const singleMatch = str.match(/^(\d{1,2})(?:h|hs)?$/i);
  if (singleMatch) {
    const hh = Number(singleMatch[1]);
    if (!isNaN(hh) && hh >= 0 && hh <= 24) {
      return `${String(hh).padStart(2, "0")}:00`;
    }
  }

  return str;
}

/**
 * Calcula las horas de trabajo entre Entra y Sale.
 * Maneja turnos que cruzan la medianoche (ej. 18:00 a 02:00 = 8 horas).
 */
export function calculateWorkHours(entra: string, sale: string): number {
  if (!entra || !sale) return 0;

  const [eH, eM] = entra.split(":").map(Number);
  const [sH, sM] = sale.split(":").map(Number);

  if (isNaN(eH) || isNaN(eM) || isNaN(sH) || isNaN(sM)) return 0;

  const entraTotalMin = eH * 60 + eM;
  let saleTotalMin = sH * 60 + sM;

  // Si sale después de medianoche
  if (saleTotalMin < entraTotalMin) {
    saleTotalMin += 24 * 60;
  }

  const diffMin = saleTotalMin - entraTotalMin;
  return Math.round((diffMin / 60) * 10) / 10; // Horas con un decimal (ej. 7, 7.5, 8)
}

/**
 * Regla de Cinemark:
 * Si el empleado trabaja 7 horas exactas o menos => break de 20 minutos.
 * Si trabaja más de 7 horas => break de 45 minutos.
 */
export function calculateBreakDuration(workHours: number): 20 | 45 {
  if (workHours <= 7) {
    return 20;
  }
  return 45;
}

/**
 * Parsea una única hoja de Excel de POZI.
 */
export function parseSinglePoziSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
  sheetIndex: number = 0
): PoziParsedResult {
  // Convertir a matriz con filas y columnas crudas
  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (matrix.length === 0) {
    return {
      empleados: [],
      fileName,
      sheetName,
      totalFilas: 0,
      columnasDetectadas: {},
    };
  }

  // 1. Identificar la fila de encabezados
  let headerRowIndex = -1;
  let catColIndex = -1;
  let nombreColIndex = -1;
  let entraColIndex = -1;
  let saleColIndex = -1;

  for (let r = 0; r < Math.min(matrix.length, 25); r++) {
    const row = matrix[r] || [];
    let foundCat = -1;
    let foundNombre = -1;
    let foundEntra = -1;
    let foundSale = -1;

    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || "").trim().toLowerCase();
      if (!cellText) continue;

      // Cat
      if (
        cellText === "cat" ||
        cellText.startsWith("cat ") ||
        cellText.includes("categor") ||
        cellText === "puesto" ||
        cellText === "sector" ||
        cellText === "rol"
      ) {
        foundCat = c;
      }

      // Nombre y Apellido
      if (
        cellText.includes("nombre") ||
        cellText.includes("apellido") ||
        cellText.includes("empleado") ||
        cellText.includes("colaborador") ||
        cellText.includes("personal")
      ) {
        foundNombre = c;
      }

      // Entra
      if (
        cellText === "entra" ||
        cellText.startsWith("entra") ||
        cellText.includes("ingreso") ||
        cellText.includes("desde") ||
        cellText.includes("inicio") ||
        cellText === "in"
      ) {
        foundEntra = c;
      }

      // Sale
      if (
        cellText === "sale" ||
        cellText.startsWith("sale") ||
        cellText.includes("salida") ||
        cellText.includes("hasta") ||
        cellText.includes("egreso") ||
        cellText.includes("fin") ||
        cellText === "out"
      ) {
        foundSale = c;
      }
    }

    // Si encontramos al menos 2 columnas
    const matchesCount = [foundCat !== -1, foundNombre !== -1, foundEntra !== -1, foundSale !== -1].filter(Boolean).length;
    if (matchesCount >= 2) {
      headerRowIndex = r;
      catColIndex = foundCat;
      nombreColIndex = foundNombre;
      entraColIndex = foundEntra;
      saleColIndex = foundSale;
      break;
    }
  }

  // Fallback si no detectó por nombres de encabezados
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
  }
  // Si catColIndex no fue encontrado, chequear la columna 1 (segunda columna)
  if (catColIndex === -1 && matrix[0] && matrix[0].length > 1) {
    catColIndex = 1;
  }

  // Recorrer filas de datos
  const empleados: PoziEmployee[] = [];
  const filasCrudasPrevisualizacion: any[] = [];

  let sectorActual: PoziCategoriaCodigo | null = null;
  let ultimaCategoriaEmpleado: PoziCategoriaCodigo | null = null;

  function detectarTituloSector(row: any[]): PoziCategoriaCodigo | null {
    for (let c = 0; c < row.length; c++) {
      const txt = String(row[c] || "").trim().toUpperCase();
      if (!txt) continue;
      // Si tiene formato de hora o número de horario, descartar como título puro
      if (txt.includes(":") || (txt.length <= 4 && !isNaN(Number(txt)) && Number(txt) > 50)) {
        continue;
      }
      if (txt.includes("VENTAS") || txt.includes("VENTA") || txt.includes("CANDY") || txt.includes("BOLETERIA") || txt.includes("BOLETERÍA")) {
        return "OV";
      }
      if (txt.includes("SERVICIOS") || txt.includes("SERVICIO") || txt.includes("SALAS") || txt.includes("ACOMODADOR")) {
        return "OS";
      }
      if (txt.includes("TECNICA") || txt.includes("TÉCNICA") || txt.includes("PROYECCION") || txt.includes("PROYECCIÓN") || txt.includes("CABINA")) {
        return "OT";
      }
      if (txt.includes("ENCARGADOS") || txt.includes("ENCARGADO") || txt.includes("COORDINACION") || txt.includes("COORDINACIÓN")) {
        return "OC";
      }
    }
    return null;
  }

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    if (!row || row.length === 0) continue;

    const hasAny = row.some((c) => c !== undefined && c !== null && String(c).trim() !== "");
    if (!hasAny) continue;

    // 1. Detectar si la fila es un título de sector (ej. "VENTAS", "SERVICIOS", etc.)
    const tituloSector = detectarTituloSector(row);
    const testEntra = entraColIndex !== -1 ? normalizeExcelTime(row[entraColIndex]) : "";
    const testSale = saleColIndex !== -1 ? normalizeExcelTime(row[saleColIndex]) : "";

    // Si es un título de sector y no tiene ambos horarios de turno, es una fila de encabezado de sector
    if (tituloSector && (!testEntra || !testSale)) {
      sectorActual = tituloSector;
      continue;
    }

    // 2. Extraer valores de columnas
    let catVal = catColIndex !== -1 ? row[catColIndex] : undefined;
    let nombreVal = nombreColIndex !== -1 ? row[nombreColIndex] : undefined;
    let entraVal = entraColIndex !== -1 ? row[entraColIndex] : undefined;
    let saleVal = saleColIndex !== -1 ? row[saleColIndex] : undefined;

    // Si catColIndex no trajo nada válido, buscar en las primeras columnas
    let catNorm = normalizarCategoria(catVal);
    if (!catNorm) {
      for (let c = 0; c < Math.min(row.length, 5); c++) {
        if (c !== nombreColIndex) {
          const test = normalizarCategoria(row[c]);
          if (test) {
            catNorm = test;
            break;
          }
        }
      }
    }

    // Si no tiene categoría válida, descartar la fila automáticamente
    if (!catNorm) {
      continue;
    }

    // Si no se detectó nombre en su columna, buscar la primera columna con texto alfabético
    if (!nombreVal) {
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || "").trim();
        if (val && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]{3,}/.test(val) && c !== catColIndex && !normalizarCategoria(val)) {
          nombreVal = val;
          break;
        }
      }
    }

    // Si entra y sale no se detectaron bien, buscar columnas con formato hora
    if (!entraVal || !saleVal) {
      const horasEnFila: { col: number; hora: string }[] = [];
      for (let c = 0; c < row.length; c++) {
        const norm = normalizeExcelTime(row[c]);
        if (norm && /^\d{2}:\d{2}$/.test(norm)) {
          horasEnFila.push({ col: c, hora: norm });
        }
      }
      if (horasEnFila.length >= 2) {
        if (!entraVal) entraVal = horasEnFila[0].hora;
        if (!saleVal) saleVal = horasEnFila[1].hora;
      } else if (horasEnFila.length === 1) {
        if (!entraVal) entraVal = horasEnFila[0].hora;
      }
    }

    const nombre = String(nombreVal || "").trim();
    if (!nombre || nombre.toLowerCase().includes("total") || nombre.toLowerCase() === "nombre") {
      continue;
    }

    const entra = normalizeExcelTime(entraVal);
    const sale = normalizeExcelTime(saleVal);

    // Si no tiene horarios de entrada y salida válidos, no es un turno válido
    if (!entra && !sale) {
      continue;
    }

    const horasTrabajadas = calculateWorkHours(entra, sale);
    const duracionBreak = calculateBreakDuration(horasTrabajadas);

    // RESOLUCIÓN DE CATEGORÍA PARA EI:
    let categoriaFinal: PoziCategoriaCodigo = catNorm;
    const esEIOriginal = catNorm === "EI";

    if (esEIOriginal) {
      if (ultimaCategoriaEmpleado && (ultimaCategoriaEmpleado === "OV" || ultimaCategoriaEmpleado === "OS" || ultimaCategoriaEmpleado === "OT" || ultimaCategoriaEmpleado === "OC")) {
        categoriaFinal = ultimaCategoriaEmpleado;
      } else if (sectorActual) {
        categoriaFinal = sectorActual;
      } else {
        categoriaFinal = "OV"; // Default a Ventas
      }
    } else {
      ultimaCategoriaEmpleado = catNorm;
      sectorActual = catNorm;
    }

    const empId = `emp_${sheetIndex}_${r}_${nombre.replace(/\s+/g, "_").toLowerCase()}`;

    empleados.push({
      id: empId,
      nombre,
      categoria: categoriaFinal,
      entra,
      sale,
      horasTrabajadas,
      duracionBreak,
      estadoBreak: "PENDIENTE",
      breakInicio: null,
      breakRegreso: null,
      breakFin: null,
      breakIniciadoAt: null,
      breakFinalizadoAt: null,
      encargado: null,
      notas: esEIOriginal ? "EI (Entrenamiento Inicial)" : null,
    });

    if (filasCrudasPrevisualizacion.length < 50) {
      filasCrudasPrevisualizacion.push({
        fila: r + 1,
        categoria: categoriaFinal,
        categoriaOriginal: catNorm,
        esEI: esEIOriginal,
        nombre,
        entraRaw: entraVal,
        saleRaw: saleVal,
        entraParsed: entra,
        saleParsed: sale,
        horas: horasTrabajadas,
        break: `${duracionBreak} min`,
      });
    }
  }

  const sampleData = empleados.slice(0, 10).map((e) => ({
    nombre: e.nombre,
    categoria: e.categoria,
    entra: e.entra,
    sale: e.sale,
    horas: e.horasTrabajadas,
    breakMin: e.duracionBreak,
  }));

  const rawSummaryText = JSON.stringify(
    {
      archivo: fileName,
      hoja: sheetName,
      totalEmpleadosValidos: empleados.length,
      filaEncabezadosDetectada: headerRowIndex + 1,
      muestraPrimeros10: sampleData,
    },
    null,
    2
  );

  return {
    empleados,
    fileName,
    sheetName,
    totalFilas: matrix.length,
    columnasDetectadas: {
      categoriaCol: catColIndex !== -1 ? String(matrix[headerRowIndex]?.[catColIndex] || `Col ${catColIndex}`) : undefined,
      nombreCol: nombreColIndex !== -1 ? String(matrix[headerRowIndex]?.[nombreColIndex] || `Col ${nombreColIndex}`) : undefined,
      entraCol: entraColIndex !== -1 ? String(matrix[headerRowIndex]?.[entraColIndex] || `Col ${entraColIndex}`) : undefined,
      saleCol: saleColIndex !== -1 ? String(matrix[headerRowIndex]?.[saleColIndex] || `Col ${saleColIndex}`) : undefined,
      filaEncabezado: headerRowIndex + 1,
    },
    filasCrudasPrevisualizacion,
    rawSummaryText,
  };
}

/**
 * Parsea un libro Excel con múltiples hojas semanales de POZI.
 * Las hojas corresponden en orden a los días de la semana: Jueves (hoja 1) a Miércoles (hoja 7).
 * Si tiene menos hojas, procesa hasta la cantidad de hojas presentes.
 */
export function parsePoziWeeklyExcel(
  buffer: ArrayBuffer,
  fileName: string,
  baseDateStr?: string
): PoziWeeklyParsedResult {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("El archivo Excel no contiene ninguna hoja.");
  }

  const baseThursday = getCinemaThursdayForDate(baseDateStr || dayjs().format("YYYY-MM-DD"));
  const thursdayObj = dayjs(baseThursday);

  const dias: PoziDayParsedResult[] = [];
  const maxHojas = Math.min(workbook.SheetNames.length, 7);

  for (let i = 0; i < maxHojas; i++) {
    const sheetName = workbook.SheetNames[i];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const dayDef = CINEMA_WEEKDAYS[i];
    const fechaDia = thursdayObj.add(dayDef.dayOffset, "day").format("YYYY-MM-DD");

    const singleResult = parseSinglePoziSheet(sheet, sheetName, fileName, i);

    dias.push({
      diaIndex: i,
      diaKey: dayDef.key,
      diaNombre: dayDef.label,
      diaShort: dayDef.short,
      fecha: fechaDia,
      sheetName,
      empleados: singleResult.empleados,
      totalFilas: singleResult.totalFilas,
      columnasDetectadas: singleResult.columnasDetectadas,
    });
  }

  const totalEmpleados = dias.reduce((sum, d) => sum + d.empleados.length, 0);

  return {
    fileName,
    totalHojas: workbook.SheetNames.length,
    hojasProcesadas: dias.length,
    dias,
    totalEmpleados,
    baseThursday,
  };
}

/**
 * Parsea la primera hoja de un archivo Excel de POZI (retrocompatibilidad).
 */
export function parsePoziExcel(buffer: ArrayBuffer, fileName: string): PoziParsedResult {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });

  const sheetName = workbook.SheetNames[0] || "";
  if (!sheetName) {
    throw new Error("El archivo Excel no contiene ninguna hoja.");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("No se pudo leer la hoja del archivo.");
  }

  return parseSinglePoziSheet(sheet, sheetName, fileName, 0);
}
