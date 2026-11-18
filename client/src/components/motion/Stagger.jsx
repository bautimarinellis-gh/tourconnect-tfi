import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

const EASE = [0.16, 1, 0.3, 1];

const container = (stagger, delay) => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

const staggerItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

/**
 * Contenedor que hace entrar a sus hijos en cascada. Cada hijo que deba
 * animarse tiene que ser un <StaggerItem>.
 */
export const Stagger = ({
  as = 'div',
  children,
  stagger = 0.07,
  delay = 0,
  inView = false,
  className,
  ...rest
}) => {
  const reduce = useReducedMotion();
  const Comp = motion[as] ?? motion.div;
  const trigger = inView
    ? { whileInView: 'show', viewport: { once: true, amount: 0.15 } }
    : { animate: 'show' };
  return (
    <Comp
      className={className}
      variants={container(stagger, delay)}
      initial={reduce ? false : 'hidden'}
      {...trigger}
      {...rest}
    >
      {children}
    </Comp>
  );
};

export const StaggerItem = ({ as = 'div', children, className, ...rest }) => {
  const Comp = motion[as] ?? motion.div;
  return (
    <Comp className={className} variants={staggerItem} {...rest}>
      {children}
    </Comp>
  );
};
