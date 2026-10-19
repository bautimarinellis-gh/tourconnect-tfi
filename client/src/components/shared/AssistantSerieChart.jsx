import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * Mini gráfico de la evolución mensual del Asistente Inteligente.
 *
 * Se carga bajo demanda (React.lazy desde AssistantChat): recharts ya es un
 * chunk aparte (lo usa Reportes) y así no entra al bundle principal.
 *
 * Recibe las filas { mes, valor } y una función para formatear el valor según
 * su tipo (moneda, número, porcentaje).
 */
export default function AssistantSerieChart({ data, formatear }) {
  return (
    <div className="assistant-serie-chart">
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="assistantSerieGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--assistant-accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--assistant-accent)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis hide />
          <Tooltip formatter={(valor) => [formatear(valor), null]} separator="" />
          <Area
            type="monotone"
            dataKey="valor"
            stroke="var(--assistant-accent)"
            strokeWidth={2}
            fill="url(#assistantSerieGradient)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
