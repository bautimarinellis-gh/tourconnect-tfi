import React from 'react';
import { motion as Motion } from 'motion/react';
import { Check, Clock, Infinity as InfinityIcon, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Reveal } from '../../../components/motion/Reveal';
import { CountUp } from '../../../components/motion/CountUp';

// Mismos planes que server/utils/subscriptionPlans.js; precios del modelo de negocio.
// Los planes solo difieren en la cantidad de agencias: todos incluyen todo.
const CORE = ['Catálogo y precio por agencia', 'Cotizaciones, reservas y pagos', 'Reportes y auditoría', 'Asistente inteligente'];

const PLANES = [
  {
    nombre: 'Starter',
    precio: 79,
    agencias: 'Hasta 20 agencias',
    items: CORE,
  },
  {
    nombre: 'Professional',
    precio: 249,
    agencias: 'Hasta 100 agencias',
    destacado: true,
    items: CORE,
  },
  {
    nombre: 'Enterprise',
    precio: 599,
    agencias: 'Agencias ilimitadas',
    items: CORE,
  },
];

const CIFRAS = [
  { icon: Clock, valor: 15, prefijo: '10–', sufijo: ' min', texto: 'tarda hoy una cotización manual' },
  { icon: ShieldCheck, valor: 100, sufijo: '%', texto: 'de las operaciones quedan registradas' },
  { icon: Users, valor: 100, prefijo: '5 a ', texto: 'agencias por mayorista, el segmento objetivo' },
  { icon: InfinityIcon, valor: 24, sufijo: '/7', texto: 'el asistente responde cuando lo necesites' },
];

export const Planes = () => (
  <section className="lp-section lp-planes" id="planes">
    <div className="lp-stats">
      {CIFRAS.map((c, i) => {
        const Icon = c.icon;
        return (
          <Reveal key={c.texto} delay={i * 0.08} className="lp-stat">
            <Icon size={20} />
            <strong className="font-display">
              {c.prefijo}
              <CountUp value={c.valor} />
              {c.sufijo}
            </strong>
            <span>{c.texto}</span>
          </Reveal>
        );
      })}
    </div>

    <Reveal className="lp-section-head">
      <span className="lp-eyebrow">Planes</span>
      <h2 className="lp-h2 font-display">Una suscripción mensual, según tu red.</h2>
      <p className="lp-lead">Todas las funciones en todos los planes: cambia la cantidad de agencias. Precios en dólares por mes.</p>
    </Reveal>

    <div className="lp-plan-grid">
      {PLANES.map((p, i) => (
        <Reveal key={p.nombre} delay={i * 0.1} className={`lp-plan ${p.destacado ? 'is-featured' : ''}`}>
          <Motion.div
            className="lp-plan-inner"
            whileHover={{ y: -8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            {p.destacado && <span className="lp-plan-badge">Recomendado</span>}
            <h3>{p.nombre}</h3>
            <p className="lp-plan-price">
              <span className="font-display">USD {p.precio}</span>
              <small>/ mes</small>
            </p>
            <p className="lp-plan-agencias">{p.agencias}</p>
            <ul>
              {p.items.map((it) => (
                <li key={it}><Check size={16} /> {it}</li>
              ))}
            </ul>
          </Motion.div>
        </Reveal>
      ))}
    </div>

    <Reveal className="lp-plan-note">
      ¿Ya tenés cuenta? <Link to="/login">Ingresá a la plataforma</Link>
    </Reveal>
  </section>
);
