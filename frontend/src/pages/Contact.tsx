
import React, { useState, useEffect } from 'react';
import { Mail, Phone, MapPin, Send, Share2 } from 'lucide-react';
import { db } from '../api';
import { getHomeGalleryItems } from '../utils/homeGallery';
import TeamMemberCard from '../components/TeamMemberCard';
import { useTranslation } from '../contexts/LanguageContext';

const Contact: React.FC = () => {
  const { t } = useTranslation();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  useEffect(() => {
    getHomeGalleryItems().then(items => {
      // Only items with teamName and teamRole are considered team members
      setTeamMembers(items.filter(item => item.teamName && item.teamRole));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setIsSubmitting(true);

    try {
      await db.addContactMessage(form);
      setSubmitted(true);
    } catch (error: any) {
      setSubmitError(error?.message || t('failed_send_message'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-12 pt-4">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">

        {/* Top Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 p-8 mb-8 shadow-lg">
          <h1 className="text-3xl font-bold text-white mb-2">{t('contact_title')}</h1>
          <p className="text-indigo-100 text-sm max-w-xl">
            {t('contact_subtitle')} 
            {' '}
            {/* Extra sentence kept for context where not translated in dictionary */}
            Our support team is ready to help with
            technical inquiries, partnership opportunities, or any other questions you may have.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left: Form Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-6 border border-slate-200 dark:border-slate-700">
            {submitted ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send size={28} />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{t('message_sent')}</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{t('message_sent_desc')}</p>
                <button
                  onClick={() => { setSubmitted(false); setForm({ firstName: '', lastName: '', email: '', subject: '', message: '' }); }}
                  className="mt-6 text-indigo-600 font-semibold hover:underline text-sm"
                >
                  {t('send_another')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <Send size={18} className="text-indigo-500" />
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('send_message')}</h3>
                </div>

                {submitError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-sm px-3 py-2">
                    {submitError}
                  </div>
                )}

                {/* First + Last Name */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('first_name')}</label>
                    <input
                      type="text" required placeholder="John"
                      value={form.firstName}
                      onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('last_name')}</label>
                    <input
                      type="text" required placeholder="Doe"
                      value={form.lastName}
                      onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('email_address')}</label>
                  <input
                    type="email" required placeholder="you@example.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('subject')}</label>
                  <select
                    required
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
                  >
                    <option value="">{t('select_subject')}</option>
                    <option>{t('technical_support')}</option>
                    <option>{t('partnership')}</option>
                    <option>{t('product_inquiry')}</option>
                    <option>{t('feedback')}</option>
                    <option>{t('other')}</option>
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('your_message')}</label>
                  <textarea
                    rows={5} required placeholder="How can we help you?"
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all resize-y"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-all shadow-md disabled:opacity-60"
                >
                  <Send size={16} />
                  {isSubmitting ? t('sending') : t('send_btn')}
                </button>
              </form>
            )}
          </div>

          {/* Right: Contact Details + Social */}
          <div className="flex flex-col gap-6">

            {/* Contact Details Card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-5 h-5 text-indigo-500">&#9432;</div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('contact_details')}</h3>
              </div>
              <div className="space-y-4">
                {/* Email 1 */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                    <Mail size={16} className="text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Email</p>
                    <a href="mailto:tunga@gmail.com" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">tunga@gmail.com</a>
                    <br />
                    <a href="mailto:niyomungeritheophile02@gmail.com" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">niyomungeritheophile02@gmail.com</a>
                  </div>
                </div>
                {/* Phone */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                    <Phone size={16} className="text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('phone')}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">+250 785 133 511</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">+250 787 853 990</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t('mon_fri')}</p>
                  </div>
                </div>
                {/* Headquarters */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                    <MapPin size={16} className="text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('headquarters')}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">TUNGA CHICKS Ltd</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">KG 7 Avenue, Kigali</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">Rwanda</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Connect With Us Card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-5">
                <Share2 size={18} className="text-indigo-500" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('connect_with_us')}</h3>
              </div>
              <div className="flex gap-3">
                {/* WhatsApp */}
                <a href="https://wa.me/250785133511" className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600 hover:bg-green-100 dark:hover:bg-green-900/40 transition-all" title="WhatsApp">
                  <svg viewBox="0 0 32 32" fill="currentColor" className="w-6 h-6"><path d="M16 3C9.383 3 4 8.383 4 15c0 2.393.672 4.668 1.945 6.668L4 29l7.5-1.961C13.383 28.336 14.668 29 16 29c6.617 0 12-5.383 12-12S22.617 3 16 3zm0 24c-1.168 0-2.32-.164-3.418-.488l-.242-.07-4.84 1.266 1.289-4.727-.156-.242C6.672 19.668 6 17.393 6 15c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10zm5.406-7.055c-.297-.148-1.758-.867-2.031-.965-.273-.098-.469-.148-.664.148-.195.297-.758.965-.93 1.164-.172.199-.344.223-.641.074-.297-.148-1.254-.461-2.145-1.461-.793-.793-1.328-1.77-1.484-2.066-.156-.297-.016-.457.117-.605.121-.121.27-.316.406-.477.133-.16.18-.277.27-.461.09-.184.047-.344-.023-.492-.07-.148-.625-1.508-.859-2.07-.227-.547-.457-.473-.664-.484-.207-.012-.445-.012-.684-.012-.238 0-.625.09-.953.445-.328.355-1.25 1.223-1.25 2.98s1.016 3.457 1.164 3.691c.148.234 2.016 3.125 4.883 4.258.68.293 1.211.469 1.629.602.68.219 1.297.188 1.777.117.543-.078 1.734-.684 1.977-1.352.242-.668.242-1.234.172-1.352-.07-.117-.273-.188-.57-.336z"/></svg>
                </a>
                {/* Facebook */}
                <a href="https://web.facebook.com/?_rdc=1&_rdr#" className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all" title="Facebook">
                  <svg viewBox="0 0 32 32" fill="currentColor" className="w-6 h-6"><path d="M29 16c0-7.18-5.82-13-13-13S3 8.82 3 16c0 6.48 4.86 11.82 11.13 12.82v-9.07H10.1v-3.75h4.03v-2.86c0-3.98 2.37-6.18 6-6.18 1.74 0 3.56.31 3.56.31v3.91h-2.01c-1.98 0-2.59 1.23-2.59 2.5v3.02h4.41l-.7 3.75h-3.71v9.07C24.14 27.82 29 22.48 29 16z"/></svg>
                </a>
                {/* Instagram */}
                <a href="https://www.instagram.com/direct/inbox/" className="w-10 h-10 rounded-full bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center text-pink-500 hover:bg-pink-100 dark:hover:bg-pink-900/40 transition-all" title="Instagram">
                  <svg viewBox="0 0 32 32" fill="currentColor" className="w-6 h-6"><path d="M16 7.2c2.2 0 2.5 0 3.4.05.9.05 1.4.2 1.7.33.4.16.7.36 1 .7.3.3.54.6.7 1 .13.3.28.8.33 1.7.05.9.05 1.2.05 3.4s0 2.5-.05 3.4c-.05.9-.2 1.4-.33 1.7-.16.4-.36.7-.7 1-.3.3-.6.54-1 .7-.3.13-.8.28-1.7.33-.9.05-1.2.05-3.4.05s-2.5 0-3.4-.05c-.9-.05-1.4-.2-1.7-.33-.4-.16-.7-.36-1-.7-.3-.3-.54-.6-.7-1-.13-.3-.28-.8-.33-1.7C7.2 18.5 7.2 18.2 7.2 16s0-2.5.05-3.4c.05-.9.2-1.4.33-1.7.16-.4.36-.7.7-1 .3-.3.6-.54 1-.7.3-.13.8-.28 1.7-.33C13.5 7.2 13.8 7.2 16 7.2zm0-2.2c-2.3 0-2.6 0-3.5.05-1 .05-1.7.22-2.3.47-.6.26-1.1.6-1.6 1.1-.5.5-.84 1-1.1 1.6-.25.6-.42 1.3-.47 2.3C7.2 13.4 7.2 13.7 7.2 16s0 2.6.05 3.5c.05 1 .22 1.7.47 2.3.26.6.6 1.1 1.1 1.6.5.5 1 .84 1.6 1.1.6.25 1.3.42 2.3.47.9.05 1.2.05 3.5.05s2.6 0 3.5-.05c1-.05 1.7-.22 2.3-.47.6-.26 1.1-.6 1.6-1.1.5-.5.84-1 1.1-1.6.25-.6.42-1.3.47-2.3.05-.9.05-1.2.05-3.5s0-2.6-.05-3.5c-.05-1-.22-1.7-.47-2.3-.26-.6-.6-1.1-1.1-1.6-.5-.5-1-.84-1.6-1.1-.6-.25-1.3-.42-2.3-.47C18.6 5 18.3 5 16 5zm0 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zm0 11.2a4.4 4.4 0 1 1 0-8.8 4.4 4.4 0 0 1 0 8.8zm7.2-11.6a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0z"/></svg>
                </a>
                {/* LinkedIn */}
                <a href="https://www.linkedin.com/in/niyomungeri-theophile-4120a02b1" className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 transition-all" title="LinkedIn">
                  <svg viewBox="0 0 32 32" fill="currentColor" className="w-6 h-6"><path d="M27 3H5C3.9 3 3 3.9 3 5v22c0 1.1.9 2 2 2h22c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM12 25H8V13h4v12zm-2-13.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm15 13.5h-4v-5.5c0-1.1-.9-2-2-2s-2 .9-2 2V25h-4V13h4v1.7c.6-.9 1.7-1.7 3-1.7 2.2 0 4 1.8 4 4V25z"/></svg>
                </a>
                {/* YouTube */}
                <a href="https://www.youtube.com/channel/UC6lysNkBdq0G7762k115jSQ" className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all" title="YouTube">
                  <svg viewBox="0 0 32 32" fill="currentColor" className="w-6 h-6"><path d="M31.67 9.28a3.94 3.94 0 0 0-2.77-2.78C26.13 6 16 6 16 6s-10.13 0-12.9.5A3.94 3.94 0 0 0 .33 9.28C0 12.07 0 16 0 16s0 3.93.33 6.72a3.94 3.94 0 0 0 2.77 2.78C5.87 26 16 26 16 26s10.13 0 12.9-.5a3.94 3.94 0 0 0 2.77-2.78C32 19.93 32 16 32 16s0-3.93-.33-6.72zM12.8 20.8V11.2l8.53 4.8-8.53 4.8z"/></svg>
                </a>
              </div>
            </div>

          </div>
        </div>
        {/* Team Members Section */}
        {teamMembers.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-8 text-center tracking-tight">{t('our_team') || 'Our Team'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
              {teamMembers.map(member => (
                <TeamMemberCard
                  key={member.id}
                  name={member.teamName}
                  role={member.teamRole}
                  imageUrl={member.mediaDataUrl}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Contact;
