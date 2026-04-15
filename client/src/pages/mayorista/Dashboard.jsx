import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Users, DollarSign, Package, FileText, ArrowRight, CheckCircle } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import reporteService from '../../services/reporteService';

export const MayoristaDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

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
    { label: 'Reservas Activas', value: data?.reservas_activas || 0, icon: <Calendar />, color: '#1E40AF', bg: '#DBEAFE', link: '/mayorista/reservas' },
    { label: 'Ingresos del Mes', value: `$${(data?.ingresos_mes || 0).toLocaleString('es-AR')}`, icon: <DollarSign />, color: '#166534', bg: '#DCFCE7', link: '/mayorista/reportes' },
    { label: 'Agencias Activas', value: data?.agencias_activas || 0, icon: <Users />, color: '#92400E', bg: '#FEF3C7', link: '/mayorista/agencias' },
    { label: 'Cotizaciones Pendientes', value: data?.cotizaciones_pendientes || 0, icon: <FileText />, color: '#991B1B', bg: '#FEE2E2', link: '/mayorista/cotizaciones' },
    { label: 'Pagos por Confirmar', value: data?.pagos_por_confirmar || 0, icon: <CheckCircle />, color: '#9A3412', bg: '#FED7AA', link: '/mayorista/reservas?estado=pago_informado' },
  ];

  return (
    <div>
      <div 
        style={{ 
          height: '240px', 
          borderRadius: '12px', 
          marginBottom: '2rem', 
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          padding: '2rem'
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.4))', zIndex: 1 }}></div>
        <img 
          src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2670&auto=format&fit=crop" 
          alt="Travel Banner" 
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
        />
        <div style={{ position: 'relative', zIndex: 2, color: 'white' }}>
          <h1 style={{ fontSize: '2.5rem', margin: '0 0 0.5rem 0', fontWeight: 700, color: 'white' }}>Bienvenido al Panel de Control</h1>
          <p style={{ fontSize: '1.125rem', margin: 0, opacity: 0.9, color: 'white' }}>Gestione sus agencias, productos y reservas fácilmente.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {kpis.map((kpi, index) => (
          <Card key={index} style={{ border: 'none', boxShadow: 'var(--shadow-md)' }}>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: '0.875rem', fontWeight: 500 }}>{kpi.label}</p>
                  <h3 style={{ margin: '0.5rem 0 0', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text)' }}>{kpi.value}</h3>
                </div>
                <div style={{ padding: '0.75rem', backgroundColor: kpi.bg, color: kpi.color, borderRadius: '12px' }}>
                  {kpi.icon}
                </div>
              </div>
              <div style={{ alignSelf: 'flex-end', marginTop: 'auto' }}>
                <Link to={kpi.link} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>
                  Ver detalles <ArrowRight size={14} />
                </Link>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
        <Card>
          <CardBody>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Producto Top</h2>
            {data?.producto_top ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ padding: '1rem', backgroundColor: '#E0E7FF', color: '#3730A3', borderRadius: '50%' }}>
                  <Package size={24} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 0.25rem', fontSize: '1.125rem' }}>{data.producto_top.nombre}</h4>
                  <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>{data.producto_top.ventas} ventas en el mes</p>
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--color-text-soft)' }}>No hay datos suficientes este mes.</p>
            )}
          </CardBody>
        </Card>
      </div>

    </div>
  );
};
