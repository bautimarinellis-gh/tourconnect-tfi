import React from 'react';

import { PLANE_PATH } from './planePath';

// En su viewBox el avión apunta hacia arriba; "heading" lo rota en grados (90 = hacia la derecha).

export const PlaneGlyph = ({ size = 24, heading = 0, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    style={{ transform: `rotate(${heading}deg)`, ...style }}
    aria-hidden="true"
  >
    <path d={PLANE_PATH} fill="currentColor" />
  </svg>
);
