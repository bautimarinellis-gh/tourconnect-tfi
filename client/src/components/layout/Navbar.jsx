import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BriefcaseBusiness,
  LogOut,
  PanelLeft,
  Shield,
  User,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { navegacionAgrupada } from '../../config/navegacion';
import { ProfileModal } from '../shared/ProfileModal';
import './layout.css';
import logoImg from '/logo.png';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
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

  // El menú se arma según los permisos efectivos: una sección que el usuario no
  // puede usar no aparece, y un grupo que queda sin secciones tampoco. El
  // bloqueo por contenido sigue existiendo en App.jsx para quien llegue por URL.
  const grupos = useMemo(
    () => navegacionAgrupada(user?.rol, user?.permisos ?? []),
    [user?.rol, user?.permisos]
  );

  const roleLabel = {
    admin: 'Administrador',
    mayorista: 'Mayorista',
    agencia: 'Agencia',
  }[user?.rol] || 'Usuario';

  const activeLink = grupos
    .flatMap(grupo => grupo.items)
    .find(link => location.pathname.startsWith(link.path));

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <Link to="/" className="navbar-logo">
            <img src={logoImg} alt="TourConnect" className="navbar-logo-img" />
          </Link>
          <div className="workspace-switcher">
            <BriefcaseBusiness size={14} />
            <span>{roleLabel}</span>
          </div>
          <div className="navbar-links">
            {grupos.map(grupo => (
              <div key={grupo.id ?? '_sueltos'} className="nav-group">
                {grupo.label && <p className="nav-group-label">{grupo.label}</p>}
                {grupo.items.map(link => {
                  const isActive = location.pathname.startsWith(link.path);
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      className={`nav-item ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={16} />
                      {link.name}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="navbar-right">
          <div className="topbar-context">
            <PanelLeft size={16} />
            <span>{activeLink?.name || 'Panel'}</span>
          </div>
          <div className="user-menu-container" ref={dropdownRef}>
            <button
              type="button"
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
                  <p className="dropdown-role"><Shield size={12} /> {roleLabel}</p>
                </div>
                <div className="dropdown-divider"></div>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setShowDropdown(false);
                    setShowProfileModal(true);
                  }}
                >
                  <User size={16} />
                  <span>Ver Perfil</span>
                </button>
                <button
                  type="button"
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

      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </nav>
  );
};
