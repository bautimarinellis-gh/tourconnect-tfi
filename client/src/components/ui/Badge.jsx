import React from 'react';
import './badges.css';

export const Badge = ({ children, variant = 'info', className = '', ...props }) => {
  return (
    <span className={`badge badge-${variant} ${className}`} {...props}>
      {children}
    </span>
  );
};
