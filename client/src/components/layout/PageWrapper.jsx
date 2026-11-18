import React from 'react';
import { Navbar } from './Navbar';
import { PageTransition } from '../motion/PageTransition';
import './layout.css';

export const PageWrapper = ({ children }) => {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
        <div className="page-container">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
};
