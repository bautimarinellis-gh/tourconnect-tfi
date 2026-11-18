import React from 'react';
import { motion as Motion } from 'motion/react';
import {
  Building2, Store, Tags, Users, FileCheck2, ShieldCheck,
  LayoutGrid, Send, CreditCard, History,
} from 'lucide-react';
import { Reveal } from '../../../components/motion/Reveal';
import { Stagger, StaggerItem } from '../../../components/motion/Stagger';

const ROLES = [
  {
    id: 'mayorista',
    icon: Building2,
    titulo: 'Para el mayorista',
    bajada: 'Ordená tu red de agencias y dejá de recalcular precios a mano.',
    items: [
      { icon: Users, t: 'Alta y gestión de agencias con su propia regla de precio' },
      { icon: Tags, t: 'Catálogo de productos con tarifas y vigencias' },
      { icon: FileCheck2, t: 'Cotizaciones y pagos para responder en un solo panel' },
      { icon: ShieldCheck, t: 'Usuarios, permisos y auditoría de cada acción' },
    ],
  },
  {
    id: 'agencia',
    icon: Store,
    titulo: 'Para la agencia',
    bajada: 'Cotizá con tu precio real y seguí cada reserva sin perseguir a nadie.',
    items: [
      { icon: LayoutGrid, t: 'Catálogo del mayorista con tu precio ya calculado' },
      { icon: Send, t: 'Cotizaciones enviadas y respondidas en minutos' },
      { icon: CreditCard, t: 'Reservas con pago informado o Mercado Pago' },
      { icon: History, t: 'Historial completo de tu actividad' },
    ],
  },
];

export const Roles = () => (
  <section className="lp-section lp-roles" id="roles">
    <Reveal className="lp-section-head">
      <span className="lp-eyebrow">Dos lados, una plataforma</span>
      <h2 className="lp-h2 font-display">Cada uno ve lo que necesita.</h2>
      <p className="lp-lead">
        Pensado para mayoristas medianos, de 5 a 100 agencias, que todavía trabajan de forma manual.
      </p>
    </Reveal>

    <div className="lp-roles-grid">
      {ROLES.map((r, idx) => {
        const Icon = r.icon;
        return (
          <Reveal key={r.id} delay={idx * 0.12} className={`lp-role-card is-${r.id}`}>
            <Motion.div
              className="lp-role-inner"
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
              <span className="lp-role-icon"><Icon size={24} /></span>
              <h3 className="font-display">{r.titulo}</h3>
              <p>{r.bajada}</p>
              <Stagger as="ul" inView className="lp-role-list" delay={0.15}>
                {r.items.map((it) => {
                  const ItIcon = it.icon;
                  return (
                    <StaggerItem as="li" key={it.t}>
                      <ItIcon size={17} /> <span>{it.t}</span>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </Motion.div>
          </Reveal>
        );
      })}
    </div>
  </section>
);
