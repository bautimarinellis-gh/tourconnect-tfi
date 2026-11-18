import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { animate, motion as Motion, useReducedMotion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { RouteMap } from './RouteMap';
import { AuthBackground } from './AuthBackground';

/**
 * Marco común de las pantallas de acceso (login, reseteo y alta de
 * contraseña): panel de marca con el mapa de rutas a la izquierda y el
 * formulario a la derecha. Cuando cambia `shakeKey` (p. ej. el texto del
 * error) la tarjeta del formulario hace un "shake" corto.
 */
export const AuthShell = ({ children, shakeKey }) => {
  const reduce = useReducedMotion();
  const formRef = useRef(null);

  useEffect(() => {
    if (!shakeKey || reduce || !formRef.current) return;
    const box = formRef.current.querySelector('.auth-form-box');
    if (!box) return;
    animate(box, { x: [0, -9, 8, -5, 4, 0] }, { duration: 0.45, ease: 'easeOut' });
  }, [shakeKey, reduce]);

  return (
    <div className="auth-shell">
      <aside className="auth-brand" aria-hidden="false">
        <Link to="/" className="auth-back">
          <ArrowLeft size={16} /> Volver al inicio
        </Link>

        <div className="auth-brand-map" aria-hidden="true">
          <RouteMap tone="dark" planeDuration={18} />
        </div>

        <Motion.div
          className="auth-brand-copy"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="font-display">Cada cotización, a un paso de la reserva.</h2>
          <p>Mayoristas y agencias de turismo trabajando en un mismo lugar.</p>
        </Motion.div>
      </aside>

      <div className="auth-main">
        <AuthBackground />
        <Motion.div
          ref={formRef}
          className="auth-form-container"
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </Motion.div>
      </div>
    </div>
  );
};

/** Logo recortado para la cabecera de los formularios de acceso. */
export const AuthLogo = ({ src }) => (
  <span className="tc-logo-crop auth-logo-crop">
    <img src={src} alt="TourConnect" />
  </span>
);
