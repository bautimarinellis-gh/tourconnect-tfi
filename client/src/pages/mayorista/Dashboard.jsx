import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Users, DollarSign, Package, FileText, ArrowRight, CheckCircle } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { AssistantChat } from '../../components/shared/AssistantChat';
import reporteService from '../../services/reporteService';
import { usePermiso } from '../../hooks/usePermiso';
import { formatCurrency } from '../../utils/formatters';
import './dashboard.css';

export const MayoristaDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const puedeVerReportes = usePermiso('VerReportes');

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await reporteService.getMayoristaDashboard();
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
    { label: 'Reservas Activas', value: data?.reservas_activas || 0, icon: <Calendar size={18} />, link: '/mayorista/reservas' },
    { label: 'Ingresos del Mes', value: formatCurrency(data?.ingresos_mes || 0), icon: <DollarSign size={18} />, link: '/mayorista/reportes' },
    { label: 'Agencias Activas', value: data?.agencias_activas || 0, icon: <Users size={18} />, link: '/mayorista/agencias' },
    { label: 'Cotizaciones Pendientes', value: data?.cotizaciones_pendientes || 0, icon: <FileText size={18} />, link: '/mayorista/cotizaciones' },
    { label: 'Pagos por Confirmar', value: data?.pagos_por_confirmar || 0, icon: <CheckCircle size={18} />, link: '/mayorista/reservas?estado=pago_informado' },
  ];

  return (
    <div className="dashboard-page">
      <div className="page-header dashboard-heading">
        <div>
          <p className="page-kicker">Mes actual</p>
          <h1 className="page-title">Panel de control</h1>
        </div>
        {/* Sin VerReportes el acceso rápido no se muestra: llevaría a una
            sección que este usuario no tiene en el menú. */}
        {puedeVerReportes && (
          <Link className="dashboard-quick-link" to="/mayorista/reportes">
            Ver reportes <ArrowRight size={14} />
          </Link>
        )}
      </div>

      <div className="dashboard-kpi-grid">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="metric-card">
            <CardBody>
              <div className="dashboard-kpi-top">
                <div>
                  <p className="metric-label">{kpi.label}</p>
                  <h3 className="metric-value">{kpi.value}</h3>
                </div>
                <div className="metric-icon">{kpi.icon}</div>
              </div>
              <Link to={kpi.link} className="dashboard-card-link">
                Ver detalles <ArrowRight size={13} />
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="dashboard-panel-grid">
        <Card className="dashboard-panel">
          <CardBody>
            <div className="dashboard-panel-header">
              <h2>Producto top</h2>
              <Package size={18} />
            </div>
            {data?.producto_top ? (
              <div className="top-product">
                <div className="metric-icon">
                  <Package size={18} />
                </div>
                <div>
                  <h4>{data.producto_top.nombre}</h4>
                  <p>{data.producto_top.ventas} ventas en el mes</p>
                </div>
              </div>
            ) : (
              <p className="dashboard-muted">No hay datos suficientes este mes.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Asistente Inteligente ── */}
      <div className="dashboard-assistant-section">
        <AssistantChat />
      </div>

    </div>
  );
};
