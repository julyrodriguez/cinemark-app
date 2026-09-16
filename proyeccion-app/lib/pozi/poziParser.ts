import * as XLSX from "xlsx";

export type PoziEmployee = {
  id: string;
  nombre: string;
  categoria: string;
  entra: string;
  sale: string;
  horasTrabajadas: number;
  duracionBreak: 20 | 40;
  estadoBreak: "PENDIENTE" | "EN_BREAK" | "FINALIZADO";
  breakInicio?: string | null;      // Hora en que se fue "HH:mm"
  breakRegreso?: string | null;     // Hora a la que debería regresar "HH:mm"
  breakFin?: string | null;         // Hora de regreso real si se registra
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
    filaEncabezado: number;
  };
  filasCrudasPrevisualizacion: any[];
  rawSummaryText: string;
};

/**
 * Normaliza valores de horas de Excel (fracciones numéricas, strings o Date) a formato "HH:mm".
 */
export function normalizeExcelTime(val: unknown): string {
  if (val === undefined || val === null) return "";

  // Si es un objeto Date
  if (val instanceof Date) {
    const hh = String(val.getHours()).padStart(2, "0");
    const mm = String(val.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
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
 * Si trabaja más de 7 horas => break de 40 minutos.
 */
export function calculateBreakDuration(workHours: number): 20 | 40 {
  if (workHours <= 7) {
    return 20;
  }
  return 40;
}

/**
 * Parsea un ArrayBuffer de un archivo Excel de POZI.
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

  // Convertir a matriz con filas y columnas crudas
  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (matrix.length === 0) {
    throw new Error("El archivo Excel está vacío.");
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

    // Si encontramos al menos nombre o (entra y sale)
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

  // Si no se detectaron encabezados por texto, intentar fallback posicional básico
  if (headerRowIndex === -1) {
    // Tomar fila 0 como encabezado
    headerRowIndex = 0;
  }

  // Recorrer filas de datos
  const empleados: PoziEmployee[] = [];
  const filasCrudasPrevisualizacion: any[] = [];

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    if (!row || row.length === 0) continue;

    // Verificar si la fila tiene algún dato no vacío
    const hasAny = row.some((c) => c !== undefined && c !== null && String(c).trim() !== "");
    if (!hasAny) continue;

    let catVal = catColIndex !== -1 ? row[catColIndex] : "";
    let nombreVal = nombreColIndex !== -1 ? row[nombreColIndex] : "";
    let entraVal = entraColIndex !== -1 ? row[entraColIndex] : "";
    let saleVal = saleColIndex !== -1 ? row[saleColIndex] : "";

    // Si nombreVal no se encontró por índice, buscar en celdas de texto
    if (!nombreVal) {
      for (let c = 0; c < row.length; c++) {
        if (c !== catColIndex && c !== entraColIndex && c !== saleColIndex) {
          const str = String(row[c] || "").trim();
          // Si tiene más de 3 letras y no es un número simple
          if (str.length > 3 && isNaN(Number(str)) && !str.includes(":") && !str.toLowerCase().includes("total")) {
            nombreVal = str;
            break;
          }
        }
      }
    }

    const nombre = String(nombreVal || "").trim();
    if (!nombre || nombre.toLowerCase().includes("total") || nombre.toLowerCase() === "nombre") {
      continue;
    }

    const categoria = String(catVal || "General").trim() || "General";
    const entra = normalizeExcelTime(entraVal);
    const sale = normalizeExcelTime(saleVal);

    const horasTrabajadas = calculateWorkHours(entra, sale);
    const duracionBreak = calculateBreakDuration(horasTrabajadas);

    const empId = `emp_${r}_${nombre.replace(/\s+/g, "_").toLowerCase()}`;

    empleados.push({
      id: empId,
      nombre,
      categoria,
      entra,
      sale,
      horasTrabajadas,
      duracionBreak,
      estadoBreak: "PENDIENTE",
      breakInicio: null,
      breakFin: null,
      breakIniciadoAt: null,
      encargado: null,
      notas: null,
    });

    if (filasCrudasPrevisualizacion.length < 50) {
      filasCrudasPrevisualizacion.push({
        fila: r + 1,
        categoria,
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

  // Generar resumen en texto plano para que el usuario pueda copiarlo o promptearlo
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
      totalEmpleadosDetectados: empleados.length,
      filaEncabezadosDetectada: headerRowIndex + 1,
      indicesColumnas: {
        cat: catColIndex,
        nombre: nombreColIndex,
        entra: entraColIndex,
        sale: saleColIndex,
      },
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
