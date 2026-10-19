import React, { useState, useCallback, useEffect } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { registrarToastHandler } from '../../hooks/useToast';
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

  // Publica el handler desde un efecto, no durante el render: es un
  // event-bus fuera del árbol de React (lo usa useToast), no un valor que
  // la UI lea.
  useEffect(() => {
    registrarToastHandler(handleAdd);
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
