import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '../../../components/motion/Reveal';
import { PlaneGlyph } from '../../../components/shared/PlaneGlyph';
import logoImg from '/logo.png';

export const FinalCta = () => (
  <>
    <section className="lp-band lp-cta">
      <div className="lp-cta-sky" aria-hidden="true">
        <span className="lp-cta-trail" />
        <PlaneGlyph size={30} heading={90} className="lp-cta-plane" />
      </div>
      <Reveal className="lp-cta-inner">
        <h2 className="lp-h2 font-display">Tu operación, lista para despegar.</h2>
        <p className="lp-lead">Entrá con tu usuario y empezá a cotizar, reservar y medir desde un solo lugar.</p>
        <Link to="/login" className="lp-btn lp-btn-light">
          Ingresar a TourConnect <ArrowRight size={17} />
        </Link>
      </Reveal>
    </section>

    <footer className="lp-footer">
      <span className="tc-logo-crop lp-footer-logo"><img src={logoImg} alt="TourConnect" /></span>
      <p>
        Trabajo Final de Ingeniería · UAI, Facultad de Tecnología Informática
        <br />
        Bautista Marinelli Scaglia · 2026
      </p>
    </footer>
  </>
);
