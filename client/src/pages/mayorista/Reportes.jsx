import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { CalendarDays, CalendarRange, Calendar, DollarSign, ClipboardCheck } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { formatCurrency } from '../../utils/formatters';
import reporteService from '../../services/reporteService';
import './reportes.css';

const PERIODOS = [
  { value: 'dia', label: 'Día', icon: CalendarDays },
  { value: 'mes', label: 'Mes', icon: CalendarRange },
  { value: 'anio', label: 'Año', icon: Calendar },
];

const pad2 = (value) => String(value).padStart(2, '0');

const todayValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const monthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
};

const yearValue = () => String(new Date().getFullYear());

const getDefaultValor = (periodo) => {
  if (periodo === 'dia') return todayValue();
  if (periodo === 'anio') return yearValue();
  return monthValue();
};

const getPeriodoWindow = (periodo, valor) => {
  if (periodo === 'dia') {
    return { desde: valor, hasta: valor };
  }

  if (periodo === 'mes') {
    const [year, month] = valor.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return { desde: `${valor}-01`, hasta: `${valor}-${pad2(lastDay)}` };
  }

  return { desde: `${valor}-01-01`, hasta: `${valor}-12-31` };
};

const getControlProps = (periodo) => {
  if (periodo === 'dia') return { type: 'date', label: 'Día' };
  if (periodo === 'mes') return { type: 'month', label: 'Mes' };
  return { type: 'number', label: 'Año', min: 2000, max: 2100 };
};

const buildEmptyBuckets = (periodo, valor) => {
  if (periodo === 'dia') {
    return Array.from({ length: 24 }, (_, hour) => ({
      label: `${pad2(hour)}:00`,
      fecha: `${valor}T${pad2(hour)}:00:00.000Z`,
      Ingresos: 0,
      Reservas: 0,
    }));
  }

  if (periodo === 'mes') {
    const [year, month] = valor.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();

    return Array.from({ length: lastDay }, (_, index) => {
      const day = index + 1;

      return {
        label: String(day),
        fecha: `${valor}-${pad2(day)}`,
        Ingresos: 0,
        Reservas: 0,
      };
    });
  }

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;

    return {
      label: `${pad2(month)}/${valor}`,
      fecha: `${valor}-${pad2(month)}`,
      Ingresos: 0,
      Reservas: 0,
    };
  });
};

const getXAxisInterval = (periodo) => {
  if (periodo === 'dia') return 3;
  if (periodo === 'mes') return 4;
  return 0;
};

export const MayoristaReportes = () => {
  const [periodo, setPeriodo] = useState('mes');
  const [valor, setValor] = useState(() => getDefaultValor('mes'));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    ingresos: { total_ingresos: 0, puntos: [] },
    rankingAgencias: [],
    productosTop: [],
  });

  const periodoWindow = useMemo(() => getPeriodoWindow(periodo, valor), [periodo, valor]);
  const controlProps = getControlProps(periodo);

  const fetchData = useCallback(async () => {
    if (!valor) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = { periodo, valor };
      const tableParams = { desde: periodoWindow.desde, hasta: periodoWindow.hasta };

      const [ingresos, rankingAgencias, productosTop] = await Promise.all([
        reporteService.getIngresos(params),
        reporteService.getRankingAgencias(tableParams),
        reporteService.getProductosMasVendidos(tableParams),
      ]);

      setData({
        ingresos: ingresos || { total_ingresos: 0, puntos: [] },
        rankingAgencias: rankingAgencias || [],
        productosTop: productosTop || [],
      });
    } catch (err) {
      console.error(err);
      setData({
        ingresos: { total_ingresos: 0, puntos: [] },
        rankingAgencias: [],
        productosTop: [],
      });
    } finally {
      setLoading(false);
    }
  }, [periodo, valor, periodoWindow.desde, periodoWindow.hasta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePeriodoChange = (nextPeriodo) => {
    setPeriodo(nextPeriodo);
    setValor(getDefaultValor(nextPeriodo));
  };

  const chartData = useMemo(() => {
    const buckets = buildEmptyBuckets(periodo, valor);
    const pointsByFecha = new Map(
      data.ingresos.puntos.map((item) => [
        item.fecha,
        {
          ...item,
          Ingresos: item.ingresos,
          Reservas: item.reservas,
        },
      ])
    );

    return buckets.map((bucket) => ({
      ...bucket,
      ...(pointsByFecha.get(bucket.fecha) || {}),
    }));
  }, [data.ingresos.puntos, periodo, valor]);
  const hasChartData = chartData.some((item) => item.Ingresos > 0 || item.Reservas > 0);
  const totalReservas = data.ingresos.puntos.reduce((sum, item) => sum + (item.reservas || 0), 0);

  return (
    <div className="reportes-page">
      <div className="page-header reportes-heading">
        <div>
          <h1 className="page-title">Reportes y Analíticas</h1>
          <p className="reportes-subtitle">Ingresos por reservas pagadas, cerradas o con pago informado.</p>
        </div>

        <div className="reportes-filter-panel">
          <div className="reportes-segmented" aria-label="Periodo de ingresos">
            {PERIODOS.map((item) => {
              const Icon = item.icon;
              const active = periodo === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  className={`reportes-segment ${active ? 'reportes-segment-active' : ''}`}
                  onClick={() => handlePeriodoChange(item.value)}
                  aria-pressed={active}
                  title={item.label}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <Input
            {...controlProps}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="reportes-period-input"
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      {loading ? (
        <Spinner center size="lg" />
      ) : (
        <>
          <div className="reportes-kpi-grid">
            <Card className="reportes-kpi-card">
              <CardBody>
                <div className="reportes-kpi">
                  <div>
                    <p className="reportes-kpi-label">Ingresos del periodo</p>
                    <h2>{formatCurrency(data.ingresos.total_ingresos || 0)}</h2>
                  </div>
                  <span className="reportes-kpi-icon"><DollarSign size={18} /></span>
                </div>
              </CardBody>
            </Card>

            <Card className="reportes-kpi-card">
              <CardBody>
                <div className="reportes-kpi">
                  <div>
                    <p className="reportes-kpi-label">Reservas con ingresos</p>
                    <h2>{totalReservas.toLocaleString('es-AR')}</h2>
                  </div>
                  <span className="reportes-kpi-icon reportes-kpi-icon-muted"><ClipboardCheck size={18} /></span>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card className="reportes-chart-card">
            <CardHeader className="reportes-card-header">
              <h3>Ingresos por periodo</h3>
              <span>{PERIODOS.find((item) => item.value === periodo)?.label}</span>
            </CardHeader>
            <CardBody className="reportes-chart-body">
              {!hasChartData ? (
                <div className="reportes-empty">Sin datos</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 12, right: 18, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ingresosGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.55} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} interval={getXAxisInterval(periodo)} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => formatCurrency(value)} width={88} />
                    <RechartsTooltip
                      cursor={{ stroke: 'var(--color-border-strong)', strokeDasharray: '4 4' }}
                      formatter={(value, name) => (name === 'Ingresos' ? formatCurrency(value) : value)}
                    />
                    <Area
                      type="monotone"
                      dataKey="Ingresos"
                      stroke="var(--color-accent)"
                      strokeWidth={2.5}
                      fill="url(#ingresosGradient)"
                      activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-surface)', fill: 'var(--color-accent)' }}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>

          <div className="reportes-table-grid">
            <Card>
              <CardHeader><h3>Ranking de Agencias</h3></CardHeader>
              <Table className="reportes-compact-table">
                <thead>
                  <TableRow>
                    <TableCell isHeader className="reportes-name-col">Agencia</TableCell>
                    <TableCell isHeader className="reportes-number-col">Reservas</TableCell>
                    <TableCell isHeader className="reportes-money-col">Total Facturado</TableCell>
                  </TableRow>
                </thead>
                <tbody>
                  {data.rankingAgencias.map((ag) => (
                    <TableRow key={`${ag.posicion}-${ag.nombre_agencia}`}>
                      <TableCell className="reportes-name-col">
                        <div className="reportes-table-name">
                          <Badge variant="info">{ag.posicion}</Badge>
                          <span>{ag.nombre_agencia || 'Agencia desconocida'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="reportes-number-col">{ag.cantidad_reservas}</TableCell>
                      <TableCell className="reportes-money-col reportes-amount">{formatCurrency(ag.monto_total)}</TableCell>
                    </TableRow>
                  ))}
                  {data.rankingAgencias.length === 0 && (
                    <TableRow><TableCell colSpan={3} style={{ textAlign: 'center' }}>Sin datos</TableCell></TableRow>
                  )}
                </tbody>
              </Table>
            </Card>

            <Card>
              <CardHeader><h3>Productos más Vendidos</h3></CardHeader>
              <Table className="reportes-compact-table">
                <thead>
                  <TableRow>
                    <TableCell isHeader className="reportes-name-col">Producto</TableCell>
                    <TableCell isHeader className="reportes-number-col">Reservas</TableCell>
                    <TableCell isHeader className="reportes-money-col">Ingresos</TableCell>
                  </TableRow>
                </thead>
                <tbody>
                  {data.productosTop.map((prod, i) => (
                    <TableRow key={`${prod.nombre}-${prod.tipo}-${i}`}>
                      <TableCell className="reportes-name-col">
                        <div className="reportes-table-name">
                          <Badge variant="info">{i + 1}</Badge>
                          <span>{prod.nombre || 'Producto desconocido'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="reportes-number-col">{prod.cantidad_reservas}</TableCell>
                      <TableCell className="reportes-money-col reportes-amount">{formatCurrency(prod.monto_total)}</TableCell>
                    </TableRow>
                  ))}
                  {data.productosTop.length === 0 && (
                    <TableRow><TableCell colSpan={3} style={{ textAlign: 'center' }}>Sin datos</TableCell></TableRow>
                  )}
                </tbody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
