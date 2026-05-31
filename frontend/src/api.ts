
interface ApiResponse {
  success?: boolean;
  message?: string;
  token?: string;
  user?: any;
  users?: any[];
  data?: any;
  [key: string]: any; // allows any other properties
}
// API Client for MySQL Backend
import { parseApiResponse } from './utils/parseApiResponse';
// Replaces Firebase SDK

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Auth state management
let authToken: string | null | undefined = localStorage.getItem('authToken');
let currentUser: any = null;
let authStateListeners: ((user: any) => void)[] = [];

// Helper function for API calls
// AFTER
export async function apiCall(endpoint: string, options: RequestInit = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let data: ApiResponse = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = {};
  }

  if (!response.ok) {
    throw { code: `api/${response.status}`, message: data.message || 'API Error' };
  }

  return data;
}

// Auth functions
export const auth = {
  currentUser: null as any,
  
  async signInWithEmailAndPassword(email: string, password: string) {
    const result = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    if (result.success) {
      authToken = result.token;
      if(result.token){localStorage.setItem('authToken', result.token)};
      currentUser = result.user;
      this.currentUser = result.user;
      notifyAuthStateListeners(result.user);

      if (result.user) {
        if (result.user.role) {
          localStorage.setItem('userRole', String(result.user.role));
        }
        if (result.user.fullName) {
          localStorage.setItem('userName', String(result.user.fullName));
        }
        if (result.user.photoURL !== undefined) {
          localStorage.setItem('userPhoto', String(result.user.photoURL || ''));
        }
        if (result.user.uid) {
          localStorage.setItem('userId', String(result.user.uid));
        }
        if (result.user.canSell !== undefined) {
          localStorage.setItem('canSell', result.user.canSell ? 'true' : 'false');
        }
        if (result.user.sellerOtp !== undefined) {
          localStorage.setItem('sellerOtp', String(result.user.sellerOtp || ''));
        }
        if (result.user.sellerOtpExpiresAt !== undefined) {
          localStorage.setItem('sellerOtpExpiresAt', String(result.user.sellerOtpExpiresAt || ''));
        }
      }

      // Cache farmer serial so "Forgot password" can prefill it on the same browser.
      const role = String(result.user?.role || '').toLowerCase();
      if (role === 'farmer') {
        localStorage.setItem('lastLoginEmail', String(result.user?.email || email || '').trim().toLowerCase());
        if (result.user?.deviceSerialNumber) {
          localStorage.setItem('lastDeviceSerialNumber', String(result.user.deviceSerialNumber));
        }
      }
    }
    
    return result;
  },
  
  async createUserWithEmailAndPassword(email: string, password: string, userData: any) {
    const result = await apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...userData })
    });
    
    return result;
  },

  async requestPasswordReset(email: string) {
    return await apiCall('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async verifyAdminPassword(password: string) {
    return await apiCall('/auth/verify-admin-password', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  },

  async confirmPasswordReset(payload: { email: string; code?: string; deviceSerial?: string; newPassword: string }) {
    return await apiCall('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
    return await apiCall('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });
  },

  async getCurrentUser() {
    try {
      const result = await apiCall('/auth/me');
      return result?.success ? result.user : null;
    } catch (error) {
      return null;
    }
  },
  
  async signOut() {
    try {
      if (authToken) {
        await apiCall('/auth/logout', { method: 'POST' });
      }
    } catch (error) {
      console.error('Logout API error:', error);
    }

    authToken = null;
    currentUser = null;
    this.currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userPhoto');
    localStorage.removeItem('canSell');
    localStorage.removeItem('sellerOtp');
    localStorage.removeItem('sellerOtpExpiresAt');
    notifyAuthStateListeners(null);
  },
  
  onAuthStateChanged(callback: (user: any) => void) {
    authStateListeners.push(callback);
    
    // Check if we have a stored token and verify it
    if (authToken) {
      apiCall('/auth/verify')
        .then((result) => {
          if (result.success) {
            currentUser = result.user;
            this.currentUser = result.user;
            callback(result.user);
          } else {
            this.signOut();
            callback(null);
          }
        })
        .catch(() => {
          this.signOut();
          callback(null);
        });
    } else {
      callback(null);
    }
    
    // Return unsubscribe function
    return () => {
      authStateListeners = authStateListeners.filter(l => l !== callback);
    };
  }
};

function notifyAuthStateListeners(user: any) {
  authStateListeners.forEach(listener => listener(user));
}

// Database functions (REST API equivalent)
export const db = {
  // Users
  async getUser(uid: string) {
    return await apiCall(`/users/${uid}`);
  },
  
  async getAllUsers() {
    return await apiCall('/users');
  },
  
  async deleteUser(uid: string) {
    return await apiCall(`/users/${uid}`, { method: 'DELETE' });
  },

  async getAuthSessionStats() {
    return await apiCall('/auth/session-stats');
  },
  
  async updateUser(uid: string, data: any) {
    return await apiCall(`/users/${uid}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async resetUserPassword(uid: string, newPassword: string) {
    return await apiCall(`/users/${uid}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword })
    });
  },

  async reactivateSellerSubscription(uid: string) {
    return await apiCall(`/users/${uid}/reactivate-seller`, {
      method: 'PUT',
      body: JSON.stringify({})
    });
  },

  async submitSellerApplication(payload: {
    fullName: string;
    email: string;
    contact: string;
    location?: string;
    farmSize?: string;
    reason?: string;
  }) {
    return await apiCall('/seller-applications', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async submitSellerApplicationWithProof(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/seller-applications`, {
      method: 'POST',
      body: formData
    });

    const data = await parseApiResponse(response);
    if (!response.ok) {
      throw { code: `api/${response.status}`, message: data?.message || 'API Error' };
    }

    return data;
  },

  async getSellerApplications(status?: string) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return await apiCall(`/seller-applications${query}`);
  },

  async approveSellerApplication(id: string) {
    return await apiCall(`/seller-applications/${id}/approve`, { method: 'PUT' });
  },

  async rejectSellerApplication(id: string) {
    return await apiCall(`/seller-applications/${id}/reject`, { method: 'PUT' });
  },

  async deleteSellerApplication(id: string) {
    return await apiCall(`/seller-applications/${id}`, {
      method: 'DELETE'
    });
  },

  // Fetch aggregated sensor data for a date range
  async getSensorDataForRange(start: string, end: string, userId?: string) {
    let url = `/sensors/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    if (userId) url += `&userId=${encodeURIComponent(userId)}`;
    return await apiCall(url);
  },
  
  // Sensors
  async getSensorData() {
    return await apiCall('/sensors');
  },

  async getMyDevice() {
    return await apiCall('/devices/my-device');
  },
  
  async updateSensorData(data: any) {
    return await apiCall('/sensors/update', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  
  async getPowerCost() {
    const result = await apiCall('/sensors/power/cost');
    return result.cost_RWF || 0;
  },

  async getPowerCostForUser(userId: string) {
    const result = await apiCall(`/sensors/power/cost?userId=${encodeURIComponent(userId)}`);
    return result.cost_RWF || 0;
  },

  async getProducts() {
    return await apiCall('/products');
  },

  async getAnnouncements() {
    return await apiCall('/announcements');
  },
  
  // Transactions
  async getTransactions() {
    return await apiCall('/transactions');
  },
  
  async addTransaction(data: any) {
    return await apiCall('/transactions', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  
  async deleteTransaction(id: string) {
    return await apiCall(`/transactions/${id}`, { method: 'DELETE' });
  },
  
  async updateTransaction(id: string, data: any) {
    return await apiCall(`/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  
  // Incubators
  async getIncubators() {
    return await apiCall('/incubators');
  },
  
  async addIncubator(data: any) {
    return await apiCall('/incubators', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  
  async deleteIncubator(id: string) {
    return await apiCall(`/incubators/${id}`, { method: 'DELETE' });
  },
  
  async updateIncubator(id: string, data: any) {
    return await apiCall(`/incubators/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  // Admin: per-user data views (admin passes userId to scope queries)
  async getSensorDataForUser(userId: string) {
    return await apiCall(`/sensors?userId=${encodeURIComponent(userId)}`);
  },
  async getTransactionsForUser(userId: string) {
    return await apiCall(`/transactions?userId=${encodeURIComponent(userId)}`);
  },
  async getIncubatorsForUser(userId: string) {
    return await apiCall(`/incubators?userId=${encodeURIComponent(userId)}`);
  },
  async getContractsForUser(userId: string) {
    return await apiCall(`/contracts?userId=${encodeURIComponent(userId)}`);
  },

  // Contact Messages
  async addContactMessage(data: any) {
    return await apiCall('/contact-messages', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getContactMessages() {
    return await apiCall('/contact-messages');
  },

  async markContactMessageAsRead(id: string) {
    return await apiCall(`/contact-messages/${id}/read`, {
      method: 'PUT'
    });
  },

  async deleteContactMessage(id: string) {
    return await apiCall(`/contact-messages/${id}`, {
      method: 'DELETE'
    });
  },

  async getHeroMedia() {
    return await apiCall('/hero-media');
  },

  async addHeroMedia(data: any) {
    return await apiCall('/hero-media', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateHeroMediaOrder(id: string, displayOrder: number) {
    return await apiCall(`/hero-media/${id}/order`, {
      method: 'PUT',
      body: JSON.stringify({ displayOrder })
    });
  },

  async deleteHeroMedia(id: string) {
    return await apiCall(`/hero-media/${id}`, {
      method: 'DELETE'
    });
  },

  async getTeamMembers() {
    return await apiCall('/team-members');
  },

  async addTeamMember(formData: FormData) {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/team-members`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await parseApiResponse(response);
    if (!response.ok) {
      throw { code: `api/${response.status}`, message: data?.message || 'API Error' };
    }

    return data;
  },

  async updateTeamMemberOrder(id: string, displayOrder: number) {
    return await apiCall(`/team-members/${id}/order`, {
      method: 'PUT',
      body: JSON.stringify({ displayOrder })
    });
  },

  async deleteTeamMember(id: string) {
    return await apiCall(`/team-members/${id}`, {
      method: 'DELETE'
    });
  },

  // Contracts
  async getContracts() {
    return await apiCall('/contracts');
  },

  async getContract(id: string) {
    return await apiCall(`/contracts/${id}`);
  },

  async createContract(data: any) {
    return await apiCall('/contracts', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateContract(id: string, data: any) {
    return await apiCall(`/contracts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteContract(id: string) {
    return await apiCall(`/contracts/${id}`, { method: 'DELETE' });
  },

  async activateContract(id: string) {
    return await apiCall(`/contracts/${id}/activate`, { method: 'POST' });
  },

  async sendPredictionAlertEmail(data: any) {
    return await apiCall('/notifications/prediction-alert', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // ML Predictions (Random Forest / Chickhelf.pkl)
  async predictChickHealth(payload: {
    mode?: 'realtime' | 'historical';
    features?: any;
    rows?: any[];
    startDate?: string;
    endDate?: string;
    userId?: string;
  }) {
    return await apiCall('/predictions/predict', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Farmer helper: Feed & Water recommendation (rule-based)
  async recommendFeedWater(payload: { chickType: 'broiler' | 'layer' | 'dual-purpose' | 'local'; ageMonths: number; flockSize?: number; specificType?: string }) {
    return await apiCall('/recommendations/feed-water', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Feeding logs (MySQL)
  async getFeedingLogs(limit: number = 50, userId?: string) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (userId) query.set('userId', userId);
    return await apiCall(`/feed-logs?${query.toString()}`);
  },

  async addFeedingLog(payload: {
    chickCategory?: string;
    chickSpecificType?: string;
    ageMonths?: number;
    flockSize?: number;
    feedType: string;
    quantityKg: number;
    // Timestamp is recorded automatically on the server.
    fedAt?: string;
    userId?: string;
  }, userId?: string) {
    return await apiCall('/feed-logs', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userId: userId || payload.userId })
    });
  },

  async updateFeedingLog(id: string, payload: {
    chickCategory?: string;
    chickSpecificType?: string;
    ageMonths?: number;
    flockSize?: number;
    feedType?: string;
    quantityKg?: number;
  }, userId?: string) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return await apiCall(`/feed-logs/${encodeURIComponent(id)}${query}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  async deleteFeedingLog(id: string, userId?: string) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return await apiCall(`/feed-logs/${encodeURIComponent(id)}${query}`, { method: 'DELETE' });
  }
};

// Data subscription (polling-based for real-time updates)
export function subscribeToData(path: string, callback: (data: any) => void, interval: number = 5000) {
  let active = true;
  
  const fetchData = async () => {
    if (!active) return;
    
    try {
      let data;
      if (path.startsWith('/sensors')) {
        data = await apiCall(path);
      } else {
      switch (path) {
        case '/':
        case '/sensors':
          data = await db.getSensorData();
          break;
        case 'transactions':
          data = await db.getTransactions();
          break;
        case 'users':
          data = await db.getAllUsers();
          break;
        case 'power/cost_RWF':
          data = await db.getPowerCost();
          break;
        case 'contact-messages':
          data = await db.getContactMessages();
          break;
        case 'hero-media':
          data = await db.getHeroMedia();
          break;
        default:
          data = await apiCall(path);
      }
      }
      callback(data);
    } catch (error) {
      const message = String((error as any)?.message || '');
      const code = String((error as any)?.code || '');
      const normalized = message.toLowerCase();
      if (code === 'api/403' && (normalized.includes('inactive') || normalized.includes('locked'))) {
        callback({ locked: true, message });
        return;
      }
      console.error('Error fetching data:', error);
      callback(null);
    }
    
    if (active) {
      setTimeout(fetchData, interval);
    }
  };
  
  fetchData();
  
  // Return unsubscribe function
  return () => {
    active = false;
  };
}

export { authToken };
