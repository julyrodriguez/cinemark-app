import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";

// Sala capacity metadata as provided by user
const SALAS_INFO = [
  { id: 1, capacity: 225, name: "Sala 1" },
  { id: 2, capacity: 267, name: "Sala 2" },
  { id: 3, capacity: 267, name: "Sala 3" },
  { id: 4, capacity: 211, name: "Sala 4" },
  { id: 5, capacity: 254, name: "Sala 5" },
  { id: 6, capacity: 136, name: "Sala 6" },
  { id: 7, capacity: 136, name: "Sala 7" },
  { id: 8, capacity: 284, name: "Sala 8" },
  { id: 9, capacity: 302, name: "Sala 9" },
  { id: 10, capacity: 299, name: "Sala 10" },
  { id: 11, capacity: 279, name: "Sala 11" },
  { id: 12, capacity: 277, name: "Sala 12" },
];

interface SeatIssue {
  respaldo: boolean;
  asiento: boolean;
  apoyabrazos: boolean;
  detalles: string;
}

interface RoomIssues {
  [seatKey: string]: SeatIssue;
}

interface ActiveReport {
  updatedAt: string;
  updatedBy: string;
  issues: {
    [salaId: string]: RoomIssues;
  };
}

interface SeatInfo {
  row: string;
  number: number;
  type: "seat" | "empty";
  isDbox?: boolean;
}

interface RoomLayout {
  rows: string[];
  maxCol: number;
  aisles: number[];
  seats: { [row: string]: SeatInfo[] };
}

// Dynamic layout builder for all 12 rooms based on exact user specification
export const getRoomLayout = (salaId: number): RoomLayout => {
  let rows: string[] = [];
  let maxCol = 21;
  let aisles = [4, 17];

  if (salaId === 1 || salaId === 4) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
  } else if (salaId === 2 || salaId === 3) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
  } else if (salaId === 5) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
    maxCol = 20;
    aisles = [4, 16];
  } else if (salaId === 6 || salaId === 7) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    maxCol = 14;
    aisles = [];
  } else if (salaId === 8) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
  } else if (salaId === 9 || salaId === 10) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"];
  } else if (salaId === 11) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
  } else if (salaId === 12) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
  }

  const seats: { [row: string]: SeatInfo[] } = {};

  for (const row of rows) {
    const rowSeats: SeatInfo[] = [];
    for (let c = 1; c <= maxCol; c++) {
      let isSeat = false;
      let isDbox = false;

      if (salaId === 1) {
        if (row === "A" || row === "B" || row === "C") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "K") {
          isSeat = c >= 5 && c <= 17;
        } else {
          isSeat = true; // D to J: 1 to 21
        }
      } else if (salaId === 2 || salaId === 3) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "N") {
          isSeat = c >= 15 && c <= 17;
        } else if (row === "M") {
          isSeat = true; // 1 to 21
        } else {
          isSeat = c >= 2 && c <= 20; // B to L
        }
      } else if (salaId === 4) {
        if (row === "K") {
          isSeat = c >= 5 && c <= 17;
        } else {
          isSeat = c >= 2 && c <= 20; // A to J
        }
      } else if (salaId === 5) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 18;
        } else if (row === "M" || row === "N") {
          isSeat = c >= 5 && c <= 16;
        } else if (row === "I" || row === "J" || row === "K" || row === "L") {
          isSeat = c >= 1 && c <= 20;
        } else {
          isSeat = c >= 2 && c <= 19; // B to H
        }
      } else if (salaId === 6 || salaId === 7) {
        if (row === "J") {
          isSeat = c >= 4 && c <= 11;
        } else {
          isSeat = c >= 1 && c <= 14; // A to I
        }
      } else if (salaId === 8) {
        if (row === "L" || row === "M") {
          isSeat = true; // 1 to 21
        } else if (row === "O") {
          isSeat = c >= 6 && c <= 16;
        } else {
          isSeat = c >= 2 && c <= 20; // A to K, and N (which is same as A)
        }
      } else if (salaId === 9) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "B") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "C" || row === "D" || row === "E" || row === "F") {
          isSeat = true; // 1 to 21
        } else if (row === "G") {
          isSeat = (c >= 1 && c <= 4) || (c >= 18 && c <= 21) || (c >= 7 && c <= 15);
          isDbox = c >= 7 && c <= 15;
        } else if (row === "H") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20);
        } else if (row === "I" || row === "J") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20) || (c >= 7 && c <= 15);
          isDbox = c >= 7 && c <= 15;
        } else if (row === "K" || row === "L" || row === "M" || row === "N" || row === "O") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "P") {
          isSeat = true; // 1 to 21
        } else if (row === "Q") {
          isSeat = c >= 6 && c <= 16;
        }
      } else if (salaId === 10) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "B" || row === "C" || row === "F") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "D" || row === "E") {
          isSeat = true; // 1 to 21
        } else if (row === "G") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20) || (c >= 7 && c <= 15);
          isDbox = c >= 7 && c <= 15;
        } else if (row === "H") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20);
        } else if (row === "I" || row === "J") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20) || (c >= 7 && c <= 15);
          isDbox = c >= 7 && c <= 15;
        } else if (row === "K" || row === "L" || row === "M" || row === "N" || row === "O") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "P") {
          isSeat = true; // 1 to 21
        } else if (row === "Q") {
          isSeat = c >= 5 && c <= 17;
        }
      } else if (salaId === 11) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "B" || row === "C" || row === "F" || row === "J" || row === "K") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "D" || row === "E" || row === "L" || row === "M" || row === "N") {
          isSeat = true; // 1 to 21
        } else if (row === "G" || row === "H" || row === "I") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20) || (c >= 7 && c <= 16);
          isDbox = c >= 7 && c <= 16;
        } else if (row === "O") {
          isSeat = c >= 6 && c <= 16;
        }
      } else if (salaId === 12) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "B" || row === "C") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "M" || row === "N") {
          isSeat = c >= 5 && c <= 17;
        } else {
          isSeat = true; // D to L: 1 to 21
        }
      }

      rowSeats.push({
        row,
        number: c,
        type: isSeat ? "seat" : "empty",
        isDbox,
      });
    }
    seats[row] = rowSeats;
  }

  return { rows, maxCol, aisles, seats };
};

export default function ControlSalasScreen() {
  const { cineId, user, displayName } = useAuthUser();
  const userEmail = user?.email || "usuario.anonimo";
  const cineLabelRaw = displayName || cineId || "Cine";
  const cineLabel = cineLabelRaw ? cineLabelRaw.charAt(0).toUpperCase() + cineLabelRaw.slice(1) : "Cine";

  // Component state
  const [selectedSala, setSelectedSala] = useState<number>(1);
  const [report, setReport] = useState<ActiveReport>({
    updatedAt: "",
    updatedBy: "",
    issues: {},
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Modal editing seat state
  const [editingSeat, setEditingSeat] = useState<{ row: string; num: number; isDbox?: boolean } | null>(null);
  const [respaldoRoto, setRespaldoRoto] = useState(false);
  const [asientoRoto, setAsientoRoto] = useState(false);
  const [apoyabrazosRoto, setApoyabrazosRoto] = useState(false);
  const [extraDetails, setExtraDetails] = useState("");

  // Listen to Firestore active report
  useEffect(() => {
    if (!cineId) return;

    setLoading(true);
    const docRef = doc(db, CINES_COLLECTION, cineId, "control_salas", "active");
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as ActiveReport;
          setReport({
            updatedAt: data.updatedAt || "",
            updatedBy: data.updatedBy || "",
            issues: data.issues || {},
          });
        } else {
          setReport({
            updatedAt: "",
            updatedBy: "",
            issues: {},
          });
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error reading room control report:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [cineId]);

  // Save report updates to Firestore helper
  const saveReportToFirebase = async (updatedIssues: { [salaId: string]: RoomIssues }) => {
    if (!cineId) return;
    setSaving(true);
    try {
      const docRef = doc(db, CINES_COLLECTION, cineId, "control_salas", "active");
      const payload: ActiveReport = {
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail,
        issues: updatedIssues,
      };
      await setDoc(docRef, payload);
    } catch (e) {
      console.error("Error saving report to Firestore:", e);
      Alert.alert("Error", "No se pudo sincronizar la información en la nube.");
    } finally {
      setSaving(false);
    }
  };

  // Open editor modal for a specific seat
  const handleSeatPress = (row: string, num: number, isDbox?: boolean) => {
    const salaKey = String(selectedSala);
    const seatKey = `${row}-${num}`;
    const existing = report.issues[salaKey]?.[seatKey];

    setEditingSeat({ row, num, isDbox });
    if (existing) {
      setRespaldoRoto(existing.respaldo);
      setAsientoRoto(existing.asiento);
      setApoyabrazosRoto(existing.apoyabrazos);
      setExtraDetails(existing.detalles || "");
    } else {
      setRespaldoRoto(false);
      setAsientoRoto(false);
      setApoyabrazosRoto(false);
      setExtraDetails("");
    }
  };

  // Save seat edits
  const handleSaveSeat = async () => {
    if (!editingSeat) return;
    const { row, num } = editingSeat;
    const salaKey = String(selectedSala);
    const seatKey = `${row}-${num}`;

    const newReportIssues = { ...report.issues };
    if (!newReportIssues[salaKey]) {
      newReportIssues[salaKey] = {};
    }

    const hasAnyIssue = respaldoRoto || asientoRoto || apoyabrazosRoto || extraDetails.trim().length > 0;

    if (hasAnyIssue) {
      newReportIssues[salaKey][seatKey] = {
        respaldo: respaldoRoto,
        asiento: asientoRoto,
        apoyabrazos: apoyabrazosRoto,
        detalles: extraDetails.trim(),
      };
    } else {
      delete newReportIssues[salaKey][seatKey];
      if (Object.keys(newReportIssues[salaKey]).length === 0) {
        delete newReportIssues[salaKey];
      }
    }

    setEditingSeat(null);
    await saveReportToFirebase(newReportIssues);
  };

  // Quick remove seat report
  const handleClearSeatReport = async (row: string, num: number) => {
    const salaKey = String(selectedSala);
    const seatKey = `${row}-${num}`;

    if (!report.issues[salaKey]?.[seatKey]) return;

    const newReportIssues = { ...report.issues };
    delete newReportIssues[salaKey][seatKey];
    if (Object.keys(newReportIssues[salaKey]).length === 0) {
      delete newReportIssues[salaKey];
    }
    await saveReportToFirebase(newReportIssues);
  };

  // Reset entire active inspection (after confirmation)
  const handleClearActiveReport = () => {
    const executeClear = async () => {
      await saveReportToFirebase({});
    };

    if (Platform.OS === "web") {
      const confirm = window.confirm("¿Seguro que querés limpiar por completo todo el reporte actual de todas las salas? Esta acción no se puede deshacer.");
      if (confirm) {
        executeClear();
      }
    } else {
      Alert.alert(
        "Confirmar limpieza",
        "¿Seguro que querés borrar todas las butacas marcadas del reporte en todas las salas?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Borrar Todo", style: "destructive", onPress: executeClear },
        ]
      );
    }
  };

  // Generate and export/print HTML report
  const handleExportPdf = async () => {
    let totalDamagedSeats = 0;
    const salaReportsList: { salaName: string; issues: { row: string; num: number; seat: string; desc: string; details: string; isDbox?: boolean }[] }[] = [];

    SALAS_INFO.forEach((sInfo) => {
      const salaKey = String(sInfo.id);
      const roomIssues = report.issues[salaKey];
      if (roomIssues && Object.keys(roomIssues).length > 0) {
        // Load the room layout to verify if the seat is DBOX
        const layoutObj = getRoomLayout(sInfo.id);

        const issuesSorted = Object.entries(roomIssues)
          .map(([key, val]) => {
            const [row, numStr] = key.split("-");
            const num = parseInt(numStr, 10);
            const parts: string[] = [];
            if (val.respaldo) parts.push("Respaldo");
            if (val.asiento) parts.push("Asiento");
            if (val.apoyabrazos) parts.push("Apoyabrazos");

            // Look up seat in layout to verify Dbox status
            const rowSeats = layoutObj.seats[row];
            const seatLayout = rowSeats?.find((s) => s.number === num);
            const isDbox = seatLayout?.isDbox || false;

            return {
              row,
              num,
              seat: `Fila ${row} - Butaca ${num}${isDbox ? " (D-BOX)" : ""}`,
              desc: parts.length > 0 ? parts.join(", ") : "Detalles manuales",
              details: val.detalles || "-",
              isDbox,
            };
          })
          .sort((a, b) => {
            if (a.row !== b.row) return a.row.localeCompare(b.row);
            return a.num - b.num;
          });

        totalDamagedSeats += issuesSorted.length;
        salaReportsList.push({
          salaName: sInfo.name,
          issues: issuesSorted,
        });
      }
    });

    if (totalDamagedSeats === 0) {
      Alert.alert("Reporte Vacío", "No se encontraron butacas rotas cargadas en ninguna sala.");
      return;
    }

    try {
      const formattedDate = new Date().toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      let roomsTablesHtml = `<div class="rooms-grid">`;
      salaReportsList.forEach((salaRep) => {
        roomsTablesHtml += `
          <div class="room-section">
            <h2>${salaRep.salaName}</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 30%;">Butaca</th>
                  <th style="width: 35%;">Daño</th>
                  <th style="width: 35%;">Detalles</th>
                </tr>
              </thead>
              <tbody>
                ${salaRep.issues
                  .map(
                    (issue) => `
                  <tr>
                    <td>
                      <strong>${issue.row}-${issue.num}</strong>
                      ${issue.isDbox ? `<span class="dbox-tag">D-BOX</span>` : ""}
                    </td>
                    <td><span class="badge">${issue.desc}</span></td>
                    <td>${issue.details}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      });
      roomsTablesHtml += `</div>`;

      const html = `
        <!doctype html>
        <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Reporte de Control de Salas</title>
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            body {
              font-family: Arial, sans-serif;
              color: #333;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              font-size: 9px;
              line-height: 1.3;
            }
            .header {
              border-bottom: 2px solid #890404;
              padding-bottom: 6px;
              margin-bottom: 12px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-title h1 {
              color: #890404;
              margin: 0 0 2px 0;
              font-size: 16px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .header-title p {
              margin: 0;
              color: #666;
              font-size: 9px;
            }
            .header-meta {
              text-align: right;
              font-size: 9px;
              color: #555;
            }
            .summary {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 8px 12px;
              margin-bottom: 16px;
              display: flex;
              justify-content: space-between;
            }
            .summary-item {
              flex: 1;
            }
            .summary-item span {
              font-size: 9px;
              color: #64748b;
            }
            .summary-item strong {
              display: block;
              font-size: 13px;
              color: #890404;
              margin-top: 2px;
            }
            .rooms-grid {
              display: flex;
              flex-wrap: wrap;
              gap: 12px;
            }
            .room-section {
              width: calc(50% - 6px);
              box-sizing: border-box;
              margin-bottom: 12px;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .room-section h2 {
              font-size: 11px;
              margin: 0 0 6px 0;
              color: #1e293b;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 2px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 6px;
              table-layout: fixed;
            }
            th {
              background-color: #f1f5f9;
              color: #475569;
              font-weight: bold;
              text-align: left;
              padding: 4px 6px;
              border: 1px solid #cbd5e1;
              font-size: 8px;
              text-transform: uppercase;
            }
            td {
              padding: 4px 6px;
              border: 1px solid #e2e8f0;
              font-size: 9px;
              vertical-align: top;
              word-break: break-word;
              white-space: normal;
            }
            tr:nth-child(even) td {
              background-color: #f8fafc;
            }
            .badge {
              background-color: #fee2e2;
              color: #991b1b;
              padding: 1px 4px;
              border-radius: 3px;
              font-size: 8px;
              font-weight: bold;
              display: inline-block;
              word-break: break-word;
              white-space: normal;
            }
            .dbox-tag {
              background-color: #f3e8ff;
              color: #6b21a8;
              border: 1px solid #e9d5ff;
              padding: 1px 4px;
              border-radius: 3px;
              font-size: 8px;
              font-weight: bold;
              margin-left: 4px;
              vertical-align: middle;
            }
            .footer-sig {
              margin-top: 20px;
              border-top: 1px solid #cbd5e1;
              padding-top: 8px;
              display: flex;
              justify-content: flex-end;
              font-size: 9px;
              color: #666;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .sig-line {
              width: 180px;
              border-top: 1px dashed #94a3b8;
              margin-top: 25px;
              text-align: center;
              padding-top: 3px;
            }
            @media print {
              .room-section {
                break-inside: avoid;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-title">
              <h1>Control de Estado de Salas</h1>
              <p>Reporte de Auditoría Física de Butacas</p>
            </div>
            <div class="header-meta">
              <strong>Fecha:</strong> ${formattedDate}<br />
              <strong>Cine:</strong> ${cineLabel}
            </div>
          </div>

          <div class="summary">
            <div class="summary-item">
              <span>Salas con Incidencias</span>
              <strong>${salaReportsList.length} de ${SALAS_INFO.length}</strong>
            </div>
            <div class="summary-item">
              <span>Total Butacas Dañadas</span>
              <strong>${totalDamagedSeats}</strong>
            </div>
            <div class="summary-item">
              <span>Estado General</span>
              <strong>Revisión Pendiente</strong>
            </div>
          </div>

          ${roomsTablesHtml}

          <div class="footer-sig">
            <div class="sig-line">
              Firma y Aclaración Responsable
            </div>
          </div>
        </body>
        </html>
      `;

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank", "width=1200,height=900");
        if (!printWindow) {
          throw new Error("El navegador bloqueó la ventana de impresión. Permití popups e intentá de nuevo.");
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        const doPrint = () => {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 500);
        };

        if (printWindow.document.readyState === "complete") {
          doPrint();
        } else {
          printWindow.onload = doPrint;
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: `Control de Salas Cinemark Hoyts - ${formattedDate}`,
            UTI: "com.adobe.pdf",
          });
        } else {
          Alert.alert("PDF generado", `El reporte se guardó en:\n${uri}`);
        }
      }
    } catch (e: any) {
      console.error("PDF generation error:", e);
      Alert.alert("Error", e?.message || "No se pudo generar el archivo de reporte PDF.");
    }
  };

  // Build the list of active issues in the currently selected sala
  const getSelectedSalaIssues = () => {
    const salaKey = String(selectedSala);
    const roomIssues = report.issues[salaKey];
    if (!roomIssues) return [];

    // Get layout to see if it is Dbox
    const layoutObj = getRoomLayout(selectedSala);

    return Object.entries(roomIssues)
      .map(([key, val]) => {
        const [row, numStr] = key.split("-");
        const num = parseInt(numStr, 10);

        const rowSeats = layoutObj.seats[row];
        const seatLayout = rowSeats?.find((s) => s.number === num);
        const isDbox = seatLayout?.isDbox || false;

        return {
          key,
          row,
          num,
          isDbox,
          ...val,
        };
      })
      .sort((a, b) => {
        if (a.row !== b.row) return a.row.localeCompare(b.row);
        return a.num - b.num;
      });
  };

  const selectedSalaIssues = getSelectedSalaIssues();
  const selectedSalaCapacity = SALAS_INFO.find((s) => s.id === selectedSala)?.capacity || 0;

  // Seating grid rendering logic for active Sala
  const renderSeatingGrid = () => {
    const salaKey = String(selectedSala);
    const layout = getRoomLayout(selectedSala);

    const renderSeat = (seat: SeatInfo, index: number) => {
      if (seat.type === "empty") {
        return <View key={`empty-${seat.row}-${index}`} style={styles.seatEmpty} />;
      }

      const seatKey = `${seat.row}-${seat.number}`;
      const hasIssue = !!report.issues[salaKey]?.[seatKey];
      const isSelected = editingSeat?.row === seat.row && editingSeat?.num === seat.number;
      const isDbox = seat.isDbox;

      return (
        <TouchableOpacity
          key={seatKey}
          style={[
            styles.seat,
            isDbox && styles.seatDbox,
            hasIssue && styles.seatDamaged,
            isSelected && styles.seatSelected,
          ]}
          onPress={() => handleSeatPress(seat.row, seat.number, isDbox)}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.seatText,
              isDbox && styles.seatTextDbox,
              hasIssue && styles.seatTextDamaged,
            ]}
          >
            {seat.number}
          </Text>
        </TouchableOpacity>
      );
    };

    return (
      <View style={styles.mapCard}>
        <Text style={styles.mapTitle}>Mapa Interactivo de Sala {selectedSala}</Text>

        {/* Screen layout */}
        <View style={styles.screenIndicatorContainer}>
          <View style={styles.screenLine} />
          <Text style={styles.screenText}>PANTALLA</Text>
        </View>

        {/* Scroll containers for layout safety on small mobile widths */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          style={styles.mapScrollView}
          contentContainerStyle={styles.horizontalMapScroll}
        >
          <View style={styles.gridContainer}>
            {layout.rows.map((rowName) => {
              const rowSeats = [...layout.seats[rowName]].reverse();

              // Slice row seats dynamically based on aisles definition
              const sections: SeatInfo[][] = [];
              let prev = 0;
              layout.aisles.forEach((aisleIndex) => {
                sections.push(rowSeats.slice(prev, aisleIndex));
                prev = aisleIndex;
              });
              sections.push(rowSeats.slice(prev, layout.maxCol));

              return (
                <View key={rowName} style={styles.rowContainer}>
                  {/* Left row letter */}
                  <View style={styles.rowLetterWrap}>
                    <Text style={styles.rowLetterText}>{rowName}</Text>
                  </View>

                  {/* Render sections separated by aisles */}
                  {sections.map((section, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <View style={styles.aisleSpace} />}
                      <View style={styles.sectionWrap}>
                        {section.map((seat, idxSeat) => renderSeat(seat, idxSeat))}
                      </View>
                    </React.Fragment>
                  ))}

                  {/* Right row letter */}
                  <View style={styles.rowLetterWrap}>
                    <Text style={styles.rowLetterText}>{rowName}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Color Legend */}
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={styles.legendDotNormal} />
            <Text style={styles.legendText}>Buen estado</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendDotDbox} />
            <Text style={styles.legendText}>Butaca D-BOX</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendDotDamaged} />
            <Text style={styles.legendText}>Con daño reportado</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendDotSelected} />
            <Text style={styles.legendText}>Seleccionado</Text>
          </View>
        </View>

        <Text style={styles.mapHint}>
          Hacé clic en cualquier butaca para informar un daño o ver detalles.
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Rooms Horizontal Tab Selector */}
      <View style={styles.tabsCard}>
        <Text style={styles.cardHeaderTitle}>Control de Estado Físico de Salas</Text>
        <View style={styles.roomsGridContainer}>
          {SALAS_INFO.map((sala) => {
            const isSel = selectedSala === sala.id;
            const salaKey = String(sala.id);
            const damagedCount = Object.keys(report.issues[salaKey] || {}).length;

            return (
              <TouchableOpacity
                key={sala.id}
                style={[styles.salaTabBtn, isSel && styles.salaTabBtnActive]}
                onPress={() => setSelectedSala(sala.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.salaTabText, isSel && styles.salaTabTextActive]}>
                  {sala.name}
                </Text>
                {damagedCount > 0 && (
                  <View style={styles.badgeContainer}>
                    <Text style={styles.badgeText}>{damagedCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Main Panel grid */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando estado de salas...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          {/* Header info */}
          <View style={styles.roomStatusRow}>
            <View style={styles.roomStatusCard}>
              <Text style={styles.statusLabel}>SALA SELECCIONADA</Text>
              <Text style={styles.statusValue}>Sala {selectedSala}</Text>
            </View>
            <View style={styles.roomStatusCard}>
              <Text style={styles.statusLabel}>CAPACIDAD TOTAL</Text>
              <Text style={styles.statusValue}>{selectedSalaCapacity} butacas</Text>
            </View>
            <View style={styles.roomStatusCard}>
              <Text style={styles.statusLabel}>BUTACAS DAÑADAS</Text>
              <Text style={[styles.statusValue, selectedSalaIssues.length > 0 && { color: COLORS.danger }]}>
                {selectedSalaIssues.length}
              </Text>
            </View>
            {saving && (
              <View style={styles.syncingCard}>
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={styles.syncingText}>Guardando...</Text>
              </View>
            )}
          </View>

          {renderSeatingGrid()}

          {/* List of reported issues in current room */}
          <View style={styles.listCard}>
            <Text style={styles.listCardTitle}>
              Registro de Daños en Sala {selectedSala} ({selectedSalaIssues.length})
            </Text>

            {selectedSalaIssues.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <MaterialCommunityIcons name="check-circle-outline" size={48} color={COLORS.success} />
                <Text style={styles.emptyStateTitle}>Sala en óptimas condiciones</Text>
                <Text style={styles.emptyStateSub}>
                  No se registraron daños. Para agregar una butaca rota, hacela clic en el mapa superior.
                </Text>
              </View>
            ) : (
              <View style={styles.issuesList}>
                {selectedSalaIssues.map((item) => (
                  <View key={item.key} style={styles.issueItemCard}>
                    <View style={styles.issueItemHeader}>
                      <View style={styles.issueItemTitleWrap}>
                        <MaterialCommunityIcons name="sofa-single" size={18} color={item.isDbox ? COLORS.betaText : COLORS.danger} />
                        <Text style={styles.issueSeatName}>
                          Fila {item.row} - Butaca {item.num}
                          {item.isDbox ? " (D-BOX)" : ""}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleClearSeatReport(item.row, item.num)}
                        style={styles.deleteIssueBtn}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.issueBadgesRow}>
                      {item.respaldo && (
                        <View style={styles.partBadge}>
                          <Text style={styles.partBadgeText}>Respaldo</Text>
                        </View>
                      )}
                      {item.asiento && (
                        <View style={styles.partBadge}>
                          <Text style={styles.partBadgeText}>Asiento</Text>
                        </View>
                      )}
                      {item.apoyabrazos && (
                        <View style={styles.partBadge}>
                          <Text style={styles.partBadgeText}>Apoyabrazos</Text>
                        </View>
                      )}
                    </View>

                    {item.detalles ? (
                      <View style={styles.issueDetailsWrap}>
                        <Text style={styles.issueDetailsLabel}>Comentarios:</Text>
                        <Text style={styles.issueDetailsText}>{item.detalles}</Text>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      onPress={() => handleSeatPress(item.row, item.num, item.isDbox)}
                      style={styles.editIssueBtn}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.editIssueBtnText}>Editar daños</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Action Buttons Footer */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.pdfBtn} onPress={handleExportPdf} activeOpacity={0.85}>
              <MaterialCommunityIcons name="file-pdf-box" size={22} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.pdfBtnText}>Generar Reporte PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.clearBtn} onPress={handleClearActiveReport} activeOpacity={0.8}>
              <MaterialCommunityIcons name="refresh" size={20} color={COLORS.danger} style={{ marginRight: 6 }} />
              <Text style={styles.clearBtnText}>Reiniciar Todo</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Seat Edit Modal */}
      <Modal
        visible={editingSeat !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingSeat(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Editar Butaca {editingSeat?.row}-{editingSeat?.num}
              {editingSeat?.isDbox ? " (Premium D-BOX)" : ""}
            </Text>
            <Text style={styles.modalSubtitle}>Sala {selectedSala}</Text>

            <Text style={styles.modalSectionTitle}>Informar Componentes Dañados:</Text>
            <View style={styles.modalCheckboxes}>
              <TouchableOpacity
                style={[styles.modalCheckbox, respaldoRoto && styles.modalCheckboxChecked]}
                onPress={() => setRespaldoRoto(!respaldoRoto)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={respaldoRoto ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={24}
                  color={respaldoRoto ? COLORS.primary : COLORS.muted}
                />
                <Text style={[styles.modalCheckboxLabel, respaldoRoto && styles.modalCheckboxLabelChecked]}>
                  Respaldo roto
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalCheckbox, asientoRoto && styles.modalCheckboxChecked]}
                onPress={() => setAsientoRoto(!asientoRoto)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={asientoRoto ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={24}
                  color={asientoRoto ? COLORS.primary : COLORS.muted}
                />
                <Text style={[styles.modalCheckboxLabel, asientoRoto && styles.modalCheckboxLabelChecked]}>
                  Asiento roto
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalCheckbox, apoyabrazosRoto && styles.modalCheckboxChecked]}
                onPress={() => setApoyabrazosRoto(!apoyabrazosRoto)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={apoyabrazosRoto ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={24}
                  color={apoyabrazosRoto ? COLORS.primary : COLORS.muted}
                />
                <Text style={[styles.modalCheckboxLabel, apoyabrazosRoto && styles.modalCheckboxLabelChecked]}>
                  Apoyabrazos roto
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalInputBlock}>
              <Text style={styles.modalInputLabel}>Detalles adicionales / Comentarios</Text>
              <TextInput
                value={extraDetails}
                onChangeText={setExtraDetails}
                placeholder="Ej. costura rota, falta tornillo de base, chicle pegado"
                placeholderTextColor={COLORS.muted}
                style={styles.modalDetailsInput}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setEditingSeat(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleSaveSeat}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBtnPrimaryText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  tabsCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: THEME.spacing.md,
    ...THEME.shadow.soft,
  },
  cardHeaderTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: THEME.spacing.sm,
  },
  roomsGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  salaTabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  salaTabBtnActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  salaTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.muted,
  },
  salaTabTextActive: {
    color: COLORS.primary,
  },
  badgeContainer: {
    backgroundColor: COLORS.danger,
    borderRadius: 99,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFF",
  },
  scrollArea: {
    flex: 1,
  },
  roomStatusRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: THEME.spacing.md,
    flexWrap: "wrap",
    alignItems: "center",
  },
  roomStatusCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    alignItems: "center",
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: COLORS.muted,
    marginBottom: 4,
  },
  statusValue: {
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    color: COLORS.text,
  },
  syncingCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  syncingText: {
    fontSize: 11,
    color: COLORS.muted,
  },
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.xxl,
  },
  loadingText: {
    marginTop: THEME.spacing.sm,
    color: COLORS.muted,
    fontWeight: "600",
  },

  // Interactive Seating Map styling
  mapCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    alignItems: "center",
    ...THEME.shadow.soft,
  },
  mapTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: THEME.spacing.lg,
  },
  screenIndicatorContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  screenLine: {
    height: 6,
    width: "70%",
    borderBottomWidth: 3,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 100,
    borderBottomRightRadius: 100,
    marginBottom: 6,
  },
  screenText: {
    fontSize: 9,
    fontWeight: "800",
    color: COLORS.muted,
    letterSpacing: 2,
  },
  mapScrollView: {
    width: "100%",
  },
  horizontalMapScroll: {
    paddingVertical: 10,
    minWidth: "100%",
    justifyContent: "center",
  },
  gridContainer: {
    alignItems: "center",
    gap: 4,
  },
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowLetterWrap: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLetterText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.muted,
  },
  sectionWrap: {
    flexDirection: "row",
    gap: 3,
  },
  aisleSpace: {
    width: 14,
  },
  seat: {
    width: 19,
    height: 19,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  seatDbox: {
    backgroundColor: COLORS.betaBorder,
    borderColor: COLORS.betaText,
  },
  seatDamaged: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  seatSelected: {
    borderColor: "#EAB308",
    borderWidth: 2,
  },
  seatEmpty: {
    width: 19,
    height: 19,
  },
  seatText: {
    fontSize: 8,
    fontWeight: "600",
    color: COLORS.textSoft,
  },
  seatTextDbox: {
    color: "#FFF",
    fontWeight: "700",
  },
  seatTextDamaged: {
    color: "#FFF",
  },
  legendContainer: {
    flexDirection: "row",
    gap: 16,
    marginTop: THEME.spacing.lg,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDotNormal: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  legendDotDbox: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.betaBorder,
  },
  legendDotDamaged: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.danger,
  },
  legendDotSelected: {
    width: 12,
    height: 12,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: "#EAB308",
    backgroundColor: COLORS.border,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
  },
  mapHint: {
    fontSize: 10,
    fontStyle: "italic",
    color: COLORS.muted,
    marginTop: THEME.spacing.md,
    textAlign: "center",
  },

  // Reported list Card styling
  listCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    ...THEME.shadow.soft,
  },
  listCardTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: THEME.spacing.md,
  },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.xxl,
    paddingHorizontal: THEME.spacing.md,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 10,
    marginBottom: 6,
  },
  emptyStateSub: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 16,
    maxWidth: 280,
  },
  issuesList: {
    gap: 10,
  },
  issueItemCard: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.md,
  },
  issueItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  issueItemTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  issueSeatName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  deleteIssueBtn: {
    padding: 4,
  },
  issueBadgesRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  partBadge: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  partBadgeText: {
    fontSize: 10,
    color: COLORS.danger,
    fontWeight: "700",
  },
  issueDetailsWrap: {
    backgroundColor: COLORS.card,
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
  },
  issueDetailsLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 2,
  },
  issueDetailsText: {
    fontSize: 12,
    color: COLORS.text,
  },
  editIssueBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  editIssueBtnText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "600",
  },

  // PDF & Clear buttons styling
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  pdfBtn: {
    flex: 2,
    backgroundColor: COLORS.primary,
    borderRadius: THEME.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    ...THEME.shadow.soft,
  },
  pdfBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  clearBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: "transparent",
    borderRadius: THEME.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  clearBtnText: {
    color: COLORS.danger,
    fontWeight: "700",
    fontSize: 14,
  },

  // Modal Seat Editor Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.web,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
    color: COLORS.muted,
    textAlign: "center",
    marginBottom: THEME.spacing.lg,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 10,
  },
  modalCheckboxes: {
    gap: 8,
    marginBottom: THEME.spacing.lg,
  },
  modalCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCheckboxChecked: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  modalCheckboxLabel: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: "600",
  },
  modalCheckboxLabelChecked: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  modalInputBlock: {
    gap: 6,
    marginBottom: THEME.spacing.xl,
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
  },
  modalDetailsInput: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.md,
    padding: 10,
    color: COLORS.text,
    fontSize: 14,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnCancel: {
    backgroundColor: COLORS.border,
  },
  modalBtnCancelText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  modalBtnPrimary: {
    backgroundColor: COLORS.primary,
  },
  modalBtnPrimaryText: {
    color: "#FFF",
    fontWeight: "700",
  },
});
