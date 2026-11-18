import React, { useEffect } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { useLocation } from 'react-router-dom';

// El asistente flotante del mayorista vive dentro del PageWrapper: no se
// anima (ni se re-monta) al navegar, para que conserve su conversación.
const EXCLUIDOS = ':not(.assistant-launcher):not(.assistant-panel)';

/**
 * Transición corta entre secciones de los paneles. Se re-dispara con cada
 * cambio de ruta sin desmontar a los hijos.
 */
export const PageTransition = ({ children }) => {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const ref = React.useRef(null);

  useEffect(() => {
    if (reduce || !ref.current) return undefined;
    const targets = ref.current.querySelectorAll(`:scope > ${EXCLUIDOS}`);
    if (!targets.length) return undefined;
    const controls = animate(
      targets,
      { opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0px)'] },
      { duration: 0.32, ease: [0.16, 1, 0.3, 1] }
    );
    // Un transform residual convertiría al contenido en bloque contenedor
    // de cualquier elemento position:fixed que tenga adentro.
    controls.then(() => targets.forEach((el) => { el.style.transform = ''; }));
    return () => controls.stop();
  }, [pathname, reduce]);

  return <div ref={ref} className="page-transition">{children}</div>;
};
