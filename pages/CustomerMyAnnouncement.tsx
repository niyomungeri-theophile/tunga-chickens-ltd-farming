import React, { useEffect, useState } from 'react';
import { db } from '../api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const CustomerMyAnnouncement: React.FC = () => {
  const [name, setName] = useState(localStorage.getItem('userName') || "");
  const [phone, setPhone] = useState(localStorage.getItem('userContact') || "");
  const [email, setEmail] = useState(localStorage.getItem('userEmail') || "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');

    const cachedName = String(localStorage.getItem('userName') || '').trim();
    const cachedPhone = String(localStorage.getItem('userContact') || '').trim();
    const cachedEmail = String(localStorage.getItem('userEmail') || '').trim();

    if (cachedName) setName(cachedName);
    if (cachedPhone) setPhone(cachedPhone);
    if (cachedEmail) setEmail(cachedEmail);

    const loadProfile = async () => {
      if (!token || !userId) {
        setProfileLoading(false);
        return;
      }

      try {
        const user = await db.getUser(userId);
        setName(String(user?.fullName || cachedName || '').trim());
        setPhone(String(user?.contact || cachedPhone || '').trim());
        setEmail(String(user?.email || cachedEmail || '').trim());
      } catch (error) {
        console.error('Failed to load current user profile for announcement form', error);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        alert("Please sign in to publish an announcement");
        return;
      }
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name, phone, email, message }),
      });
      if (!res.ok) throw new Error("Failed to publish announcement");
      setName("");
      setPhone("");
      setEmail("");
      setMessage("");
      alert("Announcement published successfully!");
    } catch (err) {
      alert("Failed to publish announcement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border)',
          borderRadius: 20,
          padding: 32,
          minWidth: 340,
          maxWidth: 420,
          color: 'var(--app-text)',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h2 style={{ fontWeight: 700, fontSize: 26, marginBottom: 12, color: 'var(--app-text)' }}>New Announcement</h2>
        <p style={{ marginTop: -4, color: 'var(--app-muted)', fontSize: 13 }}>
          {profileLoading ? 'Loading your profile...' : 'Your account details are filled automatically.'}
        </p>
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          required
          readOnly
          style={{ padding: 10, borderRadius: 8, border: '1px solid var(--app-border)', background: 'var(--app-surface-2)', color: 'var(--app-text)', cursor: 'not-allowed' }}
        />
        <input
          type="tel"
          placeholder="Phone Number"
          value={phone}
          required
          readOnly
          style={{ padding: 10, borderRadius: 8, border: '1px solid var(--app-border)', background: 'var(--app-surface-2)', color: 'var(--app-text)', cursor: 'not-allowed' }}
        />
        <input
          type="email"
          placeholder="Email Address"
          value={email}
          required
          readOnly
          style={{ padding: 10, borderRadius: 8, border: '1px solid var(--app-border)', background: 'var(--app-surface-2)', color: 'var(--app-text)', cursor: 'not-allowed' }}
        />
        <textarea
          placeholder="Write your announcement message..."
          value={message}
          onChange={e => setMessage(e.target.value)}
          required
          style={{ padding: 10, borderRadius: 8, border: '1px solid var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text)', minHeight: 80 }}
        />
        <button
          type="submit"
          disabled={loading || profileLoading || !name || !phone || !email}
          style={{
            marginTop: 8,
            padding: '12px 0',
            borderRadius: 8,
            background: 'var(--app-accent)',
            color: 'var(--app-accent-contrast)',
            fontWeight: 700,
            fontSize: 18,
            border: 'none',
            cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Publishing...' : 'Publish Announcement'}
        </button>
      </form>
    </div>
  );
};

export default CustomerMyAnnouncement;
