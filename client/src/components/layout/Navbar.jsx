import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import './layout.css';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Links depend on role
  let links = [];
  if (user?.rol === 'admin') {
    links = [
      { name: 'Dashboard', path: '/admin/dashboard' },
      { name: 'Mayoristas', path: '/admin/mayoristas' }
    ];
  } else if (user?.rol === 'mayorista') {
    links = [
      { name: 'Dashboard', path: '/mayorista/dashboard' },
      { name: 'Agencias', path: '/mayorista/agencias' },
      { name: 'Productos', path: '/mayorista/productos' },
      { name: 'Cotizaciones', path: '/mayorista/cotizaciones' },
      { name: 'Reservas', path: '/mayorista/reservas' },
      { name: 'Reportes', path: '/mayorista/reportes' }
    ];
  } else if (user?.rol === 'agencia') {
    links = [
      { name: 'Dashboard', path: '/agencia/dashboard' },
      { name: 'Catálogo', path: '/agencia/catalogo' },
      { name: 'Cotizaciones', path: '/agencia/cotizaciones' },
      { name: 'Reservas', path: '/agencia/reservas' }
    ];
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <Link to="/" className="navbar-logo">
            <span className="logo-text">TourConnect</span>
          </Link>
          <div className="navbar-links">
            {links.map(link => {
              const isActive = location.pathname.startsWith(link.path);
              return (
                <Link key={link.path} to={link.path} className={`nav-item ${isActive ? 'active' : ''}`}>
                  {link.name}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="navbar-right">
          <div className="user-menu-container" ref={dropdownRef}>
            <button 
              className="user-menu-btn" 
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <div className="avatar">
                {user?.nombre?.charAt(0) || 'U'}
              </div>
              <span className="user-name">{user?.nombre || 'Usuario'}</span>
            </button>
            
            {showDropdown && (
              <div className="user-dropdown">
                <div className="dropdown-header">
                  <p className="dropdown-name">{user?.nombre}</p>
                  <p className="dropdown-email">{user?.email}</p>
                  <p className="dropdown-role">{user?.rol}</p>
                </div>
                <div className="dropdown-divider"></div>
                <button 
                  className="dropdown-item text-danger"
                  onClick={() => {
                    setShowDropdown(false);
                    logout();
                  }}
                >
                  <LogOut size={16} />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
