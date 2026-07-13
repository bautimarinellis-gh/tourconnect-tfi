import React from 'react';

export const AuthBackground = () => (
  <div className="auth-bg-illustration" aria-hidden="true">
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <symbol id="tc-plane" viewBox="0 0 24 24">
          <path d="M21,16v-2l-8-5V3.5C13,2.67,12.33,2,11.5,2S10,2.67,10,3.5V9l-8,5v2l8-2.5V19l-2.5,1.5V22l3.5-1l3.5,1v-1.5L13,19v-5.5L21,16z" />
        </symbol>
      </defs>

      <use href="#tc-plane" className="tc-plane tc-plane-a" width="340" height="340" x="60%" y="-6%" />
      <use href="#tc-plane" className="tc-plane tc-plane-b" width="220" height="220" x="-4%" y="68%" />
      <use href="#tc-plane" className="tc-plane tc-plane-c" width="120" height="120" x="12%" y="10%" />
      <use href="#tc-plane" className="tc-plane tc-plane-d" width="160" height="160" x="78%" y="52%" />
      <use href="#tc-plane" className="tc-plane tc-plane-e" width="90" height="90" x="42%" y="84%" />
      <use href="#tc-plane" className="tc-plane tc-plane-f" width="110" height="110" x="86%" y="14%" />
    </svg>
  </div>
);
