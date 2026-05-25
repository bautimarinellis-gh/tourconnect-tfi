import React from 'react';
import './tables.css';

export const Table = ({ children, className = '', ...props }) => {
  return (
    <div className="table-container">
      <table className={`table ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
};

export const TableRow = ({ children, className = '', onClick, ...props }) => {
  return (
    <tr 
      className={`table-row ${onClick ? 'table-row-clickable' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  );
};

export const TableCell = ({ children, className = '', isHeader = false, ...props }) => {
  if (isHeader) {
    return <th className={`table-cell table-header-cell ${className}`} {...props}>{children}</th>;
  }
  return <td className={`table-cell ${className}`} {...props}>{children}</td>;
};
