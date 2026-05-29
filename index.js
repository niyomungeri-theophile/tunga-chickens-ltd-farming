
// MySQL API-based authentication and data fetching for HTML pages
const API_BASE_URL = '/api';

// Get auth token from localStorage
function getAuthToken() {
    return localStorage.getItem('authToken');
}

// API call helper
async function apiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    
    const token = getAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    const text = await response.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch (e) {
        return {};
    }
}

// 1. Auth Guard and RBAC Logic
async function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = "login.html";
        return;
    }
    
    try {
        const result = await apiCall('/auth/verify');
        if (result.success) {
            const role = localStorage.getItem('userRole') || 'farmer';
            const name = localStorage.getItem('userName') || 'User';
            applyRBAC(role, name);
            initTelemetry();
        } else {
            localStorage.clear();
            window.location.href = "login.html";
        }
    } catch (err) {
        console.error("Auth check failed:", err);
        localStorage.clear();
        window.location.href = "login.html";
    }
}

checkAuth();

function applyRBAC(role, name) {
    // Show/Hide sections based on roles
    const financeSection = document.getElementById('finance-section');
    const financeNavLink = document.querySelector('nav a[href="#/financials"]');
    
    // Farmer: No finance access
    if (role === 'farmer') {
        if (financeSection) financeSection.classList.add('hidden');
        if (financeNavLink) financeNavLink.classList.add('hidden');
    }
    
    // Supervisor: View only (disable write buttons if they exist in HTML)
    if (role === 'supervisor') {
        document.querySelectorAll('.admin-only').forEach(btn => btn.classList.add('hidden'));
    }

    // Update Welcome Text
    const header = document.querySelector('h2');
    if (header) header.textContent = `Welcome, ${name}`;
}

async function initTelemetry() {
    // Fetch sensor data using REST API
    async function fetchData() {
        try {
            const data = await apiCall('/sensors');
            if (data) {
                updateDashboardUI(data);
            }
        } catch (err) {
            console.error("Error fetching telemetry:", err);
        }
    }
    
    // Initial fetch
    await fetchData();
    
    // Poll every 5 seconds for updates
    setInterval(fetchData, 5000);
}

function updateDashboardUI(data) {
    // Implementation of telemetry updates (Temp, Hum, etc.)
    // Matches the Logic from your FarmerDashboard components
    const elTemp = document.getElementById('val-temp');
    if(elTemp && data.sensors) elTemp.textContent = `${data.sensors.temperature.toFixed(1)}°C`;
    
    // ... rest of telemetry logic
}

// Logout function
async function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

// Global Exports for HTML onclick events
window.logout = logout;
