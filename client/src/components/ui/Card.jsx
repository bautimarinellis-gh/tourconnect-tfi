import React from 'react';
import './cards.css';

export const Card = ({ children, className = '', ...props }) => {
  return <div className={`card ${className}`} {...props}>{children}</div>;
};

export const CardHeader = ({ children, className = '', ...props }) => {
  return <div className={`card-header ${className}`} {...props}>{children}</div>;
};

export const CardBody = ({ children, className = '', ...props }) => {
  return <div className={`card-body ${className}`} {...props}>{children}</div>;
};
