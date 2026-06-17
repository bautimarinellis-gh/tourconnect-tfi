import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Input } from '../../components/ui/Input';
import { formatCurrency } from '../../utils/formatters';
import agenciaService from '../../services/agenciaService';
import productoService from '../../services/productoService';
import { useToast } from '../../components/ui/Toast';

export const MayoristaAgenciaDetalle = () => {
  const { id } = useParams();
  const toast = useToast();
  const [agencia, setAgencia] = useState(null);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // 'info' or 'products'
  
  // State for product markup form
  const [productStates, setProductStates] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [agenciaData, productosData] = await Promise.all([
          agenciaService.getById(id),
          productoService.getAll({ activo: true })
        ]);
        setAgencia(agenciaData);
        setProductos(productosData);

        // Initialize product states from agencia.productos
        const productosAgencia = agenciaData.productos || [];
        const initialStates = {};
        productosData.forEach(p => {
          const ap = productosAgencia.find(ph => (ph.producto_id?._id || ph.producto_id)?.toString() === p._id?.toString());
          initialStates[p._id] = {
            habilitado: !!ap,
            markup_porcentaje: ap?.markup_porcentaje ?? 15
          };
        });
        setProductStates(initialStates);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleSaveProducts = async () => {
    setSaving(true);
    const productosToSave = Object.keys(productStates)
      .filter(pId => productStates[pId].habilitado)
      .map(pId => ({
        producto_id: pId,
        markup_porcentaje: Number(productStates[pId].markup_porcentaje)
      }));

    try {
      await agenciaService.updateProducts(id, { productos: productosToSave });
      toast.success('Los productos de la agencia fueron actualizados.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner center size="lg" />;
  if (!agencia) return <div>Agencia no encontrada</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/mayorista/agencias" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem', color: 'var(--color-text-soft)' }}>
            <ArrowLeft size={16} /> Volver a agencias
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ marginBottom: 0 }}>{agencia.nombre}</h1>
            <Badge variant={agencia.activo ? 'success' : 'error'}>{agencia.activo ? 'Activo' : 'Inactivo'}</Badge>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
        <button 
          onClick={() => setActiveTab('info')}
          style={{ 
            padding: '0.75rem 1rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: `2px solid ${activeTab === 'info' ? 'var(--color-primary)' : 'transparent'}`,
            color: activeTab === 'info' ? 'var(--color-primary)' : 'var(--color-text-soft)',
            fontWeight: activeTab === 'info' ? 600 : 500,
            cursor: 'pointer'
          }}
        >
          Información
        </button>
        <button 
          onClick={() => setActiveTab('products')}
          style={{ 
            padding: '0.75rem 1rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: `2px solid ${activeTab === 'products' ? 'var(--color-primary)' : 'transparent'}`,
            color: activeTab === 'products' ? 'var(--color-primary)' : 'var(--color-text-soft)',
            fontWeight: activeTab === 'products' ? 600 : 500,
            cursor: 'pointer'
          }}
        >
          Productos Habilitados
        </button>
      </div>

      {activeTab === 'info' && (
        <Card>
          <CardHeader>
            <h3>Detalles de la Empresa</h3>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Razón Social</p>
                <p style={{ fontWeight: 500 }}>{agencia.razon_social || '-'}</p>
              </div>
              <div>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>CUIT</p>
                <p style={{ fontWeight: 500 }}>{agencia.cuit || '-'}</p>
              </div>
              <div>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Teléfono</p>
                <p style={{ fontWeight: 500 }}>{agencia.telefono || '-'}</p>
              </div>
              <div>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Email de Contacto</p>
                <p style={{ fontWeight: 500 }}>{agencia.usuario_id?.email ?? agencia.email_contacto ?? '-'}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'products' && (
        <Card>
          <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Asignación de Productos y Markup</h3>
            <Button onClick={handleSaveProducts} isLoading={saving}>
              <Save size={16} /> Guardar Cambios
            </Button>
          </div>
          <Table>
            <thead>
              <TableRow>
                <TableCell isHeader>Habilitado</TableCell>
                <TableCell isHeader>Producto</TableCell>
                <TableCell isHeader>Tipo</TableCell>
                <TableCell isHeader>Precio Base</TableCell>
                <TableCell isHeader>Markup (%)</TableCell>
                <TableCell isHeader>Precio Final (Agencia)</TableCell>
              </TableRow>
            </thead>
            <tbody>
              {productos.map(p => {
                const state = productStates[p._id];
                const finalPrice = p.precio_base * (1 + (state.markup_porcentaje / 100));
                
                return (
                  <TableRow key={p._id}>
                    <TableCell>
                      <input 
                        type="checkbox" 
                        checked={state.habilitado}
                        onChange={(e) => setProductStates({...productStates, [p._id]: {...state, habilitado: e.target.checked}})}
                        style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                      />
                    </TableCell>
                    <TableCell><div style={{ fontWeight: 500 }}>{p.nombre}</div></TableCell>
                    <TableCell><Badge>{p.tipo}</Badge></TableCell>
                    <TableCell>{formatCurrency(p.precio_base)}</TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        min="0" 
                        max="100" 
                        value={state.markup_porcentaje}
                        onChange={(e) => setProductStates({...productStates, [p._id]: {...state, markup_porcentaje: e.target.value}})}
                        disabled={!state.habilitado}
                        style={{ width: '80px', marginBottom: 0 }}
                      />
                    </TableCell>
                    <TableCell>
                      <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                        {formatCurrency(finalPrice)}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
};
