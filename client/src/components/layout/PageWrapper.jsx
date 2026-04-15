import React from 'react';
import { Navbar } from './Navbar';
import './layout.css';

export const PageWrapper = ({ children }) => {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
        <div className="page-container">
          {children}
        </div>
      </main>
    </div>
  );
};
