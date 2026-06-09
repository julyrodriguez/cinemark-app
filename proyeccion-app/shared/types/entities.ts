/**
 * Tipos de entidades del dominio
 * Define las estructuras de datos principales de la aplicación
 */

import { BaseDoc } from "./common";

/**
 * Evento de proyección
 */
export interface Evento extends BaseDoc {
  diaHora: Date;
  pelicula: string;
  sala: string;
  kdm?: boolean;
  dcp?: boolean;
  desayuno?: boolean;
  combo?: boolean;
  timestamp?: number;
  cineId?: string;
  cineNombre?: string;
}

/**
 * Crédito de película
 */
export interface Credito extends BaseDoc {
  pelicula: string;
  peliculaLower?: string;
  horaCredito: string;
  horaApaga1?: string | null;
  horaPrende1?: string | null;
  horaApaga2?: string | null;
  horaPrende2?: string | null;
  horas?: string[];
}

/**
 * RMA (Return Merchandise Authorization)
 */
export interface Rma extends BaseDoc {
  rmaNumber: string;
  incidentNumber?: string;
  details?: string;
}

/**
 * Evento de calendario
 */
export interface CalendarEvent extends BaseDoc {
  date: string; // YYYY-MM-DD
  type: "TTA" | "MTM" | "EVENTO" | "Especial";
  title: string;
  description?: string;
  cineId?: string;
}

/**
 * Configuración de cine
 */
export interface CineConfig {
  nombre: string;
  authEmail: string;
  salasCount: number;
  updatedAt?: any;
}

/**
 * Cine (información básica)
 */
export interface Cine {
  id: string;
  nombre: string;
  authEmail: string;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
  authUid?: string | null;
}

/**
 * IP autorizada
 */
export interface AuthorizedIp extends BaseDoc {
  ip: string;
  label: string;
  type: "fixed" | "mobile";
  active: boolean;
  expiresAt?: any | null;
  lastUsedAt?: any | null;
  cineId: string;
}

/**
 * Programación
 */
export interface Programacion extends BaseDoc {
  cineId: string;
  fecha: string;
  datos: any; // Estructura específica de programación
}

/**
 * Marketing
 */
export interface Marketing extends BaseDoc {
  cineId: string;
  fecha: string;
  datos: any; // Estructura específica de marketing
}
