import React, { useEffect } from 'react';
import { LandingNav } from './sections/LandingNav';
import { Hero } from './sections/Hero';
import { FlightRoute } from './sections/FlightRoute';
import { Roles } from './sections/Roles';
import { AssistantDemo } from './sections/AssistantDemo';
import { Planes } from './sections/Planes';
import { FinalCta } from './sections/FinalCta';
import './landing.css';

/**
 * Página pública de TourConnect. Se muestra en "/" a quien no tiene sesión;
 * con sesión, "/" sigue llevando al panel del rol (ver RootRedirect en App.jsx).
 */
export const Landing = () => {
  useEffect(() => {
    document.documentElement.classList.add('lp-smooth');
    return () => document.documentElement.classList.remove('lp-smooth');
  }, []);

  return (
    <div className="lp">
      <LandingNav />
      <main>
        <Hero />
        <FlightRoute />
        <Roles />
        <AssistantDemo />
        <Planes />
      </main>
      <FinalCta />
    </div>
  );
};
