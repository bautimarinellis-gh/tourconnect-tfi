import { useCallback, useMemo } from 'react';

// Event-bus fuera del árbol de React: <ToastContainer> publica acá su
// handler y useToast lo invoca. Vive en este módulo (y no en Toast.jsx) para
// que ese archivo exporte solo componentes y no rompa el Fast Refresh.
let _addToast = null;

export const registrarToastHandler = (handler) => {
  _addToast = handler;
};

export const useToast = () => {
  const show = useCallback((message, variant = 'success', title) => {
    if (_addToast) _addToast({ message, variant, title });
  }, []);

  // El objeto se memoiza para que su identidad sea estable entre renders.
  // Sin esto, cualquier useCallback/useEffect que dependa de `toast` se
  // re-crea en cada render, y si ese efecto hace un fetch que actualiza
  // estado, queda en un loop infinito de requests.
  return useMemo(() => ({
    success: (message, title) => show(message, 'success', title),
    error:   (message, title) => show(message, 'error', title),
    warning: (message, title) => show(message, 'warning', title),
    info:    (message, title) => show(message, 'info', title),
  }), [show]);
};
