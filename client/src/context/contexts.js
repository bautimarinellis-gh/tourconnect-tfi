import { createContext } from 'react';

// Los objetos de contexto viven separados de sus providers: un archivo .jsx
// que exporta algo además de componentes rompe el Fast Refresh de Vite
// (regla react-refresh/only-export-components).
export const AuthContext = createContext();
export const ThemeContext = createContext();
