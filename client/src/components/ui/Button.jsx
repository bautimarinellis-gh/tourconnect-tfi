import React from 'react';
import './ui.css';

export const Button = ({ children, variant = 'primary', size = 'md', className = '', isLoading, type = 'button', ...props }) => {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${className} ${isLoading ? 'btn-loading' : ''}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? <span className="spinner spinner-sm" style={{borderColor: 'currentColor', borderTopColor: 'transparent'}}></span> : null}
      {children}
    </button>
  );
};
