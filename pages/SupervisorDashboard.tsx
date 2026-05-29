import React, { useState, useEffect, useCallback, useMemo } from 'react';
import SystemReportDashboard from '../components/SystemReportDashboard';
import {
  MapPin,
  MessageSquare,
  RefreshCw,
  BarChart3,
  Eye,
  MailOpen,
  Trash2,
  X,
  Download,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { db } from '../api';
import { useNavigate, useLocation } from 'react-router-dom';

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  farm_location?: string;
}

interface Contract {
  id: string;
  total_price_rwf: number;
  created_at: string;
}

interface ContactMessage {
  id: string;
  full_name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}

interface ProductRow {
  id: string;
  product_id?: string;
  product_name?: string;
  seller_name?: string;
  uploader_full_name?: string;
  uploader_email?: string;
  created_at?: string;
  updated_at?: string;
}

interface SellerApplicationRow {
  id: string;
  status: string;
  created_at?: string;
}

interface SessionStats {
  todayLogins: number;
  todayLogouts: number;
  currentlyLoggedIn: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SupervisorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sellerApplications, setSellerApplications] = useState<SellerApplicationRow[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats>({ todayLogins: 0, todayLogouts: 0, currentlyLoggedIn: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Announcement Form State
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementName, setAnnouncementName] = useState("");
  const [announcementPhone, setAnnouncementPhone] = useState("");
  const [announcementEmail, setAnnouncementEmail] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [publishing, setPublishing] = useState(false);

  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [showSystemReport, setShowSystemReport] = useState(false);
  const [messagePage, setMessagePage] = useState(1);

  const MESSAGES_PER_PAGE = 10;

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersResult, contractsResult, messagesResult, productsResult, applicationsResult, statsResult] = await Promise.allSettled([
        db.getAllUsers?.() || [],
        db.getContracts?.() || { contracts: [] },
        db.getContactMessages?.() || [],
        db.getProducts?.() || { products: [] },
        db.getSellerApplications?.('pending') || { applications: [] },
        db.getAuthSessionStats?.() || { todayLogins: 0, todayLogouts: 0, currentlyLoggedIn: 0 },
      ]);

      const extractValue = (result: PromiseSettledResult<any>, fallback: any) => (
        result.status === 'fulfilled' ? result.value : fallback
      );

      const usersData = extractValue(usersResult, []);
      const contractsData = extractValue(contractsResult, { contracts: [] });
      const messagesData = extractValue(messagesResult, []);
      const productsData = extractValue(productsResult, { products: [] });
      const applicationsData = extractValue(applicationsResult, { applications: [] });
      const statsData = extractValue(statsResult, { todayLogins: 0, todayLogouts: 0, currentlyLoggedIn: 0 });

      const normalizedUsers = Array.isArray(usersData)
        ? usersData
        : usersData && typeof usersData === 'object'
          ? Object.entries(usersData as Record<string, any>).map(([id, userInfo]) => ({
              id,
              full_name: String(userInfo?.fullName || userInfo?.full_name || ''),
              email: String(userInfo?.email || ''),
              role: String(userInfo?.role || ''),
              status: String(userInfo?.status || 'active'),
              farm_location: userInfo?.farmLocation || userInfo?.farm_location || '',
              created_at: userInfo?.createdAt || userInfo?.created_at || null
            }))
          : [];

      setUsers(normalizedUsers);
      setContracts(Array.isArray((contractsData as any)?.contracts) ? (contractsData as any).contracts : []);
      setMessages(Array.isArray(messagesData) ? messagesData : []);
      setProducts(Array.isArray((productsData as any)?.products) ? (productsData as any).products : []);
      setSellerApplications(Array.isArray((applicationsData as any)?.applications) ? (applicationsData as any).applications : []);
      setSessionStats({
        todayLogins: Number((statsData as any)?.todayLogins || 0),
        todayLogouts: Number((statsData as any)?.todayLogouts || 0),
        currentlyLoggedIn: Number((statsData as any)?.currentlyLoggedIn || 0),
      });

      const failedLoads = [usersResult, contractsResult, messagesResult, productsResult, applicationsResult, statsResult]
        .filter((result) => result.status === 'rejected')
        .length;
      if (failedLoads > 0) {
        console.warn(`Supervisor dashboard loaded with ${failedLoads} partial data request failure(s).`);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      alert("Failed to load data. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 45000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Open announcement form from URL query param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('openAnnouncementForm') === '1') {
      setShowAnnouncementForm(true);
    }
  }, [location.search]);

  // Computed Values
  const farmers = useMemo(() => 
    users.filter(u => String(u.role || '').toLowerCase() === 'farmer'), 
    [users]
  );

  const activeUsers = useMemo(() => users.filter(u => String(u.status || '').toLowerCase() === 'active'), [users]);

  const contributorCount = useMemo(() => {
    const contributors = new Set<string>();
    products.forEach((product) => {
      const key = String(product.uploader_email || product.seller_name || product.uploader_full_name || '').trim().toLowerCase();
      if (key) contributors.add(key);
    });
    return contributors.size;
  }, [products]);

  const latestSystemUpdate = useMemo(() => {
    const dateSources = [
      ...messages.map(item => item.created_at),
      ...contracts.map(item => item.created_at),
      ...products.map(item => item.updated_at || item.created_at),
    ].filter(Boolean) as string[];

    if (dateSources.length === 0) return new Date();

    const timestamps = dateSources.map(item => new Date(item).getTime()).filter(item => !Number.isNaN(item));
    if (timestamps.length === 0) return new Date();
    return new Date(Math.max(...timestamps));
  }, [contracts, messages, products]);

  const reportCards = useMemo(() => ([
    { label: 'Total Users', value: users.length },
    { label: 'Active Users', value: activeUsers.length },
    { label: 'Products', value: products.length },
    { label: 'Contributors', value: contributorCount },
    { label: 'Contracts', value: contracts.length },
    { label: 'Announcements', value: messages.length },
    { label: 'Pending Seller Applications', value: sellerApplications.length },
    { label: 'Today Logins', value: sessionStats.todayLogins },
  ]), [activeUsers.length, contributorCount, contracts.length, messages.length, products.length, sellerApplications.length, sessionStats.todayLogins, users.length]);

  const locationRows = useMemo(() => {
    const counts: Record<string, number> = {};
    farmers.forEach(user => {
      const loc = (user.farm_location || 'Unknown').trim();
      counts[loc] = (counts[loc] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count);
  }, [farmers]);

  const currentYear = new Date().getFullYear();

  const salesChartData = useMemo(() => {
    return MONTHS.map((month, index) => {
      const monthlyContracts = contracts.filter(c => {
        if (!c.created_at) return false;
        const date = new Date(c.created_at);
        return date.getFullYear() === currentYear && date.getMonth() === index;
      });
      return {
        month,
        salesValue: monthlyContracts.reduce((sum, c) => sum + Number(c.total_price_rwf || 0), 0),
      };
    });
  }, [contracts, currentYear]);

  const userStatusData = useMemo(() => ([
    { label: 'Active', value: activeUsers.length },
    { label: 'Inactive', value: Math.max(users.length - activeUsers.length, 0) },
  ]), [activeUsers.length, users.length]);

  const systemActivityData = useMemo(() => {
    const data = MONTHS.map((month, index) => {
      const monthIndex = index;
      const monthUsers = users.filter((user) => {
        const created = (user as any)?.created_at || (user as any)?.createdAt;
        if (!created) return false;
        const date = new Date(created);
        return !Number.isNaN(date.getTime()) && date.getFullYear() === currentYear && date.getMonth() === monthIndex;
      }).length;

      const monthContracts = contracts.filter((contract) => {
        if (!contract.created_at) return false;
        const date = new Date(contract.created_at);
        return date.getFullYear() === currentYear && date.getMonth() === monthIndex;
      }).length;

      const monthProducts = products.filter((product) => {
        const createdAt = product.created_at || product.updated_at;
        if (!createdAt) return false;
        const date = new Date(createdAt);
        return !Number.isNaN(date.getTime()) && date.getFullYear() === currentYear && date.getMonth() === monthIndex;
      }).length;

      const monthAnnouncements = messages.filter((message) => {
        if (!message.created_at) return false;
        const date = new Date(message.created_at);
        return date.getFullYear() === currentYear && date.getMonth() === monthIndex;
      }).length;

      return {
        month,
        users: monthUsers,
        contracts: monthContracts,
        products: monthProducts,
        announcements: monthAnnouncements,
      };
    });

    return data;
  }, [contracts, currentYear, messages, products, users]);

  const systemMixData = useMemo(() => ([
    { name: 'Users', value: users.length },
    { name: 'Products', value: products.length },
    { name: 'Contracts', value: contracts.length },
    { name: 'Announcements', value: messages.length },
    { name: 'Applications', value: sellerApplications.length },
  ]).filter(item => item.value > 0), [contracts.length, messages.length, products.length, sellerApplications.length, users.length]);

  const DONUT_COLORS = ['#39ff14', '#16a34a', '#22c55e', '#86efac', '#bbf7d0'];

  const unreadCount = messages.filter(m => m.status.toLowerCase() !== 'read').length;
  const totalPages = Math.ceil(messages.length / MESSAGES_PER_PAGE);
  const currentMessages = messages.slice(
    (messagePage - 1) * MESSAGES_PER_PAGE,
    messagePage * MESSAGES_PER_PAGE
  );

  // Handlers
  const refresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openMessage = async (msg: ContactMessage) => {
    setSelectedMessage(msg);
    if (msg.status.toLowerCase() === 'read') return;
    try {
      await db.markContactMessageAsRead?.(msg.id);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read' } : m));
    } catch (e) {
      console.error(e);
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      await db.deleteContactMessage?.(id);
      setMessages(prev => prev.filter(m => m.id !== id));
      if (selectedMessage?.id === id) setSelectedMessage(null);
    } catch (e) {
      console.error(e);
    }
  };

  const exportMessages = () => {
    if (messages.length === 0) return alert("No messages to export");

    const csv = "Name,Email,Subject,Message,Status,Date\n" +
      messages.map(m => 
        `"${m.full_name}","${m.email}","${m.subject}","${m.message.replace(/"/g, '""')}","${m.status}","${m.created_at}"`
      ).join("\n");

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  // Announcement Form
  if (showAnnouncementForm) {
    return (
      <div className="min-h-screen bg-[#020c02] flex items-center justify-center p-4">
        <div className="bg-[#020c02] border border-[#39ff14]/30 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl" 
             style={{ boxShadow: '0 0 40px rgba(57, 255, 20, 0.15)' }}>
          
          <div className="p-6 border-b border-[#39ff14]/20 flex justify-between items-center">
            <h3 className="text-3xl font-bold text-[#39ff14]">New Announcement</h3>
            <button 
              onClick={() => setShowAnnouncementForm(false)}
              className="text-[#39ff14] hover:bg-[#39ff14]/10 p-2 rounded-full"
            >
              <X size={28} />
            </button>
          </div>

          <form
            className="p-8 flex flex-col gap-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setPublishing(true);
              try {
                // Use api.ts for authenticated API call
                const { apiCall } = await import('../api');
                await apiCall('/announcements', {
                  method: "POST",
                  body: JSON.stringify({
                    name: announcementName,
                    phone: announcementPhone,
                    email: announcementEmail,
                    message: announcementMessage,
                  }),
                });
                alert("Announcement published successfully!");
                setShowAnnouncementForm(false);
                // Reset form
                setAnnouncementName("");
                setAnnouncementPhone("");
                setAnnouncementEmail("");
                setAnnouncementMessage("");
                navigate("/farmer-MyAnnouncement");
              } catch (err) {
                alert("Failed to publish announcement");
              } finally {
                setPublishing(false);
              }
            }}
          >
            <input
              type="text"
              className="w-full p-4 rounded-2xl border border-[#39ff14]/30 bg-transparent text-[#39ff14] placeholder-[#1a7a1a] text-lg"
              placeholder="Your Name"
              value={announcementName}
              onChange={(e) => setAnnouncementName(e.target.value)}
              required
            />
            <input
              type="tel"
              className="w-full p-4 rounded-2xl border border-[#39ff14]/30 bg-transparent text-[#39ff14] placeholder-[#1a7a1a] text-lg"
              placeholder="Phone Number"
              value={announcementPhone}
              onChange={(e) => setAnnouncementPhone(e.target.value)}
              required
            />
            <input
              type="email"
              className="w-full p-4 rounded-2xl border border-[#39ff14]/30 bg-transparent text-[#39ff14] placeholder-[#1a7a1a] text-lg"
              placeholder="Email Address"
              value={announcementEmail}
              onChange={(e) => setAnnouncementEmail(e.target.value)}
              required
            />
            <textarea
              className="w-full p-4 rounded-2xl border border-[#39ff14]/30 bg-transparent text-[#39ff14] placeholder-[#1a7a1a] text-lg resize-y min-h-[120px]"
              placeholder="Write your announcement message..."
              value={announcementMessage}
              onChange={(e) => setAnnouncementMessage(e.target.value)}
              required
            />

            <button
              type="submit"
              disabled={publishing}
              className="mt-4 w-full py-4 rounded-2xl bg-[#39ff14] text-black text-xl font-bold hover:bg-[#39ff14]/90 disabled:opacity-60 transition"
            >
              {publishing ? "Publishing..." : "Publish Announcement"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main Dashboard
  return (
    <div className="min-h-screen bg-[#020c02] p-4 md:p-8 text-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-bold text-[#39ff14]">Supervisor Dashboard</h1>
            <p className="text-[#1a7a1a] mt-1">All-system reporting for Eco-Smart Poultry Care System</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowAnnouncementForm(true)}
              className="flex items-center gap-2 px-6 py-3 bg-[#39ff14]/10 border border-[#39ff14]/30 rounded-2xl hover:bg-[#39ff14]/20 transition"
            >
              New Announcement
            </button>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-6 py-3 bg-[#39ff14]/10 border border-[#39ff14]/30 rounded-2xl hover:bg-[#39ff14]/20 disabled:opacity-50 transition"
            >
              <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-[#1a7a1a] text-lg">Loading dashboard...</div>
        ) : (
          <>
            {/* All System Reporting */}
            <div className="mb-10 bg-[#020c02] border border-[#39ff14]/20 rounded-3xl p-6">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-2xl font-semibold text-[#39ff14]">All System Reporting</h2>
                  <p className="text-sm text-[#1a7a1a] mt-1">
                    Updated {lastRefresh.toLocaleString()} • Last activity {latestSystemUpdate.toLocaleDateString()}
                  </p>
                </div>
                <div className="text-sm text-[#1a7a1a]">
                  {sessionStats.currentlyLoggedIn} users currently logged in • {sessionStats.todayLogouts} logouts today
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {reportCards.map((card) => (
                  <div key={card.label} className="rounded-2xl border border-[#39ff14]/10 bg-[#041004] p-4">
                    <div className="text-3xl font-black text-[#39ff14]">{card.value}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.2em] text-[#1a7a1a]">{card.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-10">
              <div className="bg-[#020c02] border border-[#39ff14]/20 rounded-3xl p-6">
                <h2 className="text-xl font-semibold text-[#39ff14] mb-4 flex items-center gap-2">
                  <BarChart3 size={22} /> System Activity {currentYear}
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={systemActivityData}>
                    <CartesianGrid stroke="#0a1f0a" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: '#39ff14' }} />
                    <YAxis tick={{ fill: '#1a7a1a' }} />
                    <Tooltip />
                    <Bar dataKey="users" fill="#39ff14" radius={4} />
                    <Bar dataKey="contracts" fill="#16a34a" radius={4} />
                    <Bar dataKey="products" fill="#22c55e" radius={4} />
                    <Bar dataKey="announcements" fill="#86efac" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-[#020c02] border border-[#39ff14]/20 rounded-3xl p-6">
                <h2 className="text-xl font-semibold text-[#39ff14] mb-4 flex items-center gap-2">
                  <BarChart3 size={22} /> User Status Overview
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={userStatusData} layout="vertical">
                    <CartesianGrid stroke="#0a1f0a" strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fill: '#39ff14' }} />
                    <YAxis dataKey="label" type="category" tick={{ fill: '#39ff14' }} width={90} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#39ff14" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

                <div className="mb-10 bg-[#020c02] border border-[#39ff14]/20 rounded-3xl p-6">
                  <h2 className="text-xl font-semibold text-[#39ff14] mb-4 flex items-center gap-2">
                    <MapPin size={22} /> Customer Locations
                  </h2>
                  {locationRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={locationRows} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                        <CartesianGrid stroke="#0a1f0a" strokeDasharray="3 3" />
                        <XAxis dataKey="location" tick={{ fill: '#39ff14' }} interval={0} angle={-20} textAnchor="end" height={70} />
                        <YAxis tick={{ fill: '#39ff14' }} allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="#39ff14" strokeWidth={3} dot={{ r: 4, fill: '#39ff14' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-sm text-[#1a7a1a] py-8 text-center">No customer locations available yet.</div>
                  )}
                </div>

            <div className="mb-10 bg-[#020c02] border border-[#39ff14]/20 rounded-3xl p-6">
              <h2 className="text-xl font-semibold text-[#39ff14] mb-4 flex items-center gap-2">
                <BarChart3 size={22} /> System Composition
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={systemMixData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={88}
                      outerRadius={130}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {systemMixData.map((entry, index) => (
                        <Cell key={`system-mix-${entry.name}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {systemMixData.map((item, index) => (
                    <div key={item.name} className="rounded-2xl border border-[#39ff14]/10 bg-[#041004] p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                        <div className="text-sm text-[#39ff14]">{item.name}</div>
                      </div>
                      <div className="text-3xl font-black text-white">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sales Trend Chart */}
              <div className="bg-[#020c02] border border-[#39ff14]/20 rounded-3xl p-6">
                <h2 className="text-xl font-semibold text-[#39ff14] mb-4 flex items-center gap-2">
                  <BarChart3 size={22} /> Sales Trend {currentYear}
                </h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={salesChartData}>
                    <CartesianGrid stroke="#0a1f0a" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: '#39ff14' }} />
                    <YAxis tick={{ fill: '#1a7a1a' }} />
                    <Tooltip />
                    <Bar dataKey="salesValue" fill="#39ff14" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Customer Feedback Section */}
            <div className="bg-[#020c02] border border-[#39ff14]/20 rounded-3xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-[#39ff14] flex items-center gap-2">
                  <MessageSquare size={22} /> Customer Feedback
                </h2>
                <div className="text-sm text-[#1a7a1a]">
                  {messages.length} messages • {unreadCount} unread
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase border-b border-[#39ff14]/10 text-left text-[#1a7a1a]">
                      <th className="pb-4">Customer</th>
                      <th className="pb-4">Subject</th>
                      <th className="pb-4">Status</th>
                      <th className="pb-4">Date</th>
                      <th className="pb-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#39ff14]/10">
                    {currentMessages.map((msg) => {
                      const isRead = msg.status.toLowerCase() === 'read';
                      return (
                        <tr key={msg.id} className="hover:bg-[#39ff14]/5">
                          <td className="py-4">
                            <div className="font-medium">{msg.full_name}</div>
                            <div className="text-xs text-[#1a7a1a]">{msg.email}</div>
                          </td>
                          <td className="py-4 text-[#39ff14]">{msg.subject}</td>
                          <td className="py-4">
                            <span className={`px-3 py-1 rounded-full text-xs ${isRead ? 'bg-[#39ff14]/10 text-[#1a7a1a]' : 'bg-amber-500/20 text-amber-400'}`}>
                              {isRead ? 'Read' : 'Unread'}
                            </span>
                          </td>
                          <td className="py-4 text-xs text-[#1a7a1a]">
                            {new Date(msg.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 text-right">
                            <button
                              onClick={() => openMessage(msg)}
                              className="mr-2 px-4 py-1.5 text-xs border border-[#39ff14]/30 rounded-xl hover:bg-[#39ff14]/10"
                            >
                              {isRead ? <Eye size={14} /> : <MailOpen size={14} />} {isRead ? 'View' : 'Read'}
                            </button>
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              className="px-4 py-1.5 text-xs border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/10"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setMessagePage(i + 1)}
                      className={`w-9 h-9 rounded-2xl ${messagePage === i + 1 ? 'bg-[#39ff14] text-black font-bold' : 'border border-[#39ff14]/30 hover:bg-[#39ff14]/10'}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#020c02] border border-[#39ff14]/30 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-[#39ff14]/20 flex justify-between items-center">
              <h3 className="text-xl font-bold text-[#39ff14]">{selectedMessage.subject}</h3>
              <button onClick={() => setSelectedMessage(null)} className="text-[#39ff14]">
                <X size={28} />
              </button>
            </div>
            <div className="p-8 overflow-auto max-h-[55vh] text-[#39ff14] leading-relaxed">
              {selectedMessage.message}
            </div>
            <div className="p-6 border-t border-[#39ff14]/20 flex gap-3 justify-end">
              <button
                onClick={() => deleteMessage(selectedMessage.id)}
                className="px-6 py-3 border border-red-500/50 text-red-400 rounded-2xl hover:bg-red-500/10"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedMessage(null)}
                className="px-8 py-3 border border-[#39ff14]/30 rounded-2xl hover:bg-[#39ff14]/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSystemReport && (
        <SystemReportDashboard onClose={() => setShowSystemReport(false)} />
      )}
    </div>
  );
};

export default SupervisorDashboard;