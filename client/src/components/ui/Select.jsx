import React from 'react';
import './ui.css';

export const Select = React.forwardRef(({ label, error, options = [], placeholder = 'Seleccionar...', className = '', ...props }, ref) => {
  return (
    <div className={`input-group ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <select
        ref={ref}
        className={`input-control ${error ? 'input-error' : ''}`}
        {...props}
      >
        {placeholder && !options.some(o => String(o.value) === '') && (
          <option value="" disabled>{placeholder}</option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <span className="input-error-message">{error}</span>}
    </div>
  );
});
Select.displayName = 'Select';
