import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Database,
  Info,
  MessageCircle,
  Route,
  Send,
  Sparkles,
  TrendingUp,
  User,
  X
} from 'lucide-react';
import { backendEnabled, dashboardApi, type AiChatHistoryMessage } from '../api/dashboardApi';
import { useDashboard } from '../context/DashboardContext';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  dataDate?: string | null;
  error?: boolean;
}

const SUGGESTED_QUESTIONS = [
  { text: '¿Qué pedidos están en riesgo?', icon: AlertTriangle },
  { text: '¿Cuántos pares hay por etapa?', icon: Route },
  { text: 'Analiza mis modelos ahora', icon: BrainCircuit },
  { text: 'Alertas críticas actuales', icon: Info },
  { text: 'Producción de últimos días', icon: TrendingUp },
  { text: '¿Qué módulos tiene el sistema?', icon: Database }
] as const;

export const AsistenteIAWidget: React.FC = () => {
  const { addAuditLog } = useDashboard();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isOpen, messages, isLoading]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const sendMessage = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || isLoading) return;

    if (!backendEnabled) {
      setInput('');
      setMessages(prev => [
        ...prev,
        { role: 'user', text },
        {
          role: 'assistant',
          error: true,
          text: 'El asistente IA requiere conexión al backend (VITE_API_BASE_URL no está configurado).'
        }
      ]);
      return;
    }

    const history: AiChatHistoryMessage[] = messages
      .filter((message) => !message.error)
      .map((message) => ({ role: message.role, content: message.text }));

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setIsLoading(true);

    try {
      const response = await dashboardApi.aiChat(text, history);
      setMessages(prev => [...prev, { role: 'assistant', text: response.reply, dataDate: response.dataDate }]);
      addAuditLog('ASISTENTE_IA', 'AI_CHAT', `Consulta al asistente IA (${text.slice(0, 80)})`);
    } catch (error) {
      console.warn('Asistente IA: chat failed', error);
      const notConfigured = error instanceof Error && error.message.includes('503');
      setMessages(prev => [...prev, {
        role: 'assistant',
        error: true,
        text: notConfigured
          ? 'El asistente IA no está configurado en el backend (falta GEMINI_API_KEY o la conexión a datos del ERP).'
          : 'No pude consultar el asistente en este momento. Verifica que el backend esté disponible e intenta de nuevo.'
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  return (
    <>
      {isOpen && (
        <section
          className="fixed bottom-20 left-3 right-3 z-[70] flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.18)] sm:left-auto sm:right-5 sm:w-[24rem] sm:max-w-[calc(100vw-2rem)]"
          style={{ height: 'min(31rem, calc(100vh - 6rem))' }}
          role="dialog"
          aria-label="Asistente IA"
        >
          <header className="flex shrink-0 items-center gap-3 bg-blue-800 px-4 py-3 text-white">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-blue-700 bg-blue-900/50">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-mono text-xs font-black uppercase tracking-widest">Asistente IA</h2>
              <p className="mt-0.5 truncate font-mono text-[10px] font-bold uppercase tracking-wide text-blue-100">
                ERP · Analitica · Planta
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-blue-100 transition hover:bg-blue-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70"
              aria-label="Cerrar asistente"
              title="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-950 px-4 py-4">
            {!backendEnabled && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>El backend no está configurado. El botón y la ventana están disponibles, pero el chat no podrá consultar datos reales.</p>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-blue-700 text-white shadow-md shadow-blue-900/10">
                  <BrainCircuit className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-base font-black text-slate-200">¡Hola! Soy Plasyect AI</h3>
                <p className="mt-2 max-w-[18rem] text-xs font-medium leading-relaxed text-slate-500">
                  Puedo responder sobre el sistema y analizar tus datos de producción.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {SUGGESTED_QUESTIONS.map((question) => {
                    const Icon = question.icon;
                    return (
                      <button
                        key={question.text}
                        type="button"
                        onClick={() => void sendMessage(question.text)}
                        disabled={isLoading}
                        className="flex min-h-8 max-w-full items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950 px-2.5 text-[11px] font-bold text-slate-350 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{question.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[90%] gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        message.role === 'user'
                          ? 'bg-slate-850 text-slate-500'
                          : message.error
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-blue-50 text-blue-700'
                      }`}>
                        {message.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </div>
                      <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed shadow-sm ${
                        message.role === 'user'
                          ? 'rounded-tr-sm bg-blue-700 text-white'
                          : message.error
                            ? 'rounded-tl-sm border border-rose-100 bg-rose-50 text-rose-900'
                            : 'rounded-tl-sm border border-slate-850 bg-slate-950 text-slate-250'
                      }`}>
                        <p className="whitespace-pre-wrap">{message.text}</p>
                        {message.role === 'assistant' && message.dataDate && (
                          <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                            Datos de planta al {message.dataDate}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg rounded-tl-sm border border-slate-850 bg-slate-950 px-3 py-2">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '0.15s' }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-2 border-t border-slate-850 bg-slate-900 px-3 py-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pregunta sobre el sistema o tus datos..."
              maxLength={2000}
              disabled={isLoading}
              className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-200 placeholder:text-slate-600 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white transition hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-slate-700"
              aria-label="Enviar mensaje"
              title="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="fixed bottom-5 right-5 z-[80] flex h-12 w-12 items-center justify-center rounded-full bg-blue-700 text-white shadow-[0_12px_28px_rgba(29,78,216,0.28)] transition hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200 sm:right-5"
        aria-label={isOpen ? 'Cerrar asistente IA' : 'Abrir asistente IA'}
        title={isOpen ? 'Cerrar asistente' : 'Abrir asistente'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
};
