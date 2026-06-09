/**
 * Tipos específicos del feature Eventos
 */

export interface Evento {
  id: string;
  pelicula: string;
  sala: string;
  diaHora: Date;
  kdm?: boolean;
  dcp?: boolean;
  desayuno?: boolean;
  combo?: boolean;
  createdAt?: any;
  timestamp?: number;
  cineId?: string;
  cineNombre?: string;
}

export interface EventoFormData {
  pelicula: string;
  sala: string;
  diaHora: Date;
  kdm: boolean;
  dcp: boolean;
  desayuno: boolean;
  combo: boolean;
}

export const DEFAULT_EVENTO: EventoFormData = {
  pelicula: '',
  sala: '',
  diaHora: new Date(),
  kdm: false,
  dcp: false,
  desayuno: false,
  combo: false,
};
