/**
 * Hook genérico para manejar estado de modales
 * Simplifica el manejo de apertura/cierre y datos del modal
 */

import { useState } from "react";

export interface UseModalResult<T = any> {
  isOpen: boolean;
  data: T | null;
  open: (data?: T) => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Hook para manejar estado de modales
 * 
 * @example
 * ```typescript
 * const deleteModal = useModal<Evento>();
 * 
 * // Abrir modal con datos
 * deleteModal.open(evento);
 * 
 * // En el modal
 * <Modal visible={deleteModal.isOpen} onRequestClose={deleteModal.close}>
 *   {deleteModal.data && <Text>{deleteModal.data.pelicula}</Text>}
 * </Modal>
 * ```
 */
export function useModal<T = any>(): UseModalResult<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const open = (modalData?: T) => {
    if (modalData !== undefined) {
      setData(modalData);
    }
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setData(null);
  };

  const toggle = () => {
    setIsOpen((prev) => !prev);
  };

  return {
    isOpen,
    data,
    open,
    close,
    toggle,
  };
}

/**
 * Hook para manejar múltiples modales de forma organizada
 * 
 * @example
 * ```typescript
 * const modals = useModals({
 *   create: useModal(),
 *   edit: useModal<Evento>(),
 *   delete: useModal<Evento>(),
 * });
 * 
 * modals.create.open();
 * modals.edit.open(evento);
 * modals.delete.open(evento);
 * ```
 */
export function useModals<T extends Record<string, UseModalResult>>(
  modals: T
): T {
  return modals;
}
