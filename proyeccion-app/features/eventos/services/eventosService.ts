/**
 * Servicio de lógica de negocio para Eventos
 */

import { Timestamp } from 'firebase/firestore';
import { addDoc, collection, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, CINES_COLLECTION } from '@/lib/firebaseConfig';
import { Evento, EventoFormData } from '../types';

class EventosService {
  private getCollection(cineId: string) {
    return collection(db, CINES_COLLECTION, cineId, 'eventos');
  }

  async createEvento(cineId: string, data: EventoFormData): Promise<void> {
    this.validateEvento(data);

    const evento = {
      pelicula: data.pelicula.trim(),
      sala: data.sala.trim(),
      diaHora: Timestamp.fromDate(data.diaHora),
      timestamp: data.diaHora.getTime(),
      kdm: data.kdm,
      dcp: data.dcp,
      desayuno: data.desayuno,
      combo: data.combo,
    };

    await addDoc(this.getCollection(cineId), evento);
  }

  async updateEvento(
    cineId: string,
    id: string,
    data: Partial<EventoFormData>
  ): Promise<void> {
    const updates: any = {};

    if (data.sala !== undefined) updates.sala = data.sala.trim();
    if (data.kdm !== undefined) updates.kdm = data.kdm;
    if (data.dcp !== undefined) updates.dcp = data.dcp;
    if (data.desayuno !== undefined) updates.desayuno = data.desayuno;
    if (data.combo !== undefined) updates.combo = data.combo;

    if (data.diaHora) {
      updates.diaHora = Timestamp.fromDate(data.diaHora);
      updates.timestamp = data.diaHora.getTime();
    }

    const docRef = doc(this.getCollection(cineId), id);
    await updateDoc(docRef, updates);
  }

  async deleteEvento(cineId: string, id: string): Promise<void> {
    const docRef = doc(this.getCollection(cineId), id);
    await deleteDoc(docRef);
  }

  private validateEvento(data: Partial<EventoFormData>): void {
    if (data.pelicula !== undefined && !data.pelicula.trim()) {
      throw new Error('La película es requerida');
    }
    if (data.sala !== undefined && !data.sala.trim()) {
      throw new Error('La sala es requerida');
    }
  }
}

export const eventosService = new EventosService();
