import React, { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const ANNOUNCEMENT_TTL_MS = 24 * 60 * 60 * 1000;

async function parseApiResponse(res: Response) {
  const text = await res.text();

  if (!text) {
    return {} as any;
  }

  const cleanText = text.replace(/^\uFEFF/, "");

  try {
    return JSON.parse(cleanText);
  } catch {
    // Recover when a proxy prepends junk bytes before valid JSON (observed as short gibberish prefixes).
    const firstJsonChar = cleanText.search(/[\[{]/);
    if (firstJsonChar > 0) {
      const candidate = cleanText.slice(firstJsonChar);
      try {
        return JSON.parse(candidate);
      } catch {
        // Fall through to user-friendly error.
      }
    }

    const contentType = res.headers.get("content-type") || "unknown";
    const normalized = cleanText.replace(/\s+/g, " ").trim();
    const printableSnippet = normalized
      .replace(/[^\x20-\x7E]/g, "")
      .slice(0, 120);

    // Some server/proxy failures return compressed or binary data; avoid exposing garbled text in UI.
    if (!printableSnippet) {
      throw new Error(
        `Unreadable server response (${res.status}, ${contentType}). Please restart frontend and backend servers.`
      );
    }

    throw new Error(
      `Server returned non-JSON response (${res.status}, ${contentType}): ${printableSnippet}`
    );
  }
}

interface Announcement {
  id: number;
  name: string;
  phone: string;
  email: string;
  message: string;
  created_at: string;
  user_id: string;
  user_role?: string;
}

interface AnnouncementsProps {
  userRole?: string;
  authToken?: string;
}

const Announcements: React.FC<AnnouncementsProps> = ({ userRole, authToken }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [formState, setFormState] = useState({
    name: "",
    phone: "",
    email: "",
    message: ""
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState({
    name: "",
    phone: "",
    email: "",
    message: ""
  });
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const token = authToken || localStorage.getItem("authToken") || "";
  const role = String(userRole || localStorage.getItem("userRole") || "public").toLowerCase();
  const currentUserId = String(localStorage.getItem("userId") || "");
  const isAdminLike = ["admin", "supervisor"].includes(role);
  const canPost = Boolean(token);

  const canManage = (announcement: Announcement) => {
    if (!token) return false;
    if (isAdminLike) return true;
    return Boolean(currentUserId && announcement.user_id === currentUserId);
  };

  const formatTimeLeft = (createdAt: string) => {
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return "Expires soon";
    const expiresAt = created.getTime() + ANNOUNCEMENT_TTL_MS;
    const diffMs = expiresAt - Date.now();
    if (diffMs <= 0) return "Expired";
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
    if (hours <= 0) return `${minutes}m left`;
    return `${hours}h ${minutes}m left`;
  };

  // Fetch announcements
  const fetchAnnouncements = async () => {
    try {
      setError("");
      const endpoint = `${API_BASE_URL}/announcements`;

      let res = await fetch(endpoint, { cache: "no-store" });
      let json: any;

      try {
        json = await parseApiResponse(res);
      } catch (firstParseError) {
        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        const isJsonLike = contentType.includes("application/json");

        if (!res.ok || !isJsonLike) {
          throw firstParseError;
        }

        // Retry once for transient proxy corruption while keeping UI responsive.
        res = await fetch(endpoint, { cache: "no-store" });
        json = await parseApiResponse(res);
      }

      if (!res.ok) throw new Error(json?.message || "Failed to fetch announcements");
      setAnnouncements(Array.isArray(json?.data) ? json.data : []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
    const interval = setInterval(fetchAnnouncements, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setActionError("");

    if (!token) {
      setFormError("Please sign in to post an announcement.");
      return;
    }

    const payload = {
      name: formState.name.trim(),
      phone: formState.phone.trim(),
      email: formState.email.trim(),
      message: formState.message.trim()
    };

    if (!payload.name || !payload.phone || !payload.email || !payload.message) {
      setFormError("All fields are required.");
      return;
    }

    setFormLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await parseApiResponse(res);
      if (!res.ok) throw new Error(data?.message || "Failed to post announcement");
      setFormState({ name: "", phone: "", email: "", message: "" });
      await fetchAnnouncements();
    } catch (err: any) {
      setFormError(err.message || "Failed to post announcement");
    } finally {
      setFormLoading(false);
    }
  };

  const startEdit = (announcement: Announcement) => {
    setActionError("");
    setEditingId(announcement.id);
    setEditState({
      name: announcement.name,
      phone: announcement.phone,
      email: announcement.email,
      message: announcement.message
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState({ name: "", phone: "", email: "", message: "" });
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    if (!token) {
      setActionError("Please sign in to update announcements.");
      return;
    }

    const payload = {
      name: editState.name.trim(),
      phone: editState.phone.trim(),
      email: editState.email.trim(),
      message: editState.message.trim()
    };

    if (!payload.name || !payload.phone || !payload.email || !payload.message) {
      setActionError("All fields are required.");
      return;
    }

    setActionLoadingId(editingId);
    try {
      const res = await fetch(`${API_BASE_URL}/announcements/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await parseApiResponse(res);
      if (!res.ok) throw new Error(data?.message || "Failed to update announcement");
      cancelEdit();
      await fetchAnnouncements();
    } catch (err: any) {
      setActionError(err.message || "Failed to update announcement");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) {
      setActionError("Please sign in to delete announcements.");
      return;
    }
    if (!confirm("Delete this announcement?")) return;

    setActionLoadingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/announcements/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await parseApiResponse(res);
      if (!res.ok) throw new Error(data?.message || "Failed to delete announcement");
      await fetchAnnouncements();
    } catch (err: any) {
      setActionError(err.message || "Failed to delete announcement");
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredAnnouncements = announcements.filter((announcement) => {
    const name = String(announcement.name || "").toLowerCase();
    const message = String(announcement.message || "").toLowerCase();
    const email = String(announcement.email || "").toLowerCase();
    const search = searchTerm.toLowerCase();
    return name.includes(search) || message.includes(search) || email.includes(search);
  });

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading announcements...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Hero Section */}
      <div style={styles.hero}>
        <h1 style={styles.heroTitle}>📢 Community Announcements</h1>
        <p style={styles.heroSubtitle}>
          Stay informed with the latest updates and news from our community
        </p>
        <p style={styles.heroNote}>Announcements expire after 24 hours.</p>
      </div>

      {/* Search Bar */}
      <div style={styles.searchContainer}>
        <input
          type="text"
          placeholder="🔍 Search announcements..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* Stats */}
      <div style={styles.statsBar}>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{announcements.length}</div>
          <div style={styles.statLabel}>Total Announcements</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{new Set(announcements.map((a) => a.user_id)).size}</div>
          <div style={styles.statLabel}>Contributors</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>
            {announcements.length > 0
              ? new Date(announcements[0].created_at).toLocaleDateString()
              : 'N/A'}
          </div>
          <div style={styles.statLabel}>Latest Update</div>
        </div>
      </div>

      {canPost ? (
        <form style={styles.composerCard} onSubmit={handleCreate}>
          <div style={styles.composerHeader}>
            <h2 style={styles.composerTitle}>Post an Announcement</h2>
            <span style={styles.expiryBadge}>24h visibility</span>
          </div>
          <div style={styles.composerFields}>
            <input
              type="text"
              placeholder="Your Name"
              value={formState.name}
              onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
              style={styles.formInput}
              required
            />
            <input
              type="tel"
              placeholder="Phone Number"
              value={formState.phone}
              onChange={(e) => setFormState((prev) => ({ ...prev, phone: e.target.value }))}
              style={styles.formInput}
              required
            />
            <input
              type="email"
              placeholder="Email Address"
              value={formState.email}
              onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
              style={styles.formInput}
              required
            />
            <textarea
              placeholder="Write your announcement message..."
              value={formState.message}
              onChange={(e) => setFormState((prev) => ({ ...prev, message: e.target.value }))}
              style={styles.formTextArea}
              required
            />
          </div>
          {formError && <div style={styles.formError}>{formError}</div>}
          <div style={styles.composerActions}>
            <button
              type="submit"
              style={{ ...styles.formButton, ...(formLoading ? styles.formButtonDisabled : {}) }}
              disabled={formLoading}
            >
              {formLoading ? "Publishing..." : "Publish Announcement"}
            </button>
          </div>
        </form>
      ) : (
        <div style={styles.notice}>Sign in to post an announcement.</div>
      )}

      {/* Error Message */}
      {error && <div style={styles.errorMessage}>{error}</div>}
      {actionError && <div style={styles.errorMessage}>{actionError}</div>}

      {/* Announcements List */}
      {filteredAnnouncements.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📭</div>
          <h3>No announcements yet</h3>
          <p>Check back later for updates!</p>
        </div>
      ) : (
        <div style={styles.announcementsGrid}>
          {filteredAnnouncements.map((announcement) => {
            const isEditing = editingId === announcement.id;
            const canEdit = canManage(announcement);
            const isBusy = actionLoadingId === announcement.id;

            return (
              <div key={announcement.id} style={styles.card} className="announcement-card">
                <div style={styles.cardHeader}>
                  <div style={styles.userInfo}>
                    <div style={styles.avatar}>
                      {announcement.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 style={styles.userName}>{announcement.name}</h3>
                      <p style={styles.userEmail}>{announcement.email}</p>
                    </div>
                  </div>
                  <div style={styles.dateBadge}>
                    {new Date(announcement.created_at).toLocaleDateString()}
                  </div>
                </div>

                {isEditing ? (
                  <div style={styles.editFields}>
                    <input
                      type="text"
                      value={editState.name}
                      onChange={(e) => setEditState((prev) => ({ ...prev, name: e.target.value }))}
                      style={styles.formInput}
                      required
                    />
                    <input
                      type="tel"
                      value={editState.phone}
                      onChange={(e) => setEditState((prev) => ({ ...prev, phone: e.target.value }))}
                      style={styles.formInput}
                      required
                    />
                    <input
                      type="email"
                      value={editState.email}
                      onChange={(e) => setEditState((prev) => ({ ...prev, email: e.target.value }))}
                      style={styles.formInput}
                      required
                    />
                    <textarea
                      value={editState.message}
                      onChange={(e) => setEditState((prev) => ({ ...prev, message: e.target.value }))}
                      style={styles.formTextArea}
                      required
                    />
                  </div>
                ) : (
                  <div style={styles.cardBody}>
                    <p style={styles.message}>{announcement.message}</p>
                  </div>
                )}

                <div style={styles.cardFooter}>
                  <div style={styles.footerRow}>
                    <span style={styles.phone}>📞 {announcement.phone}</span>
                    <span style={styles.expiryBadge}>{formatTimeLeft(announcement.created_at)}</span>
                  </div>

                  {canEdit && (
                    <div style={styles.actionsRow}>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            style={{ ...styles.actionButton, ...styles.actionButtonPrimary }}
                            onClick={handleUpdate}
                            disabled={isBusy}
                          >
                            {isBusy ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            style={styles.actionButton}
                            onClick={cancelEdit}
                            disabled={isBusy}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            style={styles.actionButton}
                            onClick={() => startEdit(announcement)}
                            disabled={isBusy}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            style={{ ...styles.actionButton, ...styles.actionButtonDanger }}
                            onClick={() => handleDelete(announcement.id)}
                            disabled={isBusy}
                          >
                            {isBusy ? "Deleting..." : "Delete"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '40px 24px',
    backgroundColor: 'var(--app-bg)',
    minHeight: '100vh',
  },
  hero: {
    textAlign: 'center' as const,
    marginBottom: 48,
  },
  heroTitle: {
    fontSize: 48,
    fontWeight: 800,
    background: 'linear-gradient(135deg, var(--app-accent) 0%, #0ea5e9 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 18,
    color: 'var(--app-muted)',
  },
  heroNote: {
    fontSize: 13,
    color: 'var(--app-muted)',
    marginTop: 6,
  },
  searchContainer: {
    marginBottom: 32,
  },
  searchInput: {
    width: '100%',
    maxWidth: 500,
    margin: '0 auto',
    display: 'block',
    padding: '14px 24px',
    border: '1px solid var(--app-border)',
    borderRadius: 50,
    fontSize: 16,
    outline: 'none',
    backgroundColor: 'var(--app-surface)',
    color: 'var(--app-text)',
  },
  statsBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 48,
    flexWrap: 'wrap' as const,
  },
  composerCard: {
    backgroundColor: 'var(--app-surface)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 32,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  composerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
    flexWrap: 'wrap' as const,
  },
  composerTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--app-text)',
  },
  composerFields: {
    display: 'grid',
    gap: 12,
  },
  formInput: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--app-border)',
    fontSize: 14,
    outline: 'none',
    backgroundColor: 'var(--app-surface)',
    color: 'var(--app-text)',
  },
  formTextArea: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--app-border)',
    fontSize: 14,
    minHeight: 110,
    resize: 'vertical' as const,
    outline: 'none',
    backgroundColor: 'var(--app-surface)',
    color: 'var(--app-text)',
  },
  composerActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  formButton: {
    padding: '12px 18px',
    borderRadius: 10,
    backgroundColor: 'var(--app-accent)',
    color: 'var(--app-accent-contrast)',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  },
  formButtonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  formError: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    padding: '10px 12px',
    borderRadius: 8,
    marginTop: 12,
    fontSize: 13,
  },
  notice: {
    backgroundColor: 'var(--app-surface-2)',
    color: 'var(--app-muted)',
    padding: '12px 16px',
    borderRadius: 10,
    marginBottom: 24,
    textAlign: 'center' as const,
  },
  statCard: {
    backgroundColor: 'var(--app-surface)',
    borderRadius: 12,
    padding: '20px 32px',
    textAlign: 'center' as const,
    minWidth: 150,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  statNumber: {
    fontSize: 36,
    fontWeight: 700,
    color: 'var(--app-accent)',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: 'var(--app-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  announcementsGrid: {
    display: 'grid',
    gap: 24,
  },
  card: {
    backgroundColor: 'var(--app-surface)',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottom: '1px solid var(--app-border)',
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  userInfo: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    backgroundColor: 'var(--app-accent)',
    color: 'var(--app-accent-contrast)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 600,
  },
  userName: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--app-text)',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: 'var(--app-muted)',
  },
  dateBadge: {
    fontSize: 12,
    color: 'var(--app-muted)',
    backgroundColor: 'var(--app-surface-2)',
    padding: '4px 12px',
    borderRadius: 20,
  },
  cardBody: {
    marginBottom: 16,
  },
  editFields: {
    display: 'grid',
    gap: 12,
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    lineHeight: 1.6,
    color: 'var(--app-text)',
  },
  cardFooter: {
    paddingTop: 16,
    borderTop: '1px solid var(--app-border)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  footerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  phone: {
    fontSize: 14,
    color: 'var(--app-muted)',
  },
  expiryBadge: {
    fontSize: 12,
    color: 'var(--app-accent-strong)',
    backgroundColor: 'var(--app-accent-soft)',
    padding: '4px 10px',
    borderRadius: 999,
  },
  actionsRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  actionButton: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--app-border)',
    backgroundColor: 'var(--app-surface)',
    color: 'var(--app-text)',
    fontSize: 13,
    cursor: 'pointer',
  },
  actionButtonPrimary: {
    backgroundColor: 'var(--app-accent)',
    color: 'var(--app-accent-contrast)',
    border: 'none',
  },
  actionButtonDanger: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: 'var(--app-bg)',
  },
  spinner: {
    width: 48,
    height: 48,
    border: '4px solid var(--app-border)',
    borderTopColor: 'var(--app-accent)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorMessage: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    padding: '12px',
    borderRadius: 8,
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: 64,
    backgroundColor: 'var(--app-surface)',
    borderRadius: 16,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
};

// Add animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .announcement-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0,0,0,0.1);
  }
`;
document.head.appendChild(styleSheet);

export default Announcements;