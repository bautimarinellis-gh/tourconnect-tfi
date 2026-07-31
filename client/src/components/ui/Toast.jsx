import React, { useState, useCallback, useEffect } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import './toast.css';

const icons = {
  success: <CheckCircle size={18} />,
  error:   <AlertCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info:    <Info size={18} />,
};

const titles = {
  success: 'Éxito',
  error:   'Error',
  warning: 'Advertencia',
  info:    'Información',
};

let _addToast = null;

export const useToast = () => {
  const show = useCallback((message, variant = 'success', title) => {
    if (_addToast) _addToast({ message, variant, title });
  }, []);

  return {
    success: (message, title) => show(message, 'success', title),
    error:   (message, title) => show(message, 'error', title),
    warning: (message, title) => show(message, 'warning', title),
    info:    (message, title) => show(message, 'info', title),
  };
};

export const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  const handleAdd = useCallback(({ message, variant, title }) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, variant, title, hiding: false }]);

    setTimeout(() => {
      setToasts(prev =>
        prev.map(t => t.id === id ? { ...t, hiding: true } : t)
      );
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 250);
    }, 3500);
  }, []);

  // Publica el handler en la variable a nivel de módulo desde un efecto,
  // no durante el render: _addToast es un event-bus fuera del árbol de
  // React (lo usa useToast), no un valor que la UI lea.
  useEffect(() => {
    _addToast = handleAdd;
  }, [handleAdd]);

  const dismiss = (id) => {
    setToasts(prev =>
      prev.map(t => t.id === id ? { ...t, hiding: true } : t)
    );
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 250);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.variant}${toast.hiding ? ' toast-hiding' : ''}`}
        >
          <span className="toast-icon">{icons[toast.variant]}</span>
          <div className="toast-body">
            <p className="toast-title">{toast.title || titles[toast.variant]}</p>
            <p className="toast-message">{toast.message}</p>
          </div>
          <button type="button" className="toast-close" onClick={() => dismiss(toast.id)}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
