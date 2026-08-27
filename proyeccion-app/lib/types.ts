export type ID = string;

export interface BaseDoc {
  id?: ID;
  createdAt?: any;   // Firestore Timestamp
  createdBy?: string;
}
export type Rma = {
  id: string;
  rmaNumber: string;          // número de RMA (string)
  incidentNumber?: string;    // nro de incidente
  details?: string;           // detalles
  createdAt?: any;            // Firestore Timestamp | Date | string
  createdBy?: string;
  createdName?: string;
};


export type Evento = {
  id: string;
  diaHora: Date;
  pelicula: string;
  sala: string;
  kdm?: boolean;
  dcp?: boolean;
  desayuno?: boolean;
  combo?: boolean;
  timestamp?: number;
  duracion?: number;
};

export interface Credito extends BaseDoc {
  fechaISO: string;
  pelicula: string;
  sala: number;
  post1?: string;
  post2?: string;
  post3?: string;
  post4?: string;
  post5?: string;
}

export interface RMA extends BaseDoc {
  titulo: string;
  descripcion?: string;
  prioridad?: "baja" | "media" | "alta";
  estado?: "abierto" | "en_progreso" | "cerrado";
}

export type Dcp = {
  id: string;
  nombre: string;
  numeroDisco: string;
  ubicacion: string;            // "TMS" | "Sala 1" | "Sala 2" ...
  fechaLlegada: string;         // ISO date string
  fechaSalida?: string | null;  // ISO date string, null = activo
  retirado: boolean;
  sub?: boolean;                // subtitulado — default true
  cas?: boolean;                // castellano — default true
  createdAt?: any;              // Firestore Timestamp
  createdBy?: string;
  createdName?: string;
};

export interface Mantenimiento extends BaseDoc {
  date: string; // YYYY-MM-DD
  type: "A" | "B" | "C" | "D";
  performedBy: "Nosotros" | "Ingeniero";
  notes?: string;
  calendarEventId?: string | null;
  createdName?: string;
}

