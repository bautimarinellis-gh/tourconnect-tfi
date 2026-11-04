import React from 'react';
import './ui.css';

export const Button = ({ children, variant = 'primary', size = 'md', className = '', isLoading, disabled, type = 'button', ...props }) => {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${className} ${isLoading ? 'btn-loading' : ''}`}
      {...props}
      // Después del spread: mientras carga queda deshabilitado aunque llegue
      // disabled={false}, así un doble clic no repite la acción.
      disabled={isLoading || disabled}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? <span className="spinner spinner-sm" style={{borderColor: 'currentColor', borderTopColor: 'transparent'}}></span> : null}
      {children}
    </button>
  );
};
