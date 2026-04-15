import React from 'react';
import './ui.css';

export const Textarea = React.forwardRef(({ label, error, className = '', ...props }, ref) => {
  return (
    <div className={`input-group ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <textarea 
        ref={ref}
        className={`input-control ${error ? 'input-error' : ''}`} 
        {...props} 
      />
      {error && <span className="input-error-message">{error}</span>}
    </div>
  );
});
Textarea.displayName = 'Textarea';
