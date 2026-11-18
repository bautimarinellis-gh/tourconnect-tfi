import React, { useState, useEffect } from 'react';
import { Calendar, DollarSign, FileText, ArrowRight, CheckCircle } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { DashboardHero } from '../../components/shared/DashboardHero';
import { Stagger, StaggerItem } from '../../components/motion/Stagger';
import { CountUp } from '../../components/motion/CountUp';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters';
import reporteService from '../../services/reporteService';
import '../mayorista/dashboard.css';

export const AgenciaDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await reporteService.getAgenciaDashboard();
        setData(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) return <Spinner center size="lg" />;

  const kpis = [
    { label: 'Reservas Activas', value: data?.reservas_activas || 0, icon: <Calendar size={18} />, link: '/agencia/reservas' },
    { label: 'Gasto del Mes', value: data?.gasto_mes || 0, format: formatCurrency, icon: <DollarSign size={18} />, link: '/agencia/reservas' },
    { label: 'Cotizaciones Pendientes', value: data?.cotizaciones_pendientes || 0, icon: <FileText size={18} />, link: '/agencia/cotizaciones?estado=pendiente' },
    { label: 'Aprobadas — Listas para Reservar', value: data?.cotizaciones_aprobadas || 0, icon: <CheckCircle size={18} />, link: '/agencia/cotizaciones?estado=aprobada' },
  ];

  return (
    <div className="dashboard-page">
      <DashboardHero kicker="Resumen comercial" title="Panel de agencia">
        <Link className="dashboard-quick-link" to="/agencia/catalogo">
          Ir al catálogo <ArrowRight size={14} />
        </Link>
      </DashboardHero>

      <Stagger className="dashboard-kpi-grid">
        {kpis.map((kpi) => (
          <StaggerItem key={kpi.label} className="metric-card-motion">
          <Card className="metric-card">
            <CardBody>
              <div className="dashboard-kpi-top">
                <div>
                  <p className="metric-label">{kpi.label}</p>
                  <h3 className="metric-value"><CountUp value={kpi.value} format={kpi.format} /></h3>
                </div>
                <div className="metric-icon">{kpi.icon}</div>
              </div>
              <Link to={kpi.link} className="dashboard-card-link">
                Ver detalles <ArrowRight size={13} />
              </Link>
            </CardBody>
          </Card>
        </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
};
