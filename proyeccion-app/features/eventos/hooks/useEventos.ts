/**
 * Hook para manejar eventos con paginación
 */

import { useMemo, useEffect } from 'react';
import { collection, where, orderBy } from 'firebase/firestore';
import { usePagination } from '@/shared/hooks';
import { db, CINES_COLLECTION } from '@/lib/firebaseConfig';
import { toDate } from '@/shared/utils';
import { Evento } from '../types';

export function useEventos(cineId: string | null, sessionLoading: boolean) {
  const colRef = useMemo(() => {
    if (!cineId) return null;
    return collection(db, CINES_COLLECTION, cineId, 'eventos');
  }, [cineId]);

  const now = new Date();
  const threshold = new Date(now.getTime() - 60 * 60 * 1000);

  const {
    items: eventos,
    loading,
    hasMore,
    loadFirstPage,
    loadMore,
  } = usePagination<Evento>(colRef, {
    pageSize: 10,
    mapFunction: (d) => {
      const data = d.data() as any;
      const diaHora = toDate(data.diaHora);

      return {
        id: d.id,
        pelicula: data.pelicula || '',
        sala: String(data.sala ?? ''),
        kdm: !!data.kdm,
        dcp: !!data.dcp,
        desayuno: !!data.desayuno,
        combo: !!data.combo,
        diaHora,
      } as Evento;
    },
    initialConstraints: [
      where('diaHora', '>=', threshold),
      orderBy('diaHora', 'asc'),
    ],
  });

  useEffect(() => {
    if (!sessionLoading && cineId) {
      loadFirstPage();
    }
  }, [cineId, sessionLoading]);

  return {
    eventos,
    loading,
    hasMore,
    loadFirstPage,
    loadMore,
  };
}
