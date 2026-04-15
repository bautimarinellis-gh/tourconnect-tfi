import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { formatCurrency } from '../../utils/formatters';
import reporteService from '../../services/reporteService';

export const MayoristaReportes = () => {
  const [loading, setLoading] = useState(true);
  const [fechas, setFechas] = useState({ 
    desde: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    hasta: new Date().toISOString().split('T')[0]
  });

  const [data, setData] = useState({
    reservasPorMes: [],
    rankingAgencias: [],
    productosTop: []
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { fecha_desde: fechas.desde, fecha_hasta: fechas.hasta };
      
      const [resMes, resAgencias, resProd] = await Promise.all([
        reporteService.getReservasPorMes(params),
        reporteService.getRankingAgencias(params),
        reporteService.getProductosMasVendidos(params)
      ]);

      const chartData = resMes.map(item => ({
        name: `${item._id.mes}/${item._id.anio}`,
        Reservas: item.total_reservas,
        Ingresos: item.total_ingresos
      }));

      setData({
        reservasPorMes: chartData,
        rankingAgencias: resAgencias,
        productosTop: resProd
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reportes y Analíticas</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <Input type="date" label="Desde" value={fechas.desde} onChange={e => setFechas({...fechas, desde: e.target.value})} style={{ marginBottom: 0 }} />
          <Input type="date" label="Hasta" value={fechas.hasta} onChange={e => setFechas({...fechas, hasta: e.target.value})} style={{ marginBottom: 0 }} />
          <Button onClick={fetchData}>Filtrar</Button>
        </div>
      </div>

      {loading ? <Spinner center size="lg" /> : (
        <>
          <Card style={{ marginBottom: '2rem' }}>
            <CardHeader><h3>Ingresos por Mes</h3></CardHeader>
            <CardBody style={{ height: '350px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.reservasPorMes}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                  <RechartsTooltip cursor={{fill: 'var(--color-bg)'}} />
                  <Bar dataKey="Ingresos" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
            <Card>
              <CardHeader><h3>Ranking de Agencias</h3></CardHeader>
              <Table>
                <thead>
                  <TableRow>
                    <TableCell isHeader>Agencia</TableCell>
                    <TableCell isHeader>Reservas</TableCell>
                    <TableCell isHeader>Total Facturado</TableCell>
                  </TableRow>
                </thead>
                <tbody>
                  {data.rankingAgencias.map((ag, i) => (
                    <TableRow key={ag._id}>
                      <TableCell><div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Badge variant="info">{i+1}</Badge> {ag.agencia[0]?.nombre || 'Desconocida'}</div></TableCell>
                      <TableCell>{ag.total_reservas}</TableCell>
                      <TableCell style={{ fontWeight: 600, color: 'var(--color-success)' }}>{formatCurrency(ag.total_ingresos)}</TableCell>
                    </TableRow>
                  ))}
                  {data.rankingAgencias.length === 0 && <TableRow><TableCell colSpan={3} style={{textAlign:'center'}}>Sin datos</TableCell></TableRow>}
                </tbody>
              </Table>
            </Card>

            <Card>
              <CardHeader><h3>Productos más Vendidos</h3></CardHeader>
              <Table>
                <thead>
                  <TableRow>
                    <TableCell isHeader>Producto</TableCell>
                    <TableCell isHeader>Reservas</TableCell>
                  </TableRow>
                </thead>
                <tbody>
                  {data.productosTop.map((prod, i) => (
                    <TableRow key={prod._id}>
                      <TableCell><div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Badge variant="info">{i+1}</Badge> {prod.producto[0]?.nombre || 'Desconocido'}</div></TableCell>
                      <TableCell>{prod.total_reservas}</TableCell>
                    </TableRow>
                  ))}
                  {data.productosTop.length === 0 && <TableRow><TableCell colSpan={2} style={{textAlign:'center'}}>Sin datos</TableCell></TableRow>}
                </tbody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
