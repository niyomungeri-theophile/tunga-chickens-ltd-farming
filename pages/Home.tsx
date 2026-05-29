
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Circle,
  Menu,
  MousePointer2,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { getHomeGalleryItems, type HomeGalleryItem } from '../utils/homeGallery';
import { useTranslation } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const Home: React.FC = () => {
  const { t, language, setLanguage } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<HomeGalleryItem[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    let active = true;

    const refreshGallery = async () => {
      try {
        const items = await getHomeGalleryItems();
        if (active) setGalleryItems(items);
      } catch (error) {
        console.error('Failed to load hero media:', error);
      }
    };

    refreshGallery();
    window.addEventListener('focus', refreshGallery);

    return () => {
      window.removeEventListener('focus', refreshGallery);
      active = false;
    };
  }, []);

  useEffect(() => {
    if (galleryItems.length === 0) {
      setCurrentSlide(0);
      return;
    }

    // Only set timer for images
    if (orderedItems[currentSlide]?.mediaType === 'image') {
      const timer = window.setTimeout(() => {
        setCurrentSlide((prev) => (prev + 1) % galleryItems.length);
      }, 5000);
      return () => window.clearTimeout(timer);
    }
    // For videos, advance handled by onEnded
    return undefined;
  }, [galleryItems, currentSlide]);

  const orderedItems = [...galleryItems].sort((a, b) => a.displayOrder - b.displayOrder);

  // Build a padded set of at least 8 items for the marquee (loops seamlessly via duplication)
  const baseSet: HomeGalleryItem[] = orderedItems.length > 0
    ? Array.from({ length: Math.max(8, orderedItems.length) }, (_, i) => orderedItems[i % orderedItems.length])
    : [];
  const marqueeItems = [...baseSet, ...baseSet]; // duplicate for seamless loop

  const activeItem = orderedItems[currentSlide] || null;
  const heroBackground = activeItem?.mediaDataUrl || '';
  const heroTitle = activeItem?.title?.trim() || `${t('hero_main_title_a')} ${t('hero_main_title_b')}`;
  const heroDescription = activeItem?.description?.trim() || t('hero_main_description');

  const titleLength = heroTitle.length;
  const descriptionLength = heroDescription.length;
  const combinedLength = titleLength + descriptionLength;

  const titleSizeClass =
    titleLength > 65
      ? 'text-xl sm:text-2xl lg:text-3xl'
      : titleLength > 40
      ? 'text-2xl sm:text-3xl lg:text-4xl'
      : 'text-3xl sm:text-4xl lg:text-5xl';

  const blockWidthClass =
    combinedLength > 260
      ? 'max-w-xl'
      : combinedLength > 170
      ? 'max-w-lg'
      : 'max-w-md';

  const descSizeClass = descriptionLength > 210 ? 'text-sm sm:text-base' : 'text-base sm:text-lg';
  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen w-full animate-fade-in transition-colors duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`} style={{marginTop: 0, paddingTop: 0}}>
      <header className={`sticky top-0 z-40 border-b backdrop-blur transition-colors duration-300 ${isDark ? 'border-slate-800/80 bg-slate-900/95' : 'border-slate-200/70 bg-white/95'}`} style={{marginTop: 0, paddingTop: 0}}>
        <div className="w-full px-5 sm:px-7 py-3.5 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 min-w-0 max-w-[180px] sm:max-w-xs md:max-w-sm lg:max-w-md xl:max-w-lg">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center shrink-0">
              <Activity size={16} className="sm:text-[20px] text-white" />
            </div>
            <div className="min-w-0 flex flex-col">
              <p className={`text-base sm:text-lg md:text-xl font-extrabold tracking-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>TUNG CHICKS Ltd</p>
              <p className={`text-[9px] sm:text-[11px] md:text-xs font-bold uppercase tracking-widest truncate ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>{t('institutional_portal')}</p>
            </div>
          </Link>


          <nav className={`hidden lg:flex items-center gap-8 text-base font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
            <Link to="/" className="hover:text-blue-600 transition-colors">{t('home')}</Link>
            <Link to="/about" className="hover:text-blue-600 transition-colors">{t('about')}</Link>
            <Link to="/contact" className="hover:text-blue-600 transition-colors">{t('contact')}</Link>
            <Link to="/marketplace" className="hover:text-blue-600 transition-colors">{t('marketplace')}</Link>
            <Link to="/farmer-MyAnnouncement" className="flex items-center gap-1.5 hover:text-green-400 transition-colors text-base">
              <span role="img" aria-label="bullhorn" className="text-base">📢</span>
              <span>{t('announcements')}</span>
            </Link>
            <Link to="/login" className="hover:text-blue-600 transition-colors">{t('login')}</Link>
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors text-base"
              aria-label="Toggle mode"
              title="Toggle mode"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'rw' | 'sw' | 'fr')}
              className="min-w-[110px] px-3 py-2 text-sm font-extrabold uppercase tracking-wider rounded-2xl border border-slate-200 bg-white text-slate-700"
              aria-label={t('language')}
            >
              <option value="en">English</option>
              <option value="rw">Kinyarwanda</option>
              <option value="sw">Kiswahili</option>
              <option value="fr">Français</option>
            </select>
            <Link to="/register" className="px-5 py-2 text-base font-extrabold uppercase tracking-wider rounded-2xl bg-blue-700 text-white hover:bg-blue-800 transition-colors inline-flex items-center gap-2 shadow-lg">
              {t('join_platform')} <ArrowRight size={16} />
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden p-2.5 rounded-xl border border-slate-200 text-slate-700"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden px-4 pb-4 border-t border-slate-200 bg-white">
            <div className="pt-3 flex flex-col gap-2 text-sm font-bold text-slate-700">
              <button
                type="button"
                onClick={toggleTheme}
                className="mx-3 mb-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                <span className="text-xs font-black uppercase tracking-wider">Mode</span>
              </button>
              <div className="px-3 py-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">{t('language')}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'en' | 'rw' | 'sw' | 'fr')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm"
                  aria-label={t('language')}
                >
                  <option value="en">English</option>
                  <option value="rw">Kinyarwanda</option>
                  <option value="sw">Kiswahili</option>
                  <option value="fr">Français</option>
                </select>
              </div>
              <Link to="/" className="px-3 py-2 rounded-lg hover:bg-slate-100" onClick={() => setMenuOpen(false)}>{t('home')}</Link>
              <Link to="/about" className="px-3 py-2 rounded-lg hover:bg-slate-100" onClick={() => setMenuOpen(false)}>{t('about')}</Link>
              <Link to="/contact" className="px-3 py-2 rounded-lg hover:bg-slate-100" onClick={() => setMenuOpen(false)}>{t('contact')}</Link>
              <Link to="/login" className="px-3 py-2 rounded-lg bg-blue-700 text-white" onClick={() => setMenuOpen(false)}>{t('login')}</Link>
            </div>
          </div>
        )}
      </header>

      <main className="w-full">
        <section className="relative min-h-[calc(100vh-72px)] overflow-hidden">
          {heroBackground ? (
            activeItem?.mediaType === 'video' ? (
              <video
                src={heroBackground}
                className={`absolute inset-0 w-full h-full object-contain ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}
                autoPlay
                muted
                playsInline
                onEnded={() => setCurrentSlide((prev) => (prev + 1) % galleryItems.length)}
              />
            ) : (
              <img
                src={heroBackground}
                alt="Hero"
                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}
              />
            )
          ) : (
            <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800' : 'bg-gradient-to-br from-slate-200 via-blue-100 to-cyan-100'}`} />
          )}

          <div className={`absolute inset-0 ${isDark ? 'bg-slate-950/55' : 'bg-white/35'}`} />

          <div className="relative min-h-[calc(100vh-72px)] px-4 sm:px-8 lg:px-12 pt-8 pb-56 flex items-center justify-start text-left">
            <div className="w-full flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:justify-between">
              <div className={`flex-1 min-w-0 ${blockWidthClass} rounded-3xl backdrop-blur-md p-5 sm:p-7 lg:p-9 shadow-2xl ${isDark ? 'border border-white/20 bg-slate-900/45' : 'border border-slate-200/90 bg-white/75'}`}>
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest mb-5 ${isDark ? 'border border-blue-300/40 bg-blue-500/20 text-blue-100' : 'border border-blue-300/60 bg-blue-100/80 text-blue-700'}`}>
                  <Circle size={8} fill="currentColor" /> {t('institutional_portal')}
                </div>

                <h1 className={`${titleSizeClass} font-black leading-[0.95] mb-6 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  <span className="block bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300 text-transparent bg-clip-text">
                    {heroTitle}
                  </span>
                </h1>

                <p className={`max-w-3xl ${descSizeClass} font-semibold leading-relaxed ${isDark ? 'text-slate-100/95' : 'text-slate-700'}`}>
                  {heroDescription}
                </p>
              </div>

              <aside className={`hidden lg:block shrink-0 ml-auto w-full max-w-sm rounded-3xl backdrop-blur-md p-6 shadow-2xl ${isDark ? 'border border-white/15 bg-slate-900/35' : 'border border-slate-200/90 bg-white/70'}`}>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  {t('at_a_glance')}
                </p>
                <h2 className={`text-xl font-black mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {t('system_summary')}
                </h2>
                <ul className={`space-y-3 text-sm font-semibold leading-relaxed ${isDark ? 'text-slate-200/90' : 'text-slate-700'}`}>
                  <li className="flex items-start gap-3">
                    <span className={`mt-1.5 inline-flex h-2.5 w-2.5 rounded-full ${isDark ? 'bg-emerald-300/80' : 'bg-emerald-500/80'}`} />
                    <span>{t('real_time_monitoring')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className={`mt-1.5 inline-flex h-2.5 w-2.5 rounded-full ${isDark ? 'bg-emerald-300/80' : 'bg-emerald-500/80'}`} />
                    <span>{t('smart_alerts')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className={`mt-1.5 inline-flex h-2.5 w-2.5 rounded-full ${isDark ? 'bg-emerald-300/80' : 'bg-emerald-500/80'}`} />
                    <span>{t('incubator_tools')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className={`mt-1.5 inline-flex h-2.5 w-2.5 rounded-full ${isDark ? 'bg-emerald-300/80' : 'bg-emerald-500/80'}`} />
                    <span>{t('analytics_ai')}</span>
                  </li>
                </ul>
              </aside>
            </div>
          </div>

          <div className={`absolute left-0 right-0 bottom-0 z-20 backdrop-blur-sm py-3 ${isDark ? 'bg-slate-900/40 border-t border-white/15' : 'bg-white/70 border-t border-slate-200'}`}>
            <div className="relative overflow-hidden">
              {/* Continuous right-to-left sliding strip */}
              {marqueeItems.length > 0 ? (
                <div
                  className="flex items-center gap-3 w-max px-4 sm:px-6"
                  style={{ animation: 'marqueeLeft 60s linear infinite' }}
                >
                  {marqueeItems.map((item, index) => (
                    <ThumbCard key={item.id + '-' + index} item={item} />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 sm:px-6">
                  {Array.from({ length: 6 }).map((_, i) => <PlaceholderCard key={i} />)}
                </div>
              )}

              {/* Centered CTA buttons floating over strip */}
              <div className="absolute inset-0 flex items-center justify-center gap-4 pointer-events-none">
                <Link to="/login" className="pointer-events-auto h-14 sm:h-16 w-[210px] rounded-2xl bg-blue-700 hover:bg-blue-800 text-white font-black text-sm uppercase tracking-wider inline-flex items-center justify-center gap-2 shadow-xl">
                  {t('enter_portal')} <ArrowRight size={18} />
                </Link>
                <Link to="/about" className={`pointer-events-auto h-14 sm:h-16 w-[210px] rounded-2xl font-black text-sm uppercase tracking-wider inline-flex items-center justify-center gap-2 shadow-xl ${isDark ? 'bg-white/20 hover:bg-white/30 border border-white/30 text-white' : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'}`}>
                  {t('quick_guide')} <MousePointer2 size={18} />
                </Link>
                <Link to="/our-services" className="pointer-events-auto h-14 sm:h-16 w-[210px] rounded-2xl bg-green-500 hover:bg-green-600 text-black font-black text-sm uppercase tracking-wider inline-flex items-center justify-center gap-2 shadow-xl">
                  <span role="img" aria-label="services">📢</span> {t('our_services')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

const ThumbCard = ({ item }: { item: HomeGalleryItem }) => (
  <article className="relative w-44 sm:w-56 h-32 sm:h-40 shrink-0 rounded-2xl overflow-hidden border border-white/20 bg-slate-900/50">
    {item.mediaType === 'video' ? (
      <video src={item.mediaDataUrl} className="w-full h-full object-cover" muted loop autoPlay playsInline />
    ) : (
      <img src={item.mediaDataUrl} alt={item.title} className="w-full h-full object-cover" />
    )}
  </article>
);

const PlaceholderCard = () => (
  <div className="w-44 sm:w-56 h-32 sm:h-40 shrink-0 rounded-2xl border border-white/20 bg-white/10" />
);

export default Home;
