import React from 'react';
import './badges.css';

export const Badge = ({ children, variant = 'info', className = '' }) => {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {children}
    </span>
  );
};
