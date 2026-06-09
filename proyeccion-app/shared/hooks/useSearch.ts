/**
 * Hook para manejar búsqueda con debounce
 * Evita hacer búsquedas en cada tecla presionada
 */

import { useEffect, useState } from "react";
import { TIMEOUTS } from "../utils/constants";

export interface UseSearchOptions {
  debounceMs?: number;
  minLength?: number;
}

export interface UseSearchResult {
  query: string;
  debouncedQuery: string;
  setQuery: (value: string) => void;
  clear: () => void;
  isSearching: boolean;
}

/**
 * Hook para manejar búsqueda con debounce
 * 
 * @example
 * ```typescript
 * const search = useSearch({ debounceMs: 300, minLength: 2 });
 * 
 * // En el input
 * <TextInput
 *   value={search.query}
 *   onChangeText={search.setQuery}
 *   placeholder="Buscar..."
 * />
 * 
 * // Usar debouncedQuery para la búsqueda real
 * useEffect(() => {
 *   if (search.debouncedQuery) {
 *     performSearch(search.debouncedQuery);
 *   }
 * }, [search.debouncedQuery]);
 * ```
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchResult {
  const {
    debounceMs = TIMEOUTS.SEARCH_DEBOUNCE_MS,
    minLength = 0,
  } = options;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= minLength) {
        setDebouncedQuery(query);
      } else {
        setDebouncedQuery("");
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs, minLength]);

  const clear = () => {
    setQuery("");
    setDebouncedQuery("");
  };

  const isSearching = query !== debouncedQuery;

  return {
    query,
    debouncedQuery,
    setQuery,
    clear,
    isSearching,
  };
}
