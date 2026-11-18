import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion, useInView, useReducedMotion } from 'motion/react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { Reveal } from '../../../components/motion/Reveal';

/*
 * Demostración del Asistente Inteligente: una pregunta que se "tipea" sola,
 * el indicador de escritura y la respuesta con un mini gráfico. Los datos
 * son ilustrativos (agencias de la demo), no se consulta al servidor.
 */

const PREGUNTA = '¿Qué agencias vendieron más este trimestre?';
const BARRAS = [
  { nombre: 'Norte Turismo', valor: 92 },
  { nombre: 'Viajes del Sur', valor: 74 },
  { nombre: 'Patagonia Express', valor: 58 },
  { nombre: 'Litoral Viajes', valor: 41 },
];

export const AssistantDemo = () => {
  const chatRef = useRef(null);
  const inView = useInView(chatRef, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [texto, setTexto] = useState('');
  // inicio → tipeando → pensando → respuesta
  const [fase, setFase] = useState('inicio');
  const [corrida, setCorrida] = useState(0);

  useEffect(() => {
    if (fase !== 'inicio' || !inView) return undefined;
    if (reduce) {
      setTexto(PREGUNTA);
      setFase('respuesta');
      return undefined;
    }
    let i = 0;
    const timers = [];
    setFase('tipeando');
    const tick = setInterval(() => {
      i += 1;
      setTexto(PREGUNTA.slice(0, i));
      if (i >= PREGUNTA.length) {
        clearInterval(tick);
        timers.push(setTimeout(() => setFase('pensando'), 350));
        timers.push(setTimeout(() => setFase('respuesta'), 1700));
      }
    }, 38);
    return () => {
      clearInterval(tick);
      timers.forEach(clearTimeout);
    };
    // La animación arranca una vez por "corrida"; cambiar de fase no la reinicia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, corrida, reduce]);

  const repetir = () => {
    setTexto('');
    setFase('inicio');
    setCorrida((c) => c + 1);
  };

  const enviada = fase === 'pensando' || fase === 'respuesta';

  return (
    <section className="lp-band lp-assistant" id="asistente">
      <div className="lp-assistant-inner">
        <Reveal className="lp-assistant-copy">
          <span className="lp-eyebrow is-light">Asistente inteligente</span>
          <h2 className="lp-h2 font-display">Preguntale a tu negocio, en castellano.</h2>
          <p className="lp-lead">
            Ventas, cotizaciones pendientes, agencias más activas: el asistente responde con datos
            reales del mayorista, respeta los permisos de cada usuario y muestra la información en gráficos.
          </p>
          <ul className="lp-assistant-points">
            <li>Respuestas en segundos, sin armar reportes</li>
            <li>Cada consulta exige el mismo permiso que su sección</li>
            <li>Si la IA no está disponible, responde igual con un motor propio</li>
          </ul>
        </Reveal>

        <Reveal className="lp-chat-wrap" delay={0.15}>
          <div className="lp-chat" ref={chatRef}>
            <div className="lp-chat-head">
              <span className="lp-chat-avatar"><Sparkles size={16} /></span>
              <div>
                <strong>Asistente TourConnect</strong>
                <small>{fase === 'pensando' ? 'Escribiendo…' : 'En línea'}</small>
              </div>
              <button type="button" className="lp-chat-replay" onClick={repetir} aria-label="Repetir la demostración">
                <RotateCcw size={15} />
              </button>
            </div>

            <div className="lp-chat-body" aria-live="polite">
              <div className="lp-msg is-bot">¡Hola! ¿Qué querés saber de tu operación?</div>

              {enviada && (
                <Motion.div
                  className="lp-msg is-user"
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                >
                  {PREGUNTA}
                </Motion.div>
              )}

              <AnimatePresence mode="wait">
                {fase === 'pensando' && (
                  <Motion.div
                    key="typing"
                    className="lp-msg is-bot lp-typing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span /><span /><span />
                  </Motion.div>
                )}
                {fase === 'respuesta' && (
                  <Motion.div
                    key="answer"
                    className="lp-msg is-bot lp-answer"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                  >
                    <p>Estas son las 4 agencias con más ventas del trimestre:</p>
                    <div className="lp-bars">
                      {BARRAS.map((b, i) => (
                        <div className="lp-bar-row" key={b.nombre}>
                          <span>{b.nombre}</span>
                          <div className="lp-bar-track">
                            <Motion.div
                              className="lp-bar-fill"
                              initial={{ width: reduce ? `${b.valor}%` : '0%' }}
                              animate={{ width: `${b.valor}%` }}
                              transition={{ duration: 0.9, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="lp-chat-input">
              <span className={texto && !enviada ? '' : 'is-placeholder'}>
                {enviada ? 'Escribí tu consulta…' : texto || 'Escribí tu consulta…'}
                {fase === 'tipeando' && <i className="lp-caret" />}
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
