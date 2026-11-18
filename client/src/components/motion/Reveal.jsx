import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

const EASE = [0.16, 1, 0.3, 1];

/**
 * Hace aparecer a su contenido (fade + desplazamiento) cuando entra en
 * pantalla. Con "prefers-reduced-motion" se muestra sin animar.
 */
export const Reveal = ({
  as = 'div',
  children,
  delay = 0,
  y = 24,
  x = 0,
  duration = 0.7,
  once = true,
  amount = 0.25,
  className,
  style,
  ...rest
}) => {
  const reduce = useReducedMotion();
  const Comp = motion[as] ?? motion.div;
  if (reduce) {
    const Plain = as;
    return <Plain className={className} style={style} {...rest}>{children}</Plain>;
  }
  return (
    <Comp
      className={className}
      style={style}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once, amount }}
      transition={{ duration, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Comp>
  );
};
