import React from 'react';
import { Minus, Plus } from 'lucide-react';
import './ui.css';

export const NumberStepper = ({ label, value, onChange, min = 0, max = Infinity, step = 1, className = '' }) => {
  const handleDecrement = () => {
    const next = Number(value) - step;
    if (next >= min) onChange(next);
  };

  const handleIncrement = () => {
    const next = Number(value) + step;
    if (next <= max) onChange(next);
  };

  return (
    <div className={`input-group ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <div className="stepper-wrapper">
        <button
          type="button"
          className="stepper-btn"
          onClick={handleDecrement}
          disabled={Number(value) <= min}
          aria-label="Disminuir"
        >
          <Minus size={14} />
        </button>
        <span className="stepper-value">{value}</span>
        <button
          type="button"
          className="stepper-btn"
          onClick={handleIncrement}
          disabled={Number(value) >= max}
          aria-label="Aumentar"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};
