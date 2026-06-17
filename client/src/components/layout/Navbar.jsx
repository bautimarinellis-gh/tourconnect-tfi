import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  FileBarChart,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  Package,
  PanelLeft,
  Plane,
  Shield,
  ShoppingBag,
  Users,
} from 'lucide-react';
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

  let links = [];
  if (user?.rol === 'admin') {
    links = [
      { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
      { name: 'Mayoristas', path: '/admin/mayoristas', icon: Building2 }
    ];
  } else if (user?.rol === 'mayorista') {
    links = [
      { name: 'Dashboard', path: '/mayorista/dashboard', icon: LayoutDashboard },
      { name: 'Agencias', path: '/mayorista/agencias', icon: Users },
      { name: 'Productos', path: '/mayorista/productos', icon: Package },
      { name: 'Cotizaciones', path: '/mayorista/cotizaciones', icon: FileText },
      { name: 'Reservas', path: '/mayorista/reservas', icon: ClipboardList },
      { name: 'Reportes', path: '/mayorista/reportes', icon: FileBarChart }
    ];
  } else if (user?.rol === 'agencia') {
    links = [
      { name: 'Dashboard', path: '/agencia/dashboard', icon: LayoutDashboard },
      { name: 'Catálogo', path: '/agencia/catalogo', icon: Map },
      { name: 'Cotizaciones', path: '/agencia/cotizaciones', icon: ShoppingBag },
      { name: 'Reservas', path: '/agencia/reservas', icon: ClipboardList }
    ];
  }

  const roleLabel = {
    admin: 'Administrador',
    mayorista: 'Mayorista',
    agencia: 'Agencia',
  }[user?.rol] || 'Usuario';

  const activeLink = links.find(link => location.pathname.startsWith(link.path));

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <Link to="/" className="navbar-logo">
            <span className="logo-mark"><Plane size={17} /></span>
            <span className="logo-text">TourConnect</span>
          </Link>
          <div className="workspace-switcher">
            <BriefcaseBusiness size={14} />
            <span>{roleLabel}</span>
          </div>
          <div className="navbar-links">
            {links.map(link => {
              const isActive = location.pathname.startsWith(link.path);
              const Icon = link.icon;
              return (
                <Link key={link.path} to={link.path} className={`nav-item ${isActive ? 'active' : ''}`}>
                  <Icon size={16} />
                  {link.name}
                </Link>
              );
            })}
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
