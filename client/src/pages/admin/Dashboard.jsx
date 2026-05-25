import React, { useState, useEffect } from 'react';
import { Users, Building2, Calendar, FileText } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
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

  return (
    <div className="dashboard-page">
      <div className="page-header dashboard-heading">
        <div>
          <p className="page-kicker">Administración</p>
          <h1 className="page-title">Dashboard Admin</h1>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <Card className="metric-card">
          <CardBody>
            <div className="dashboard-kpi-top">
            <div>
              <p className="metric-label">Total Mayoristas</p>
              <h3 className="metric-value">{data.kpis?.mayoristas || 0}</h3>
            </div>
            <div className="metric-icon"><Building2 size={18} /></div>
            </div>
          </CardBody>
        </Card>
        <Card className="metric-card">
          <CardBody>
            <div className="dashboard-kpi-top">
            <div>
              <p className="metric-label">Total Agencias</p>
              <h3 className="metric-value">{data.kpis?.agencias || 0}</h3>
            </div>
            <div className="metric-icon"><Users size={18} /></div>
            </div>
          </CardBody>
        </Card>
        <Card className="metric-card">
          <CardBody>
            <div className="dashboard-kpi-top">
            <div>
              <p className="metric-label">Cotizaciones Pendientes</p>
              <h3 className="metric-value">{data.kpis?.cotizacionesPendientes || 0}</h3>
            </div>
            <div className="metric-icon"><FileText size={18} /></div>
            </div>
          </CardBody>
        </Card>
        <Card className="metric-card">
          <CardBody>
            <div className="dashboard-kpi-top">
            <div>
              <p className="metric-label">Total Reservas</p>
              <h3 className="metric-value">{data.kpis?.reservas || 0}</h3>
            </div>
            <div className="metric-icon"><Calendar size={18} /></div>
            </div>
          </CardBody>
        </Card>
      </div>

      <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Últimos Mayoristas Creados</h2>
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
              <TableCell colSpan={3} style={{ textAlign: 'center' }}>No hay datos disponibles</TableCell>
            </TableRow>
          )}
        </tbody>
      </Table>
    </div>
  );
};
