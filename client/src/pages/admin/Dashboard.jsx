import React, { useState, useEffect } from 'react';
import { Users, Building2, Calendar, FileText } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import reporteService from '../../services/reporteService';

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
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard Admin</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#E0E7FF', borderRadius: '50%', color: '#3730A3' }}>
              <Building2 size={24} />
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>Total Mayoristas</p>
              <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{data.kpis?.mayoristas || 0}</h3>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#DCFCE7', borderRadius: '50%', color: '#166534' }}>
              <Users size={24} />
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>Total Agencias</p>
              <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{data.kpis?.agencias || 0}</h3>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#FEF3C7', borderRadius: '50%', color: '#92400E' }}>
              <FileText size={24} />
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>Cotizaciones Pendientes</p>
              <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{data.kpis?.cotizacionesPendientes || 0}</h3>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#DBEAFE', borderRadius: '50%', color: '#1E40AF' }}>
              <Calendar size={24} />
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>Total Reservas</p>
              <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{data.kpis?.reservas || 0}</h3>
            </div>
          </CardBody>
        </Card>
      </div>

      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Últimos Mayoristas Creados</h2>
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
