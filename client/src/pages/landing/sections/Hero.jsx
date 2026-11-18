import React from 'react';
import { Link } from 'react-router-dom';
import { motion as Motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, BadgeCheck, CalendarCheck, ShieldCheck, Sparkles, Tags } from 'lucide-react';
import { RouteMap } from '../../../components/shared/RouteMap';

const EASE = [0.16, 1, 0.3, 1];

const fadeUp = (delay) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: EASE },
});

const Cloud = ({ className }) => (
  <svg className={`lp-cloud ${className}`} viewBox="0 0 200 80" aria-hidden="true">
    <path d="M30 64c-14 0-24-8-24-19s10-19 24-19c3-14 16-22 31-22 15 0 27 9 31 21 4-2 9-3 14-3 17 0 30 11 30 25 0 2 0 3-1 4 9 2 15 7 15 13H30z" />
  </svg>
);

export const Hero = () => {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const mapY = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 60]);
  const cloudsY = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -90]);

  return (
    <section className="lp-hero" id="top">
      <Motion.div className="lp-clouds" style={{ y: cloudsY }} aria-hidden="true">
        <Cloud className="lp-cloud-a" />
        <Cloud className="lp-cloud-b" />
        <Cloud className="lp-cloud-c" />
      </Motion.div>

      <div className="lp-hero-inner">
        <div className="lp-hero-copy">
          <Motion.span className="lp-kicker" {...fadeUp(0.05)}>
            <Sparkles size={14} /> Plataforma B2B para el turismo
          </Motion.span>
          <Motion.h1 className="lp-hero-title font-display" {...fadeUp(0.15)}>
            Conectamos <em>mayoristas</em> y <em>agencias</em> de turismo en un solo lugar.
          </Motion.h1>
          <Motion.p className="lp-hero-lead" {...fadeUp(0.28)}>
            Dejá atrás el WhatsApp, el mail y las planillas. TourConnect calcula el precio de cada
            agencia, registra cada paso de cada operación y te responde sobre tu negocio en lenguaje natural.
          </Motion.p>
          <Motion.div className="lp-hero-ctas" {...fadeUp(0.4)}>
            <Link to="/login" className="lp-btn lp-btn-primary">
              Ingresar a la plataforma <ArrowRight size={17} />
            </Link>
            <a href="#como-funciona" className="lp-btn lp-btn-ghost">Ver cómo funciona</a>
          </Motion.div>
          <Motion.ul className="lp-hero-trust" {...fadeUp(0.52)}>
            <li><Tags size={15} /> Precio por agencia</li>
            <li><ShieldCheck size={15} /> Trazabilidad completa</li>
            <li><Sparkles size={15} /> Asistente inteligente</li>
          </Motion.ul>
        </div>

        <Motion.div
          className="lp-hero-visual"
          style={{ y: mapY }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2, ease: EASE }}
        >
          <div className="lp-map-card">
            <RouteMap />
          </div>

          <Motion.div
            className="lp-float-card lp-float-a"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 1.3, ease: EASE }}
          >
            <span className="lp-float-icon is-green"><BadgeCheck size={18} /></span>
            <div>
              <strong>Cotización aprobada</strong>
              <small>Norte Turismo · Paquete Salta y Jujuy</small>
            </div>
          </Motion.div>

          <Motion.div
            className="lp-float-card lp-float-b"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 1.6, ease: EASE }}
          >
            <span className="lp-float-icon is-olive"><CalendarCheck size={18} /></span>
            <div>
              <strong>Reserva confirmada</strong>
              <small>Viajes del Sur · Ushuaia Fin del Mundo</small>
            </div>
          </Motion.div>
        </Motion.div>
      </div>

      <a href="#como-funciona" className="lp-scroll-hint" aria-label="Bajar a cómo funciona">
        <span />
      </a>
    </section>
  );
};
