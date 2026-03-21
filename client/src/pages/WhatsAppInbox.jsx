import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCheck, MessageCircle, RefreshCw, Search, Send } from 'lucide-react';
import api from '../lib/api.js';
import { SOCKET_URL } from '../lib/runtime.js';

function classForDirection(direction) {
  return direction === 'out'
    ? 'ml-auto bg-emerald-500 text-white'
    : 'mr-auto bg-white text-slate-700 border border-slate-200';
}

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyHuman, setOnlyHuman] = useState(true);
  const [reply, setReply] = useState('');

  const loadConversations = async () => {
    setLoading(true);
    try {
      const rows = await api.get('/whatsapp/conversaciones');
      setConversations(rows);
      if (!selectedId && rows[0]) {
        setSelectedId(rows[0].id);
      }
    } catch (error) {
      toast.error(error?.error || 'No se pudieron cargar las conversaciones');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId) => {
    if (!conversationId) return;
    setLoadingMessages(true);
    try {
      const rows = await api.get(`/whatsapp/conversaciones/${conversationId}/mensajes`);
      setMessages(rows);
    } catch (error) {
      toast.error(error?.error || 'No se pudieron cargar los mensajes');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    loadMessages(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('whatsapp_conversation_updated', () => {
      loadConversations();
      if (selectedId) {
        loadMessages(selectedId);
      }
    });
    return () => socket.disconnect();
  }, [selectedId]);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedId) || null,
    [conversations, selectedId]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const matchesHuman = !onlyHuman || Number(conversation.escalado_humano) === 1;
      const matchesSearch =
        !term ||
        String(conversation.nombre || '').toLowerCase().includes(term) ||
        String(conversation.telefono || '').toLowerCase().includes(term);
      return matchesHuman && matchesSearch;
    });
  }, [conversations, search, onlyHuman]);

  const sendReply = async () => {
    if (!selectedConversation || !reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/whatsapp/conversaciones/${selectedConversation.id}/responder`, {
        contenido: reply.trim(),
      });
      toast.success('Respuesta enviada');
      setReply('');
      await loadConversations();
      await loadMessages(selectedConversation.id);
    } catch (error) {
      toast.error(error?.error || 'No se pudo enviar la respuesta');
    } finally {
      setSending(false);
    }
  };

  const markAttended = async () => {
    if (!selectedConversation) return;
    try {
      await api.put(`/whatsapp/conversaciones/${selectedConversation.id}/atendida`);
      toast.success('Conversacion marcada como atendida');
      await loadConversations();
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar la conversacion');
    }
  };

  return (
    <div className="flex h-screen gap-6 p-6">
      <section className="flex w-[360px] shrink-0 flex-col rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600">Inbox</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">WhatsApp</h1>
              <p className="mt-1 text-sm text-slate-500">Conversaciones escaladas y seguimiento manual.</p>
            </div>
            <button
              onClick={loadConversations}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="relative mt-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nombre o telefono"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={onlyHuman}
              onChange={(event) => setOnlyHuman(event.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            Mostrar solo escaladas a humano
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filtered.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setSelectedId(conversation.id)}
              className={`mb-2 w-full rounded-2xl border px-4 py-4 text-left transition ${
                selectedId === conversation.id
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-950">{conversation.nombre || conversation.telefono}</p>
                  <p className="mt-1 text-xs text-slate-500">{conversation.telefono}</p>
                </div>
                {Number(conversation.escalado_humano) === 1 ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                    Humano
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                    {conversation.ultimo_estado || 'nuevo'}
                  </span>
                )}
              </div>
              {conversation.actualizado_en ? (
                <p className="mt-3 text-xs text-slate-400">
                  {formatDistanceToNow(parseISO(conversation.actualizado_en), { addSuffix: true, locale: es })}
                </p>
              ) : null}
            </button>
          ))}

          {!loading && filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
              No hay conversaciones para mostrar.
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex min-w-0 flex-1 flex-col rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        {selectedConversation ? (
          <>
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-950">
                    {selectedConversation.nombre || selectedConversation.telefono}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedConversation.telefono}</p>
                </div>
                <div className="flex gap-2">
                  {Number(selectedConversation.escalado_humano) === 1 ? (
                    <button
                      onClick={markAttended}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
                    >
                      <CheckCheck size={15} />
                      Marcar atendida
                    </button>
                  ) : null}
                  <a
                    href={`https://wa.me/${String(selectedConversation.telefono || '').replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <MessageCircle size={15} />
                    Abrir en WhatsApp
                  </a>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_35%)] px-6 py-6">
              {loadingMessages ? (
                <div className="text-sm text-slate-400">Cargando mensajes...</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[75%] rounded-3xl px-4 py-3 text-sm shadow-sm ${classForDirection(message.direccion)}`}
                    >
                      <p className="leading-6">{message.contenido}</p>
                      {message.creado_en ? (
                        <p className={`mt-2 text-[11px] ${message.direccion === 'out' ? 'text-emerald-100' : 'text-slate-400'}`}>
                          {formatDistanceToNow(parseISO(message.creado_en), { addSuffix: true, locale: es })}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 p-5">
              <div className="flex gap-3">
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  rows={3}
                  placeholder="Escribi una respuesta manual..."
                  className="min-h-[100px] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  <Send size={15} />
                  {sending ? 'Enviando...' : 'Responder'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-slate-400">
            Selecciona una conversacion para verla.
          </div>
        )}
      </section>
    </div>
  );
}
