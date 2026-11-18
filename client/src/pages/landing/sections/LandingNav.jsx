import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion as Motion, useMotionValueEvent, useScroll } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import logoImg from '/logo.png';

const LINKS = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#roles', label: 'Mayoristas y agencias' },
  { href: '#asistente', label: 'Asistente' },
  { href: '#planes', label: 'Planes' },
];

export const LandingNav = () => {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));

  return (
    <Motion.header
      className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <a href="#top" className="lp-nav-logo tc-logo-crop" aria-label="TourConnect, volver arriba">
        <img src={logoImg} alt="TourConnect" />
      </a>
      <nav className="lp-nav-links" aria-label="Secciones">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href}>{l.label}</a>
        ))}
      </nav>
      <Link to="/login" className="lp-btn lp-btn-primary lp-btn-sm">
        Ingresar <ArrowRight size={15} />
      </Link>
    </Motion.header>
  );
};
