import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import './alerts.css';

const icons = {
  success: <CheckCircle className="alert-icon" size={20} />,
  error: <AlertCircle className="alert-icon" size={20} />,
  warning: <AlertTriangle className="alert-icon" size={20} />,
  info: <Info className="alert-icon" size={20} />
};

export const Alert = ({ variant = 'info', title, children, className = '' }) => {
  return (
    <div className={`alert alert-${variant} ${className}`}>
      <div className="alert-icon-wrapper">
        {icons[variant]}
      </div>
      <div className="alert-content">
        {title && <h5 className="alert-title">{title}</h5>}
        <div className="alert-message">{children}</div>
      </div>
    </div>
  );
};
