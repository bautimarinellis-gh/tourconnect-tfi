import React, { useState, useEffect } from 'react';
import { Building2, ArrowRight } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Link } from 'react-router-dom';
import reporteService from '../../services/reporteService';
import '../mayorista/dashboard.css';

export const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    kpis: { mayoristas: 0, agencias: 0, reservas: 0, cotizacionesPendientes: 0 },
    ultimosMayoristas: []
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await reporteService.getAdminDashboard();
        setData(res || { kpis: {}, ultimosMayoristas: [] });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <Spinner center size="lg" />;

  const kpis = [
    { label: 'Total Mayoristas', value: data.kpis?.mayoristas || 0, icon: <Building2 size={18} />, link: '/admin/mayoristas' },
  ];

  return (
    <div className="dashboard-page">
      <div className="page-header dashboard-heading">
        <div>
          <p className="page-kicker">Administración</p>
          <h1 className="page-title">Dashboard Admin</h1>
        </div>
        <Link className="dashboard-quick-link" to="/admin/mayoristas">
          Ver mayoristas <ArrowRight size={14} />
        </Link>
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
              {kpi.link && (
                <Link to={kpi.link} className="dashboard-card-link">
                  Ver detalles <ArrowRight size={13} />
                </Link>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Últimos Mayoristas Creados</h2>
          <Link to="/admin/mayoristas" className="dashboard-quick-link" style={{ fontSize: '0.8125rem' }}>
            Ver todos <ArrowRight size={13} />
          </Link>
        </div>
        <Table>
          <thead>
            <TableRow>
              <TableCell isHeader>Nombre</TableCell>
              <TableCell isHeader>Email</TableCell>
              <TableCell isHeader>Estado</TableCell>
            </TableRow>
          </thead>
          <tbody>
            {data.ultimosMayoristas?.map(m => (
              <TableRow key={m._id}>
                <TableCell>{m.nombre}</TableCell>
                <TableCell>{m.email_contacto}</TableCell>
                <TableCell>
                  <Badge variant={m.activo ? 'success' : 'error'}>{m.activo ? 'Activo' : 'Inactivo'}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {(!data.ultimosMayoristas || data.ultimosMayoristas.length === 0) && (
              <TableRow>
                <TableCell colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-soft)' }}>No hay datos disponibles</TableCell>
              </TableRow>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
};
