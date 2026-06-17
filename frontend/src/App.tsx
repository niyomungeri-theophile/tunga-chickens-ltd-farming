import FarmerMyAnnouncement from './pages/FarmerMyAnnouncement';
import CustomerMyAnnouncement from './pages/CustomerMyAnnouncement';
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { 
  Menu, X, Activity, Wallet, LogOut,
  BrainCircuit, Droplets, Sun, Moon, Loader2, LayoutDashboard, ClipboardList, ImagePlus, FileSignature, Users, Store,
  HardDrive, ArrowLeft
} from 'lucide-react';
import { auth, db } from './api';
import { LanguageProvider, useTranslation } from './contexts/LanguageContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Architecture from './pages/Architecture';
import Login from './pages/Login';
import FarmerDashboard from './pages/FarmerDashboard';
import StaffDashboard from './pages/StaffDashboard';
import Predictions from './pages/Predictions';
import FeedWaterRecommendation from './pages/FeedWaterRecommendation';
import RequestForm from './pages/RequestForm';
import ImageForm from './pages/ImageForm';
import AIChat from './components/AIChat';
import ContractManagement from './pages/ContractManagement';
import UserManagement from './pages/UserManagement';
import AdminDeviceManagement from './pages/AdminDeviceManagement';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminUserEdit from './pages/AdminUserEdit';
import SupervisorDashboard from './pages/SupervisorDashboard';
import ProductRegister from './pages/ProductRegister';
import MyProducts from './pages/MyProducts';
import Marketplace from './pages/Marketplace';
import CustomerDashboard from './pages/CustomerDashboard';
import CustomerRegister from './pages/CustomerRegister';
import SellerApplication from './pages/SellerApplication';
import SellerRequests from './pages/SellerRequests';
import Announcements from './components/Announcements';
import AnnouncementsPage from './pages/Announcements';
import Profile from './pages/Profile';
import OurServices from './pages/OurServices';

const Sidebar = ({ user, userData, isOpen, toggle }: { user: any, userData: any, isOpen: boolean, toggle: () => void }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login', { replace: true });
  };

  const role = String(userData?.role || user?.role || '').toLowerCase();
  const isFarmer = role === 'farmer';
  const isCustomer = role === 'customer';
  const isSupervisor = role === 'supervisor';
  const isAdmin = role === 'admin';
  const isAdminLike = isAdmin || isSupervisor;
  const canSell = Boolean(userData?.canSell);
  const isMarketplace = isCustomer || canSell;

  const myProductsPath = '/my-products';
  const productNavItems: NavItem[] = [
    { name: t('uploading_product'), path: '/product-register', icon: <ImagePlus size={20} /> },
    { name: t('my_products'), path: myProductsPath, icon: <Users size={20} /> }
  ];

  // Farmer sidebar: insert Announcement between Feed & Water Recommendation and Contracts
  const [showSidebarAnnouncement, setShowSidebarAnnouncement] = useState(false);

  type NavItem = {
    name: string;
    path: string;
    icon: React.ReactNode;
    onClick?: () => void;
  };

  const commonNavItems: NavItem[] = [
    { name: t('dashboard'), path: '/farmer-dashboard', icon: <LayoutDashboard size={20} /> },
    { name: t('financial_records'), path: '/financial-records', icon: <Wallet size={20} /> },
    { name: t('ai_predictions'), path: '/predictions', icon: <BrainCircuit size={20} /> },
    { name: t('feed_water_recommendation'), path: '/feed-water-recommendation', icon: <Droplets size={20} /> },
    // Announcement link for farmer
    ...(isFarmer ? [{
      name: t('my_announcement'),
      path: '/farmer-MyAnnouncement',
      icon: <span role="img" aria-label="bullhorn" className="text-lg">📢</span>,
    }] : []),
    ...productNavItems,
    { name: t('contracts'), path: '/contracts', icon: <FileSignature size={20} /> },
  ];


  const [showAdminAnnMenu, setShowAdminAnnMenu] = useState(false);
  const adminOnlyNavItems: NavItem[] = [
    { name: t('request_form'), path: '/request-form', icon: <ClipboardList size={20} /> },
    { name: t('image_form'), path: '/image-form', icon: <ImagePlus size={20} /> },
    {
      name: t('announcements'),
      path: '#',
      icon: <span role="img" aria-label="bullhorn" className="text-lg">📢</span>,
      onClick: () => setShowAdminAnnMenu((v) => !v)
    },
    ...productNavItems,
    { name: t('seller_requests'), path: '/seller-requests', icon: <ClipboardList size={20} /> },
    { name: t('users'), path: '/users', icon: <Users size={20} /> },
    { name: t('device_management'), path: '/devices', icon: <HardDrive size={20} /> },
  ];

  const customerNavItems: NavItem[] = [
    { name: t('customer_dashboard'), path: '/customer-dashboard', icon: <LayoutDashboard size={20} /> },
    { name: t('marketplace'), path: '/marketplace', icon: <Store size={20} /> },
    // Insert My Announcement between Marketplace and My Products, with correct path
    { name: t('my_announcement'), path: '/customer-myannouncement', icon: <span role="img" aria-label="bullhorn" className="text-lg">📢</span> },
    ...productNavItems,
  ];

  const [showSellerAnnMenu, setShowSellerAnnMenu] = useState(false);
  const sellerNavItems: NavItem[] = [
    { name: t('seller_dashboard'), path: '/customer-dashboard', icon: <LayoutDashboard size={20} /> },
    {
      name: t('my_announcements'),
      path: '#',
      icon: <span role="img" aria-label="bullhorn" className="text-lg">📢</span>,
      onClick: () => setShowSellerAnnMenu((v) => !v)
    },
    ...productNavItems,
  ];

  // Announcements dropdown state for supervisor
  const [showSidebarAnnMenu, setShowSidebarAnnMenu] = useState(false);
  const supervisorNavItems: NavItem[] = [
    { name: t('system_report'), path: '/supervisor-dashboard', icon: <Activity size={20} /> },
    // Announcements button with dropdown
    {
      name: t('announcements'),
      path: '#',
      icon: <span role="img" aria-label="bullhorn" className="text-lg">📢</span>,
      onClick: () => setShowSidebarAnnMenu((v) => !v)
    },
    ...productNavItems,
    { name: t('users'), path: '/users', icon: <Users size={20} /> },
  ];

  const farmerViewMatch = location.pathname.match(/^\/users\/([^/]+)\/(dashboard|predictions|contracts|financial-records|feed-water-recommendation)/);
  const farmerViewParams = new URLSearchParams(location.search);
  const farmerViewUserId = farmerViewMatch ? farmerViewMatch[1] : farmerViewParams.get('userId');
  const farmerViewQuery = farmerViewParams.toString() ? `?${farmerViewParams.toString()}` : '';
  const isViewingFarmer = isAdminLike && Boolean(farmerViewUserId);
  const farmerViewNavItems: NavItem[] = farmerViewUserId ? [
    { name: t('dashboard'), path: `/users/${farmerViewUserId}/dashboard${farmerViewQuery}`, icon: <LayoutDashboard size={20} /> },
    { name: t('financial_records'), path: `/users/${farmerViewUserId}/financial-records${farmerViewQuery}`, icon: <Wallet size={20} /> },
    { name: t('ai_predictions'), path: `/users/${farmerViewUserId}/predictions${farmerViewQuery}`, icon: <BrainCircuit size={20} /> },
    { name: t('feed_water_recommendation'), path: `/users/${farmerViewUserId}/feed-water-recommendation${farmerViewQuery}`, icon: <Droplets size={20} /> },
    { name: t('contracts'), path: `/users/${farmerViewUserId}/contracts${farmerViewQuery}`, icon: <FileSignature size={20} /> },
    { name: t('uploading_product'), path: `/product-register${farmerViewQuery}`, icon: <ImagePlus size={20} /> },
    { name: t('my_products'), path: `/my-products${farmerViewQuery}`, icon: <Users size={20} /> },
  ] : [];

  const navItems = isViewingFarmer
    ? farmerViewNavItems
    : canSell
      ? sellerNavItems
      : isFarmer
        ? commonNavItems
        : isCustomer
          ? customerNavItems
          : isSupervisor
            ? supervisorNavItems
            : adminOnlyNavItems;

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[45] md:hidden" onClick={toggle} />}
      <div className={`fixed left-0 top-0 h-screen bg-[#020c02] text-[#39ff14] z-50 flex flex-col p-6 transition-transform duration-500 border-r border-[#39ff14]/10 w-72 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
               <div className="flex items-center gap-3">
                 <h2 className="text-xl font-black tracking-tighter text-[#39ff14]">{t('app_title')}</h2>
                 {isFarmer && (
                   userData?.photoURL ? (
                     <img src={userData.photoURL} alt="Farmer" className="w-8 h-8 rounded-full border border-[#39ff14]/20" />
                   ) : (
                     <div className="w-8 h-8 rounded-full bg-[#39ff14]/10 border border-[#39ff14]/20 flex items-center justify-center text-sm font-black text-[#39ff14]">
                       {(userData?.fullName?.charAt(0) || 'F').toUpperCase()}
                     </div>
                   )
                 )}
              </div>
            </div>
          </div>
          <button onClick={toggle} className="md:hidden text-[#39ff14]"><X size={24} /></button>
        </div>
        
        

        <nav className="flex-grow space-y-1 overflow-y-auto pr-2 custom-scrollbar">

          
          <div className="text-[10px] font-black text-[#1a7a1a] uppercase tracking-[0.25em] px-4 mb-4">{t('administration')}</div>
          {navItems.map((item, idx) => {
            // Custom rendering for Announcements dropdown for supervisor
            if (item.name === t('announcements') && isSupervisor) {
              return (
                <div key="announcements-sidebar-dropdown" className="relative mb-1.5">
                  <button
                    onClick={item.onClick}
                    className={`flex items-center space-x-3 p-4 rounded-2xl transition-all w-full text-[#1a7a1a] hover:bg-[#39ff14]/10 hover:text-[#39ff14]`}
                    style={{ textAlign: 'left' }}
                  >
                    {item.icon}
                    <span className="text-sm tracking-tight">{item.name}</span>
                  </button>
                  {showSidebarAnnMenu && (
                    <div className="absolute left-0 mt-2 w-full bg-[#101f10] border border-[#39ff14]/30 rounded-2xl shadow-2xl z-50 flex flex-col">
                      <button
                        className="px-6 py-3 text-left hover:bg-[#39ff14]/10 text-[#39ff14] font-semibold rounded-t-2xl"
                        onClick={() => { setShowSidebarAnnMenu(false); window.open('/#/farmer-MyAnnouncement', '_blank'); }}
                      >
                        {t('edit_delete_announcements')}
                      </button>
                      <button
                        className="px-6 py-3 text-left hover:bg-[#39ff14]/10 text-[#39ff14] font-semibold rounded-b-2xl"
                        onClick={() => { setShowSidebarAnnMenu(false); navigate('/supervisor-dashboard?openAnnouncementForm=1'); }}
                      >
                        {t('new_announcement')}
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            // Special dropdown for admin Announcements
            if (item.name === t('announcements') && showAdminAnnMenu) {
              return (
                <div key="admin-announcements-sidebar-dropdown" className="relative mb-1.5">
                  <button
                    onClick={item.onClick}
                    className={`flex items-center space-x-3 p-4 rounded-2xl transition-all w-full text-[#1a7a1a] hover:bg-[#39ff14]/10 hover:text-[#39ff14]`}
                    style={{ textAlign: 'left' }}
                  >
                    {item.icon}
                    <span className="text-sm tracking-tight">{item.name}</span>
                  </button>
                  <div className="absolute left-0 mt-2 w-full bg-[#101f10] border border-[#39ff14] rounded-2xl shadow-2xl z-50 flex flex-col p-4" style={{minWidth:200}}>
                    <button
                      className="w-full mb-4 py-3 text-left font-bold text-[20px] text-[#39ff14] rounded-xl hover:bg-[#39ff14]/10"
                      style={{border:'none',background:'none'}}
                      onClick={() => { setShowAdminAnnMenu(false); window.location.hash = '/farmer-MyAnnouncement'; }}
                    >
                      {t('edit_delete_announcements')}
                    </button>
                    <button
                      className="w-full py-3 text-left font-bold text-[20px] text-[#39ff14] rounded-xl hover:bg-[#39ff14]/10"
                      style={{border:'none',background:'none'}}
                      onClick={() => { setShowAdminAnnMenu(false); window.open('/#/customer-myannouncement', '_blank'); }}
                    >
                      {t('new_announcement')}
                    </button>
                  </div>
                </div>
              );
            }
            // Special dropdown for seller/customer My Announcements
            if (item.name === t('my_announcements') && showSellerAnnMenu) {
              return (
                <div key="seller-announcements-sidebar-dropdown" className="relative mb-1.5">
                  <button
                    onClick={item.onClick}
                    className={`flex items-center space-x-3 p-4 rounded-2xl transition-all w-full text-[#1a7a1a] hover:bg-[#39ff14]/10 hover:text-[#39ff14]`}
                    style={{ textAlign: 'left' }}
                  >
                    {item.icon}
                    <span className="text-sm tracking-tight">{item.name}</span>
                  </button>
                  <div className="absolute left-0 mt-2 w-full bg-[#101f10] border border-[#39ff14] rounded-2xl shadow-2xl z-50 flex flex-col p-4" style={{minWidth:200}}>
                    <button
                      className="w-full mb-4 py-3 text-left font-bold text-[20px] text-[#39ff14] rounded-xl hover:bg-[#39ff14]/10"
                      style={{border:'none',background:'none'}}
                      onClick={() => { setShowSellerAnnMenu(false); window.open('/#/customer-myannouncement', '_blank'); }}
                    >
                      {t('create_new_announcement')}
                    </button>
                    <button
                      className="w-full py-3 text-left font-bold text-[20px] text-[#39ff14] rounded-xl hover:bg-[#39ff14]/10"
                      style={{border:'none',background:'none'}}
                      onClick={() => { setShowSellerAnnMenu(false); window.location.hash = '/farmer-MyAnnouncement'; }}
                    >
                      {t('edit_delete_created_announcements')}
                    </button>
                  </div>
                </div>
              );
            }
            // Default rendering for other items
            return item.onClick ? (
              <button
                key={item.name}
                onClick={item.onClick}
                className={`flex items-center space-x-3 p-4 rounded-2xl transition-all mb-1.5 text-[#1a7a1a] hover:bg-[#39ff14]/10 hover:text-[#39ff14]`}
                style={{ width: '100%', textAlign: 'left' }}
              >
                {item.icon}
                <span className="text-sm tracking-tight">{item.name}</span>
              </button>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => { if(window.innerWidth < 768) toggle(); }}
                className={`flex items-center space-x-3 p-4 rounded-2xl transition-all mb-1.5 ${
                  (location.pathname === item.path || (item.path === '/users' && location.pathname.startsWith('/users/')))
                  ? 'bg-[#39ff14]/15 text-[#39ff14] border border-[#39ff14]/30 shadow-lg shadow-[#39ff14]/5' 
                  : 'text-[#1a7a1a] hover:bg-[#39ff14]/10 hover:text-[#39ff14]'
                }`}
              >
                {item.icon}
                <span className="text-sm tracking-tight">{item.name}</span>
              </Link>
            );
          })}
              {/* Sidebar Announcement Modal for Farmer */}
              {showSidebarAnnouncement && isFarmer && (
                <div className="fixed inset-0 z-[200]">
                  <Announcements userRole={role} authToken={localStorage.getItem('authToken') || ''} />
                  <div className="fixed inset-0 bg-black/60" onClick={() => setShowSidebarAnnouncement(false)} />
                </div>
              )}
        </nav>

        <div className="pt-6 border-t border-slate-100 dark:border-white/5 mt-6">
          <div className="mb-6 flex items-center space-x-4 px-2">
            <div className="w-12 h-12 rounded-2xl bg-[#39ff14]/10 border border-[#39ff14]/20 flex items-center justify-center overflow-hidden">
              {userData?.photoURL ? (
                <img src={userData.photoURL} className="w-full h-full object-cover" alt="Profile" />
              ) : (
                <span className="text-lg font-black text-[#39ff14]">
                  {(userData?.fullName?.charAt(0) || user?.email?.charAt(0) || 'U').toUpperCase()}
                </span>
              )}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-black truncate text-[#39ff14]">
                {userData ? (userData.fullName || user?.email?.split('@')[0] || t('user')) : t('loading')}
              </p>
              <p className="text-[10px] text-[#1a7a1a] font-bold uppercase tracking-widest">
                {userData ? (userData.role || 'Seller') : '...'}
              </p>
            </div>
          </div>
          <Link 
            to="/profile"
            onClick={toggle}
            className="w-full flex items-center space-x-3 p-4 rounded-2xl text-[#1a7a1a] hover:bg-[#39ff14]/10 hover:text-[#39ff14] transition-all font-black text-xs uppercase tracking-widest mb-2"
          >
            <span>👤</span>
            <span>My Profile</span>
          </Link>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 p-4 rounded-2xl text-[#1a7a1a] hover:bg-[#39ff14]/10 hover:text-[#39ff14] transition-all font-black text-xs uppercase tracking-widest"
          >
            <LogOut size={18} />
            <span>{t('sign_out')}</span>
          </button>
        </div>
      </div>
    </>
  );
};

const AppContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const storedRole = localStorage.getItem('userRole') || '';
  const token = localStorage.getItem('authToken') || '';
  const roleFromToken = (() => {
    if (!token) return '';
    const parts = token.split('.');
    if (parts.length < 2) return '';
    try {
      const normalized = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded));
      return String(payload?.role || '').toLowerCase();
    } catch (_) {
      return '';
    }
  })();
  const role = String(userData?.role || user?.role || storedRole || roleFromToken).toLowerCase();
  const isSupervisor = role === 'supervisor';
  const isCustomer = role === 'customer';
  const isAdminLike = role === 'admin' || isSupervisor;
  const _storedRole = String(localStorage.getItem('userRole') || '').toLowerCase();
  const isAdminLikeFinal = isAdminLike || _storedRole === 'admin' || _storedRole === 'supervisor';
  const storedCanSell = localStorage.getItem('canSell') === 'true';
  const canSell = userData?.canSell !== undefined ? Boolean(userData?.canSell) : storedCanSell;
  const isPublicRole = role === '' && !canSell;
  const isMarketplace = isCustomer || canSell;

  const handlePublicLogout = async () => {
    await auth.signOut();
    navigate('/login', { replace: true });
  };

  const defaultBackRoute = user && !isPublicRole
    ? (isMarketplace ? '/customer-dashboard' : isAdminLike ? (isSupervisor ? '/supervisor-dashboard' : '/users') : '/farmer-dashboard')
    : '/';

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(defaultBackRoute, { replace: true });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) setLoading(false);
    }, 5000);

    const unsubscribe = auth.onAuthStateChanged(async (u: any) => {
      setUser(u);
      if (u) {
        try {
          const userData = await db.getUser(u.uid);
          if (userData) setUserData(userData);
        } catch (err) {
          console.error("Error fetching user data:", err);
        }
      }
      setLoading(false);
      clearTimeout(timer);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-500 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
           <Activity className="text-emerald-500" size={40} />
        </div>
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-emerald-500" size={20} />
          <span className="text-sm font-black text-slate-500 uppercase tracking-widest">{t('initializing')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {user && !isPublicRole && (
        <div className="md:hidden fixed top-6 left-6 z-[60]">
          <button onClick={() => setIsSidebarOpen(true)} className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-white/10 text-slate-900 dark:text-white">
            <Menu size={24} />
          </button>
        </div>
      )}

      {user && isPublicRole && (
        <div className="fixed top-6 right-6 z-[60]">
          <button
            onClick={handlePublicLogout}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-100 dark:border-white/10 text-slate-700 dark:text-slate-100 font-black text-xs uppercase tracking-widest"
          >
            <LogOut size={18} />
            <span>{t('sign_out')}</span>
          </button>
        </div>
      )}



      {user && !isPublicRole && <Sidebar user={user} userData={userData} isOpen={isSidebarOpen} toggle={() => setIsSidebarOpen(!isSidebarOpen)} />}
      <div className={`${user && !isPublicRole ? 'md:ml-72 pt-20 md:pt-0' : 'pt-20'} transition-all duration-500 min-h-screen relative`}>
        {location.pathname !== '/' && (
         <div className="fixed top-20 right-8 z-40 ">
  <button
    onClick={handleBack}
    className="inline-flex items-center gap-2 rounded-2xl bg-white/95 dark:bg-slate-400 hover:cursor-pointer border border-slate-200 dark:border-white/10 shadow-lg px-4 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition animate-bounce"
  >
    <ArrowLeft size={16} />
    {t('back')}
  </button>
</div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              user
                ? (isPublicRole
                  ? <Home />
                  : isMarketplace
                    ? <Navigate to="/customer-dashboard" replace />
                    : <Home />)
                : <Home />
            }
          />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/farmer-MyAnnouncement" element={<FarmerMyAnnouncement />} />
          <Route path="/customer-myannouncement" element={<CustomerMyAnnouncement />} />
          <Route path="/our-services" element={<OurServices />} />
          <Route path="/customer-dashboard" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isMarketplace ? <CustomerDashboard /> : <Navigate to={isAdminLikeFinal ? (isSupervisor ? '/supervisor-dashboard' : '/users') : '/farmer-dashboard'} replace />) : <Navigate to="/login" />} />
          <Route path="/product-register" element={user && !isPublicRole ? <ProductRegister /> : <Navigate to="/" />} />
          <Route path="/my-products" element={user && !isPublicRole ? <MyProducts /> : <Navigate to="/" />} />
          <Route path="/customer-register" element={<CustomerRegister />} />
          <Route path="/seller-application" element={<SellerApplication />} />
          <Route path="/architecture" element={user ? (isPublicRole ? <Navigate to="/" replace /> : <Architecture />) : <Navigate to="/login" />} />
          <Route path="/login" element={!user ? <Login /> : <Navigate to={role === 'admin' ? '/users' : role === 'supervisor' ? '/supervisor-dashboard' : isMarketplace ? '/customer-dashboard' : role === 'farmer' ? '/farmer-dashboard' : '/'} />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />
          <Route path="/farmer-dashboard" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isMarketplace ? <Navigate to="/customer-dashboard" replace /> : isAdminLikeFinal ? <Navigate to={isSupervisor ? '/supervisor-dashboard' : '/users'} replace /> : <FarmerDashboard user={user} />) : <Navigate to="/login" />} />
          <Route path="/predictions" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isMarketplace ? <Navigate to="/customer-dashboard" replace /> : isAdminLikeFinal ? <Navigate to={isSupervisor ? '/supervisor-dashboard' : '/users'} replace /> : <Predictions />) : <Navigate to="/login" />} />
          <Route path="/feed-water-recommendation" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isMarketplace ? <Navigate to="/customer-dashboard" replace /> : isAdminLikeFinal ? <Navigate to={isSupervisor ? '/supervisor-dashboard' : '/users'} replace /> : <FeedWaterRecommendation />) : <Navigate to="/login" />} />
          <Route path="/financial-records" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isMarketplace ? <Navigate to="/customer-dashboard" replace /> : isAdminLikeFinal ? <Navigate to={isSupervisor ? '/supervisor-dashboard' : '/users'} replace /> : <StaffDashboard user={user} />) : <Navigate to="/login" />} />
          <Route path="/finance" element={<Navigate to="/financial-records" replace />} />
          <Route path="/financial" element={<Navigate to="/financial-records" replace />} />
          <Route path="/staff-dashboard" element={<Navigate to="/financial-records" replace />} />
          <Route path="/request-form" element={user ? (isPublicRole ? <Navigate to="/" replace /> : role === 'admin' ? <RequestForm /> : <Navigate to={isSupervisor ? '/supervisor-dashboard' : isMarketplace ? '/customer-dashboard' : '/farmer-dashboard'} replace />) : <Navigate to="/login" />} />
          <Route path="/image-form" element={user ? (isPublicRole ? <Navigate to="/" replace /> : role === 'admin' ? <ImageForm /> : <Navigate to={isSupervisor ? '/supervisor-dashboard' : isMarketplace ? '/customer-dashboard' : '/farmer-dashboard'} replace />) : <Navigate to="/login" />} />
          <Route path="/seller-requests" element={user ? (isPublicRole ? <Navigate to="/" replace /> : role === 'admin' ? <SellerRequests /> : <Navigate to={isSupervisor ? '/supervisor-dashboard' : isMarketplace ? '/customer-dashboard' : '/farmer-dashboard'} replace />) : <Navigate to="/login" />} />
          <Route path="/supervisor-dashboard" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isSupervisor ? <SupervisorDashboard /> : <Navigate to={role === 'admin' ? '/users' : isMarketplace ? '/customer-dashboard' : '/farmer-dashboard'} replace />) : <Navigate to="/login" />} />
          <Route path="/contracts" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isMarketplace ? <Navigate to="/customer-dashboard" replace /> : isAdminLikeFinal ? <Navigate to={isSupervisor ? '/supervisor-dashboard' : '/users'} replace /> : <ContractManagement currentUser={user} currentRole={role} />) : <Navigate to="/login" />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" />} />
          <Route path="/users" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isAdminLikeFinal ? <UserManagement /> : <Navigate to={isMarketplace ? '/customer-dashboard' : '/farmer-dashboard'} replace />) : <Navigate to="/login" />} />
            <Route path="/devices" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isAdminLikeFinal ? <AdminDeviceManagement /> : <Navigate to={isMarketplace ? '/customer-dashboard' : '/farmer-dashboard'} replace />) : <Navigate to="/login" />} />
          <Route path="/users/:userId" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isAdminLikeFinal ? <AdminUserDetail /> : <Navigate to="/farmer-dashboard" replace />) : <Navigate to="/login" />} />
          <Route path="/users/:userId/edit" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isAdminLikeFinal ? <AdminUserEdit /> : <Navigate to="/farmer-dashboard" replace />) : <Navigate to="/login" />} />
          <Route path="/users/:userId/dashboard" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isAdminLikeFinal ? <FarmerDashboard user={user} /> : <Navigate to="/contracts" replace />) : <Navigate to="/login" />} />
          <Route path="/users/:userId/financial-records" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isAdminLikeFinal ? <StaffDashboard user={user} /> : <Navigate to="/contracts" replace />) : <Navigate to="/login" />} />
          <Route path="/users/:userId/predictions" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isMarketplace ? <Navigate to="/customer-dashboard" replace /> : isAdminLikeFinal ? <Predictions /> : <Navigate to="/contracts" replace />) : <Navigate to="/login" />} />
          <Route path="/users/:userId/feed-water-recommendation" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isAdminLikeFinal ? <FeedWaterRecommendation /> : <Navigate to="/contracts" replace />) : <Navigate to="/login" />} />
          <Route path="/users/:userId/contracts" element={user ? (isPublicRole ? <Navigate to="/" replace /> : isAdminLikeFinal ? <ContractManagement currentUser={user} currentRole={role} /> : <Navigate to="/contracts" replace />) : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        
        {/* Floating AI Chat - Authenticated users only */}
        {user && <AIChat />}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <ThemeProvider>
        <LanguageProvider>
          <AppContent />
        </LanguageProvider>
      </ThemeProvider>
    </Router>
  );
};

export default App;
