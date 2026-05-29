import React, { useEffect, useState } from 'react';
import { Inbox, MailOpen, Trash2 } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { db, subscribeToData } from '../api';

const RequestForm: React.FC = () => {
  const { t } = useTranslation();
  const [contactMessages, setContactMessages] = useState<any[]>([]);
  const currentRole = String(localStorage.getItem('userRole') || '').toLowerCase();
  const canDelete = currentRole === 'admin' || currentRole === 'supervisor';

  useEffect(() => {
    const unsubscribe = subscribeToData('contact-messages', (messages) => {
      const rows = Array.isArray(messages) ? messages : [];
      setContactMessages(rows);
    }, 5000);

    return () => unsubscribe();
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await db.markContactMessageAsRead(id);
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  };

  const deleteMessage = async (id: string) => {
    try {
      if (!window.confirm(t('confirm_delete'))) return;
      await db.deleteContactMessage(id);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <Inbox className="text-emerald-600" size={22} /> {t('messages_room')}
            </h3>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {contactMessages.filter((m) => m.status !== 'read').length} {t('unread')}
            </span>
          </div>

          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {contactMessages.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">{t('no_messages_yet')}</div>
            ) : (
              contactMessages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-2xl border p-4 ${m.status === 'read' ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/10' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{m.full_name || '-'}</div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${m.status === 'read' ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200' : 'bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-100'}`}>
                      {m.status || 'unread'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2 text-xs text-slate-600 dark:text-slate-300">
                    <p><span className="font-bold">Name:</span> {m.full_name || '-'}</p>
                    <p><span className="font-bold">Email:</span> {m.email || '-'}</p>
                    <p><span className="font-bold">Subject:</span> {m.subject || '-'}</p>
                    <p><span className="font-bold">Status:</span> {m.status || 'unread'}</p>
                    <p className="sm:col-span-2"><span className="font-bold">Message ID:</span> {m.id || '-'}</p>
                    <p className="sm:col-span-2"><span className="font-bold">Received:</span> {m.created_at ? new Date(m.created_at).toLocaleString() : '-'}</p>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-white/60 dark:bg-slate-900/40 rounded-lg p-3">{m.message || '-'}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</p>
                    <div className="flex items-center gap-3">
                      {m.status !== 'read' && (
                        <button
                          type="button"
                          onClick={() => markAsRead(m.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                        >
                          <MailOpen size={14} /> {t('mark_as_read')}
                        </button>
                      )}
                      {(canDelete || m.status === 'read') && (
                        <button
                          type="button"
                          onClick={() => deleteMessage(m.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
                        >
                          <Trash2 size={14} /> {t('delete')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestForm;
