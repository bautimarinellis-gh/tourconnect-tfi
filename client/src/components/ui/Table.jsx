import React from 'react';
import './tables.css';

export const Table = ({ children, className = '' }) => {
  return (
    <div className="table-container">
      <table className={`table ${className}`}>
        {children}
      </table>
    </div>
  );
};

export const TableRow = ({ children, className = '', onClick }) => {
  return (
    <tr 
      className={`table-row ${onClick ? 'table-row-clickable' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
};

export const TableCell = ({ children, className = '', isHeader = false }) => {
  if (isHeader) {
    return <th className={`table-cell table-header-cell ${className}`}>{children}</th>;
  }
  return <td className={`table-cell ${className}`}>{children}</td>;
};
