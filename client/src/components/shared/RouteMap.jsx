import React, { useId } from 'react';
import { motion as Motion, useReducedMotion } from 'motion/react';
import { PLANE_PATH } from './planePath';
import './routeMap.css';

/*
 * Mapa estilizado de rutas (no es un mapa geográfico exacto): destinos de
 * Argentina ubicados de forma aproximada, con Rosario como hub. Los arcos se
 * dibujan al montar y un avión recorre el circuito en loop.
 * Se reutiliza en la landing (hero) y en el panel de marca del login.
 */

const DESTINOS = [
  { id: 'salta', nombre: 'Salta', x: 250, y: 92 },
  { id: 'iguazu', nombre: 'Iguazú', x: 478, y: 118 },
  { id: 'mendoza', nombre: 'Mendoza', x: 168, y: 238 },
  { id: 'rosario', nombre: 'Rosario', x: 336, y: 222, hub: true },
  { id: 'bsas', nombre: 'Buenos Aires', x: 392, y: 282 },
  { id: 'bariloche', nombre: 'Bariloche', x: 160, y: 372 },
  { id: 'ushuaia', nombre: 'Ushuaia', x: 236, y: 492 },
];

const hub = DESTINOS.find((d) => d.hub);

// Arco cuadrático entre dos puntos, curvado "hacia arriba".
const arco = (a, b, curva = 0.28) => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // Vector perpendicular al tramo, orientado siempre hacia arriba (y < 0).
  let px = b.y - a.y;
  let py = -(b.x - a.x);
  if (py > 0) { px = -px; py = -py; }
  const cx = mx + px * curva;
  const cy = my + py * curva;
  return `M${a.x},${a.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x},${b.y}`;
};

const RUTAS = DESTINOS.filter((d) => !d.hub).map((d) => ({ id: d.id, d: arco(hub, d) }));

// Circuito que recorre el avión: sale de Rosario, toca varios destinos y vuelve.
const CIRCUITO =
  `M${hub.x},${hub.y} ` +
  'Q400,120 478,118 ' +
  'Q360,40 250,92 ' +
  'Q150,140 168,238 ' +
  'Q90,300 160,372 ' +
  'Q170,470 236,492 ' +
  'Q360,450 392,282 ' +
  `Q380,230 ${hub.x},${hub.y}`;

export const RouteMap = ({ className, showLabels = true, planeDuration = 16, tone = 'auto' }) => {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      className={`route-map route-map--${tone} ${className ?? ''}`}
      viewBox="0 0 600 540"
      role="img"
      aria-label="Mapa de rutas entre destinos turísticos de Argentina con un avión en vuelo"
    >
      <defs>
        <pattern id={`dots-${uid}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.3" className="route-map-dot" />
        </pattern>
        <radialGradient id={`fade-${uid}`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`mask-${uid}`}>
          <rect width="600" height="540" fill={`url(#fade-${uid})`} />
        </mask>
      </defs>

      <rect width="600" height="540" fill={`url(#dots-${uid})`} mask={`url(#mask-${uid})`} />

      {RUTAS.map((r, i) => (
        <Motion.path
          key={r.id}
          d={r.d}
          className="route-map-arc"
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 0.3 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}

      <path id={`circuito-${uid}`} d={CIRCUITO} className="route-map-circuit" />

      {DESTINOS.map((d, i) => (
        <Motion.g
          key={d.id}
          initial={reduce ? false : { opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 + i * 0.08, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ transformOrigin: `${d.x}px ${d.y}px` }}
        >
          {d.hub && !reduce && <circle cx={d.x} cy={d.y} r="10" className="route-map-pulse" />}
          <circle cx={d.x} cy={d.y} r={d.hub ? 9 : 6} className={d.hub ? 'route-map-hub' : 'route-map-pin'} />
          {showLabels && (
            <text
              x={d.x + (d.x > 400 ? -12 : 12)}
              y={d.y + 4}
              textAnchor={d.x > 400 ? 'end' : 'start'}
              className={`route-map-label ${d.hub ? 'is-hub' : ''}`}
            >
              {d.nombre}
            </text>
          )}
        </Motion.g>
      ))}

      {!reduce && (
        <g className="route-map-plane">
          {/* El avión del path mira hacia arriba: se gira 90° para que
              rotate="auto" lo alinee con la dirección de vuelo. */}
          <g transform="rotate(90) scale(1.6) translate(-11.5,-12)">
            <path d={PLANE_PATH} />
          </g>
          <animateMotion dur={`${planeDuration}s`} repeatCount="indefinite" rotate="auto">
            <mpath href={`#circuito-${uid}`} />
          </animateMotion>
        </g>
      )}
    </svg>
  );
};
