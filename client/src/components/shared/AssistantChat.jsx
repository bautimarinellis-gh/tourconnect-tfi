import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, ChevronRight } from 'lucide-react';
import assistantService from '../../services/assistantService';
import './assistant.css';

// ─── Suggestions predefinidas ──────────────────────────────────────
const INITIAL_SUGGESTIONS = [
  '¿Cuáles son mis top 5 agencias?',
  '¿Cuántas cotizaciones tengo pendientes?',
  '¿Cuánto facturé este mes?',
  '¿Qué producto tuvo más reservas?',
  '¿Qué agencias están inactivas?',
];

// ─── Sub-componentes de visualización ─────────────────────────────

function ResultTable({ data, columns, columnLabels }) {
  if (!data || data.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="assistant-result-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{columnLabels?.[col] || col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col}>
                  {typeof row[col] === 'number' && col === 'facturacion'
                    ? `$${Number(row[col]).toLocaleString('es-AR')}`
                    : row[col] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultStat({ stat }) {
  if (!stat) return null;
  return (
    <div className="assistant-stat-card">
      <div className="assistant-stat-value">{stat.value}</div>
      <div className="assistant-stat-label">{stat.label}</div>
      {stat.sub && <div className="assistant-stat-sub">{stat.sub}</div>}
    </div>
  );
}

function ResultList({ data, columns }) {
  if (!data || data.length === 0) return null;
  const mainCol = columns?.[0];
  return (
    <div className="assistant-result-list">
      {data.map((row, i) => (
        <div key={i} className="assistant-result-list-item">
          {mainCol ? row[mainCol] : JSON.stringify(row)}
        </div>
      ))}
    </div>
  );
}

function UnknownSuggestions({ suggestions, onSelect }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="unknown-intent-suggestions">
      {suggestions.slice(0, 5).map((s) => (
        <button
          key={s.intent}
          className="unknown-suggestion-chip"
          onClick={() => onSelect(s.example)}
        >
          <ChevronRight size={12} />
          {s.example}
        </button>
      ))}
    </div>
  );
}

// ─── Burbuja de mensaje ────────────────────────────────────────────

function MessageBubble({ msg, onSuggestionClick }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="message-row user">
        <div className="message-bubble">{msg.content}</div>
      </div>
    );
  }

  // Mensaje del asistente
  const isError = msg.isError;
  const isUnknown = msg.intent === 'unknown';

  return (
    <div className="message-row assistant">
      <div className={`message-bubble${isError ? ' error' : ''}`}>
        {msg.content}

        {/* Visualización de datos */}
        {!isError && !isUnknown && msg.visualization === 'stat' && msg.stat && (
          <ResultStat stat={msg.stat} />
        )}
        {!isError && !isUnknown && msg.visualization === 'table' && msg.data?.length > 0 && (
          <ResultTable data={msg.data} columns={msg.columns} columnLabels={msg.columnLabels} />
        )}
        {!isError && !isUnknown && msg.visualization === 'list' && msg.data?.length > 0 && (
          <ResultList data={msg.data} columns={msg.columns} />
        )}

        {/* Sugerencias cuando el intent es desconocido */}
        {isUnknown && msg.suggestions && (
          <UnknownSuggestions suggestions={msg.suggestions} onSelect={onSuggestionClick} />
        )}
      </div>

      {/* Summary debajo de la burbuja */}
      {msg.summary && !isUnknown && (
        <p className="message-summary">{msg.summary}</p>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────

export function AssistantChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const showSuggestions = messages.length === 0;

  // Auto-scroll al último mensaje (solo cuando ya hay mensajes o se está cargando)
  useEffect(() => {
    if (messagesEndRef.current && (messages.length > 0 || isLoading)) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const sendQuery = useCallback(async (queryText) => {
    const trimmed = queryText.trim();
    if (!trimmed || isLoading) return;

    // Agregar mensaje del usuario
    const userMsg = { role: 'user', content: trimmed, id: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await assistantService.query(trimmed);

      if (!res.success) {
        throw new Error(res.message || 'Error desconocido');
      }

      let content;
      if (res.intent === 'unknown') {
        content = res.message || 'No pude entender tu consulta. Podés preguntarme sobre:';
      } else if (res.data?.length === 0) {
        content = `${res.summary || 'No se encontraron resultados para este período.'}`;
      } else {
        content = res.summary || 'Aquí están los resultados:';
      }

      const assistantMsg = {
        role: 'assistant',
        content,
        id: Date.now() + 1,
        intent: res.intent,
        visualization: res.visualization,
        data: res.data,
        stat: res.stat,
        summary: res.data?.length > 0 ? null : null, // summary ya va en content
        columns: res.columns || [],
        columnLabels: res.columnLabels || {},
        suggestions: res.suggestions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err.message || 'Ocurrió un error al procesar tu consulta.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errorMsg,
          id: Date.now() + 1,
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isLoading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuery(input);
    }
  };

  const handleSuggestionClick = (text) => {
    sendQuery(text);
  };

  return (
    <div className="assistant-section">
      {/* ── Header ── */}
      <div className="assistant-header">
        <div className="assistant-header-icon">
          <Sparkles size={16} />
        </div>
        <div className="assistant-header-text">
          <div className="assistant-header-title">Asistente Inteligente</div>
          <div className="assistant-header-subtitle">Consultá tus datos en lenguaje natural</div>
        </div>
        <span className="assistant-header-badge">BETA</span>
      </div>

      {/* ── Mensajes ── */}
      <div className="assistant-messages">
        {messages.length === 0 ? (
          <div className="assistant-welcome">
            <div className="assistant-welcome-icon">
              <Sparkles size={20} />
            </div>
            <h4>¿Qué querés consultar hoy?</h4>
            <p>Escribí una pregunta sobre tus agencias, reservas, cotizaciones o ingresos.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onSuggestionClick={handleSuggestionClick}
            />
          ))
        )}

        {/* Typing indicator */}
        {isLoading && (
          <div className="message-row assistant">
            <div className="typing-indicator">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Suggestion chips (solo si no hay mensajes) ── */}
      {showSuggestions && (
        <div className="assistant-suggestions">
          <div className="assistant-suggestion-label">Probá preguntar:</div>
          {INITIAL_SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="suggestion-chip"
              onClick={() => handleSuggestionClick(s)}
              disabled={isLoading}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div className="assistant-input-area">
        <textarea
          ref={inputRef}
          className="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ej: ¿Cuáles son mis top 5 agencias del último mes?"
          rows={1}
          disabled={isLoading}
          maxLength={300}
        />
        <button
          className="assistant-send-btn"
          onClick={() => sendQuery(input)}
          disabled={isLoading || !input.trim()}
          title="Enviar consulta"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
