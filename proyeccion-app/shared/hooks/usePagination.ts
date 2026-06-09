/**
 * Hook genérico para manejar paginación de Firestore
 * Reutilizable en cualquier componente que necesite paginación
 */

import { useRef, useState } from "react";
import {
  CollectionReference,
  DocumentData,
  getDocs,
  limit as qLimit,
  orderBy,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  startAfter,
  where,
} from "firebase/firestore";

export interface UsePaginationOptions<T> {
  pageSize?: number;
  mapFunction: (doc: QueryDocumentSnapshot<DocumentData>) => T;
  initialConstraints?: QueryConstraint[];
}

export interface UsePaginationResult<T> {
  items: T[];
  loading: boolean;
  hasMore: boolean;
  loadFirstPage: () => Promise<void>;
  loadMore: () => Promise<void>;
  reset: () => void;
}

/**
 * Hook para manejar paginación de Firestore
 * 
 * @example
 * ```typescript
 * const { items, loading, hasMore, loadFirstPage, loadMore } = usePagination({
 *   collection: eventosCollection,
 *   pageSize: 10,
 *   mapFunction: (doc) => ({ id: doc.id, ...doc.data() }),
 *   initialConstraints: [where("active", "==", true), orderBy("createdAt", "desc")]
 * });
 * ```
 */
export function usePagination<T>(
  collection: CollectionReference | null,
  options: UsePaginationOptions<T>
): UsePaginationResult<T> {
  const { pageSize = 10, mapFunction, initialConstraints = [] } = options;

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  const loadFirstPage = async () => {
    if (!collection) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const qy = query(collection, ...initialConstraints, qLimit(pageSize));

      const snap = await getDocs(qy);

      const rows = snap.docs.map(mapFunction);

      setItems(rows);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === pageSize);
    } catch (error) {
      console.error("Error loading first page:", error);
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || !lastDocRef.current || !collection) return;

    try {
      const qy = query(
        collection,
        ...initialConstraints,
        startAfter(lastDocRef.current),
        qLimit(pageSize)
      );

      const snap = await getDocs(qy);

      const extra = snap.docs.map(mapFunction);

      setItems((prev) => prev.concat(extra));
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === pageSize);
    } catch (error) {
      console.error("Error loading more:", error);
    }
  };

  const reset = () => {
    setItems([]);
    setHasMore(true);
    lastDocRef.current = null;
  };

  return {
    items,
    loading,
    hasMore,
    loadFirstPage,
    loadMore,
    reset,
  };
}
