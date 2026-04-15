import React from 'react';
import './ui.css';

export const Spinner = ({ size = 'md', center = false }) => {
  const spinnerClass = `spinner spinner-${size}`;
  if (center) {
    return (
      <div className="spinner-container-center">
        <span className={spinnerClass}></span>
      </div>
    );
  }
  return <span className={spinnerClass}></span>;
};
