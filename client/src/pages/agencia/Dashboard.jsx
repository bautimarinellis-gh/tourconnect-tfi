import React, { useState, useEffect } from 'react';
import { Calendar, DollarSign, FileText, ArrowRight } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Link } from 'react-router-dom';
import reporteService from '../../services/reporteService';

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
    { label: 'Reservas Activas', value: data?.reservas_activas || 0, icon: <Calendar />, color: '#1E40AF', bg: '#DBEAFE', link: '/agencia/reservas' },
    { label: 'Gasto del Mes', value: `$${data?.gasto_mes || 0}`, icon: <DollarSign />, color: '#166534', bg: '#DCFCE7', link: '/agencia/reservas' },
    { label: 'Cotizaciones Pendientes', value: data?.cotizaciones_pendientes || 0, icon: <FileText />, color: '#991B1B', bg: '#FEE2E2', link: '/agencia/cotizaciones' },
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
          src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2674&auto=format&fit=crop" 
          alt="Travel Banner" 
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
        />
        <div style={{ position: 'relative', zIndex: 2, color: 'white' }}>
          <h1 style={{ fontSize: '2.5rem', margin: '0 0 0.5rem 0', fontWeight: 700, color: 'white' }}>Explora y Cotiza</h1>
          <p style={{ fontSize: '1.125rem', margin: 0, opacity: 0.9 }}>Encuentra las mejores experiencias para sus clientes.</p>
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
    </div>
  );
};
