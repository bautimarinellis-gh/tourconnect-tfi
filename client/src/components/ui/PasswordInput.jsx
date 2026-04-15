import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './ui.css';

export const PasswordInput = React.forwardRef(({ label, error, className = '', ...props }, ref) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`input-group ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <div className="password-input-wrapper">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={`input-control password-input-control ${error ? 'input-error' : ''}`}
          {...props}
        />
        <button
          type="button"
          className="password-toggle-btn"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && <span className="input-error-message">{error}</span>}
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';
