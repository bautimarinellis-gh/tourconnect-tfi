import React, { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';

/**
 * Cuenta desde 0 hasta "value" cuando el número entra en pantalla.
 * "format" recibe el valor intermedio y devuelve el texto a mostrar,
 * así se reutilizan los formateadores de moneda/número existentes.
 * Si "value" no es numérico se muestra tal cual.
 */
export const CountUp = ({ value, format = (n) => Math.round(n).toLocaleString('es-AR'), duration = 1.1, className }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const [display, setDisplay] = useState(() => (numeric ? format(reduce ? value : 0) : value));

  useEffect(() => {
    if (!numeric) {
      setDisplay(value);
      return undefined;
    }
    if (reduce || !inView) {
      if (reduce) setDisplay(format(value));
      return undefined;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView, reduce, numeric, duration]);

  return <span ref={ref} className={className}>{display}</span>;
};
