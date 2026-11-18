import React from 'react';
import { motion as Motion, useReducedMotion } from 'motion/react';
import { useAuth } from '../../hooks/useAuth';
import { PLANE_PATH } from './planePath';
import './dashboardHero.css';

const RUTA = 'M8,62 C70,6 150,6 200,40 S300,78 352,22';

const fechaDeHoy = () => {
  const txt = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

const saludo = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Buen día';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
};

/**
 * Cabecera de los dashboards: saludo, fecha, título de la página y una
 * pequeña ruta con un avión en vuelo. `children` es la acción rápida.
 */
export const DashboardHero = ({ kicker, title, children }) => {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  // En mayoristas y agencias el nombre de usuario es la razón social: va completo.
  const nombre = (user?.nombre || '').trim();

  return (
    <Motion.header
      className="dash-hero"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="dash-hero-copy">
        <p className="dash-hero-kicker">
          {fechaDeHoy()} · {kicker}
        </p>
        <h1 className="dash-hero-title font-display">
          {saludo()}{nombre ? `, ${nombre}` : ''}
        </h1>
        <p className="dash-hero-sub">{title}</p>
      </div>

      <svg className="dash-hero-route" viewBox="0 0 360 80" aria-hidden="true">
        <path id="dash-hero-path" d={RUTA} className="dash-hero-path" />
        <circle cx="8" cy="62" r="4" className="dash-hero-pin" />
        <circle cx="352" cy="22" r="4" className="dash-hero-pin" />
        {!reduce && (
          <g className="dash-hero-plane">
            <g transform="rotate(90) scale(0.9) translate(-11.5,-12)">
              <path d={PLANE_PATH} />
            </g>
            <animateMotion dur="9s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1">
              <mpath href="#dash-hero-path" />
            </animateMotion>
          </g>
        )}
      </svg>

      {children && <div className="dash-hero-action">{children}</div>}
    </Motion.header>
  );
};
