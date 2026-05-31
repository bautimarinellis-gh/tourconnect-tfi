import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import './themeToggle.css';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button 
      className="theme-toggle-btn" 
      onClick={toggleTheme} 
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label="Cambiar tema de la página"
    >
      <div className="theme-toggle-track">
        <div className={`theme-toggle-icon-wrapper ${isDark ? 'is-dark' : 'is-light'}`}>
          <Sun className="theme-icon sun-icon" size={20} />
          <Moon className="theme-icon moon-icon" size={20} />
        </div>
      </div>
    </button>
  );
};
export default ThemeToggle;
