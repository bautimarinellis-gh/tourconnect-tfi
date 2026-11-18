import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion as Motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { BarChart3, CalendarCheck, FileText, PackagePlus } from 'lucide-react';
import { PlaneGlyph } from '../../../components/shared/PlaneGlyph';
import { Reveal } from '../../../components/motion/Reveal';

/*
 * "Cómo funciona": una ruta punteada baja por la sección y un avión la
 * recorre según el scroll. Cada parada es un paso del circuito real del
 * sistema. El SVG se estira al tamaño de la sección (preserveAspectRatio
 * none) y el avión es un elemento HTML posicionado en porcentaje, así no se
 * deforma; su rumbo se corrige por la relación de aspecto real.
 */

const PASOS = [
  {
    icon: PackagePlus,
    titulo: 'El mayorista carga su catálogo',
    texto: 'Productos, tarifas y reglas de precio por agencia. Cada agencia ve solo su precio, calculado automáticamente.',
  },
  {
    icon: FileText,
    titulo: 'La agencia cotiza en minutos',
    texto: 'Arma la cotización desde el catálogo y la envía. El mayorista la responde desde el mismo lugar, sin idas y vueltas.',
  },
  {
    icon: CalendarCheck,
    titulo: 'Se confirma la reserva',
    texto: 'La cotización aprobada pasa a reserva con pago informado o con Mercado Pago. Todo queda registrado.',
  },
  {
    icon: BarChart3,
    titulo: 'Reportes y auditoría',
    texto: 'Ventas por agencia y producto, y el historial de quién hizo qué y cuándo, listos para decidir.',
  },
];

// Coordenadas en un lienzo de 1000 × 1600 unidades.
const RUTA_DESKTOP =
  'M500,0 C500,100 410,150 410,260 S590,460 590,620 S410,820 410,980 S590,1180 590,1320 S500,1500 500,1600';
const RUTA_MOBILE =
  'M60,0 C60,120 110,200 90,400 S40,600 70,800 S110,1000 80,1200 S50,1450 60,1600';

const useIsMobile = () => {
  const query = '(max-width: 760px)';
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
};

export const FlightRoute = () => {
  const reduce = useReducedMotion();
  const mobile = useIsMobile();
  const sectionRef = useRef(null);
  const trackRef = useRef(null);
  const pathRef = useRef(null);
  const planeRef = useRef(null);
  const sizeRef = useRef({ w: 1, h: 1 });

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start 70%', 'end 60%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });

  const ruta = mobile ? RUTA_MOBILE : RUTA_DESKTOP;

  const ubicarAvion = (p) => {
    const path = pathRef.current;
    const plane = planeRef.current;
    if (!path || !plane) return;
    const len = path.getTotalLength();
    const t = Math.min(Math.max(p, 0), 1) * len;
    const a = path.getPointAtLength(t);
    const b = path.getPointAtLength(Math.min(t + 4, len));
    const { w, h } = sizeRef.current;
    const angulo = Math.atan2(((b.y - a.y) * h) / 1600, ((b.x - a.x) * w) / 1000) * (180 / Math.PI);
    plane.style.left = `${a.x / 10}%`;
    plane.style.top = `${a.y / 16}%`;
    plane.style.transform = `translate(-50%, -50%) rotate(${angulo + 90}deg)`;
  };

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      sizeRef.current = { w: entry.contentRect.width, h: entry.contentRect.height };
      ubicarAvion(progress.get());
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta]);

  useMotionValueEvent(progress, 'change', ubicarAvion);

  return (
    <section className="lp-section lp-route" id="como-funciona" ref={sectionRef}>
      <Reveal className="lp-section-head">
        <span className="lp-eyebrow">Cómo funciona</span>
        <h2 className="lp-h2 font-display">De la tarifa a la reserva, sin escalas.</h2>
        <p className="lp-lead">
          Hoy cada cotización tarda entre 10 y 15 minutos y no deja registro. Con TourConnect, el
          circuito completo entre mayorista y agencia vive en un solo lugar.
        </p>
      </Reveal>

      <div className="lp-route-track" ref={trackRef}>
        <svg className="lp-route-svg" viewBox="0 0 1000 1600" preserveAspectRatio="none" aria-hidden="true">
          <path ref={pathRef} d={ruta} className="lp-route-base" />
          <Motion.path
            d={ruta}
            className="lp-route-progress"
            style={{ pathLength: reduce ? 1 : progress }}
          />
        </svg>

        <div className="lp-route-plane" ref={planeRef} aria-hidden="true">
          <PlaneGlyph size={38} />
        </div>

        <ol className="lp-route-steps">
          {PASOS.map((p, i) => {
            const Icon = p.icon;
            return (
              <li key={p.titulo} className={`lp-route-step ${i % 2 ? 'is-right' : 'is-left'}`}>
                <Reveal className="lp-step-card" x={mobile ? 0 : i % 2 ? 40 : -40} y={20} amount={0.5}>
                  <span className="lp-step-num">0{i + 1}</span>
                  <span className="lp-step-icon"><Icon size={22} /></span>
                  <h3>{p.titulo}</h3>
                  <p>{p.texto}</p>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};
