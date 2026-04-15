import React from 'react';
import { PackageOpen } from 'lucide-react';
import './emptystate.css';

export const EmptyState = ({ 
  icon = <PackageOpen size={48} className="empty-state-icon" />, 
  title, 
  description, 
  action 
}) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon-container">
        {icon}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
};
