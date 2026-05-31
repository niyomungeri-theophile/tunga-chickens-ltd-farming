import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HardDrive, Users, Search, Trash2, Link2, Unlink2,
  Loader2, ChevronDown, CheckCircle, AlertCircle, Clock
} from 'lucide-react';
import { db } from '../api';
import { parseApiResponse } from '../utils/parseApiResponse';

interface Device {
  id: number;
  device_serial: string;
  esp32_chip_id: string;
  device_name: string;
  status: string;
  first_seen: string;
  last_seen: string;
  linked_at?: string;
}

interface DeviceWithUser extends Device {
  user_id?: string;
  full_name?: string;
  email?: string;
}

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000;

const formatTimestamp = (value?: string) => {
  if (!value) return 'Never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Never' : parsed.toLocaleString('en-GB');
};

const isDeviceOnline = (value?: string) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && (Date.now() - parsed.getTime() <= ONLINE_THRESHOLD_MS);
};

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  deviceSerialNumber?: string;
}

const toUserArray = (value: any): User[] => {
  if (Array.isArray(value)) {
    return value
      .map((user: any, index: number) => ({
        id: String(user.id || user.uid || index),
        fullName: String(user.fullName || user.full_name || ''),
        email: String(user.email || ''),
        role: String(user.role || '').trim().toLowerCase(),
        deviceSerialNumber: user.deviceSerialNumber || user.device_serial_number || undefined
      }))
      .filter((user) => Boolean(user.id));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([id, userInfo]: [string, any]) => ({
      id,
      fullName: String(userInfo?.fullName || userInfo?.full_name || ''),
      email: String(userInfo?.email || ''),
      role: String(userInfo?.role || '').trim().toLowerCase(),
      deviceSerialNumber: userInfo?.deviceSerialNumber || userInfo?.device_serial_number || undefined
    }));
  }

  return [];
};

const AdminDeviceManagement: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'unassigned'>('all');
  const [devices, setDevices] = useState<DeviceWithUser[]>([]);
  const [unassignedDevices, setUnassignedDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsersMap, setSelectedUsersMap] = useState<Record<string, string>>({});
  const [assigningDevice, setAssigningDevice] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningSerialCandidate, setAssigningSerialCandidate] = useState<string | null>(null);
  const [assignTargetUser, setAssignTargetUser] = useState<string | null>(null);

  const currentRole = String(localStorage.getItem('userRole') || '').toLowerCase();

  // Check if user is admin
  useEffect(() => {
    if (!['admin', 'supervisor'].includes(currentRole)) {
      navigate('/');
    }
  }, [currentRole, navigate]);


  console.log('users serials:', users.map(u => u.deviceSerialNumber));
  console.log('device serials:', devices.map(d => d.device_serial));
  // Fetch all devices
  const fetchAllDevices = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/devices/admin/all`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await parseApiResponse(response);
        setDevices(data.devices || []);
      } else {
        setMessage({ type: 'error', text: 'Failed to fetch devices' });
      }
    } catch (error) {
      console.error('Fetch devices error:', error);
      setMessage({ type: 'error', text: 'Error fetching devices' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch unassigned devices
  const fetchUnassignedDevices = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/devices/admin/unassigned`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await parseApiResponse(response);
        setUnassignedDevices(data.devices || []);
      } else {
        setMessage({ type: 'error', text: 'Failed to fetch unassigned devices' });
      }
    } catch (error) {
      console.error('Fetch unassigned devices error:', error);
      setMessage({ type: 'error', text: 'Error fetching unassigned devices' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all users
  const fetchAllUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await parseApiResponse(response);
        const userArray = toUserArray(data.users ?? data.data ?? data);

        // Filter to only farmers, case-insensitive and whitespace-safe
        setUsers(userArray.filter((u) => String(u.role || '').trim().toLowerCase() === 'farmer'));
      } else {
        setMessage({ type: 'error', text: 'Failed to fetch users' });
      }
    } catch (error) {
      console.error('Fetch users error:', error);
      setMessage({ type: 'error', text: 'Error fetching users' });
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    fetchAllDevices();
    fetchUnassignedDevices();
    fetchAllUsers();

    // Refresh every 10 seconds
    const interval = setInterval(() => {
      fetchAllDevices();
      fetchUnassignedDevices();
      fetchAllUsers()
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchAllDevices, fetchUnassignedDevices]);

  // Load saved per-device selected users from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('deviceSelectedUsers');
      if (raw) setSelectedUsersMap(JSON.parse(raw));
    } catch (e) {
      // ignore
    }
  }, []);

  const setDeviceSelectedUser = (deviceSerial: string, userId: string) => {
    setSelectedUsersMap(prev => {
      const next = { ...prev, [deviceSerial]: userId };
      try { localStorage.setItem('deviceSelectedUsers', JSON.stringify(next)); } catch (e) { }
      return next;
    });
  };

  const clearDeviceSelectedUser = (deviceSerial: string) => {
    setSelectedUsersMap(prev => {
      const next = { ...prev };
      delete next[deviceSerial];
      try { localStorage.setItem('deviceSelectedUsers', JSON.stringify(next)); } catch (e) { }
      return next;
    });
  };

  // Assign device to user
  const handleAssignDevice = async (deviceSerial: string, userId?: string) => {
    const uid = (userId || selectedUsersMap[deviceSerial] || '').trim();
    if (!deviceSerial || !uid) {
      setMessage({ type: 'error', text: 'Please select both device and user' });
      return;
    }

    setAssigningDevice(deviceSerial);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/devices/admin/assign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ device_serial: deviceSerial, user_id: uid })
      });

      const data = await parseApiResponse(response);
      if (response.ok && data.success) {
        setMessage({ type: 'success', text: `Device assigned to ${data.device.user_name}` });
        clearDeviceSelectedUser(deviceSerial);
        await fetchAllDevices();
        await fetchUnassignedDevices();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to assign device' });
      }
    } catch (error) {
      console.error('Assign device error:', error);
      setMessage({ type: 'error', text: 'Error assigning device' });
    } finally {
      setAssigningDevice(null);
    }
  };

  // Unassign device from user
  const handleUnassignDevice = async (deviceSerial: string) => {
    if (!window.confirm('Are you sure you want to unassign this device?')) return;

    setAssigningDevice(deviceSerial);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/devices/admin/unassign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ device_serial: deviceSerial })
      });

      const data = await parseApiResponse(response);
      if (response.ok && data.success) {
        setMessage({ type: 'success', text: 'Device unassigned successfully' });
        clearDeviceSelectedUser(deviceSerial);
        await fetchAllDevices();
        await fetchUnassignedDevices();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to unassign device' });
      }
    } catch (error) {
      console.error('Unassign device error:', error);
      setMessage({ type: 'error', text: 'Error unassigning device' });
    } finally {
      setAssigningDevice(null);
    }
  };

  // Simplified status: show only Linked (when assigned) or Unassigned
  const getStatusBadge = (device: DeviceWithUser | Device) => {
    const isLinked = Boolean((device as DeviceWithUser).user_id || (device as any).full_name || (device as Device).status === 'linked');
    if (isLinked) {
      return (
        <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-800 rounded-full text-sm font-medium">
          <Link2 className="w-4 h-4 text-blue-600" />
          Linked
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm font-medium">
        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
        Unassigned
      </span>
    );
  };

  const filteredDevices = devices.filter(d =>
    d.device_serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUnassigned = unassignedDevices.filter(d =>
    d.device_serial.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const unassignedFarmers = users.filter((user) => {
    const serial = String(user.deviceSerialNumber || '').trim();
    if (!serial) return true;
    return !devices.some((device) => String(device.device_serial || '').trim() === serial);
  }).filter((user) => {
    const haystack = [user.fullName, user.email, user.deviceSerialNumber].join(' ').toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  const farmerDeviceRows = users.map((user) => {
    const serial = String(user.deviceSerialNumber || '').trim();
    const device = devices.find((item) => String(item.device_serial || '').trim() === serial);
    const isLinked = Boolean(device?.user_id || device?.full_name || device?.status === 'linked');

    return {
      ...user,
      serial,
      device,
      isLinked,
      chipId: device?.esp32_chip_id || ''
    };
  });

  const filteredFarmerRows = farmerDeviceRows.filter((row) => {
    const haystack = [row.fullName, row.email, row.serial, row.chipId].join(' ').toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  const unassignedFarmerRows = farmerDeviceRows.filter((row) => !row.isLinked).filter((row) => {
    const haystack = [row.fullName, row.email, row.serial, row.chipId].join(' ').toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  const canAssignRow = (row: { serial: string; chipId: string }) => Boolean(row.serial && row.chipId);

  const getAvailableUsers = () => {
    const linkedUserIds = new Set(
      devices
        .map(d => d.user_id)
        .filter((id): id is string => Boolean(id))
    );

    return users.filter(u => !linkedUserIds.has(u.id));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <HardDrive className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Device Management</h1>
          </div>
          <p className="text-black">Manage and assign devices to farmer accounts</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 border border-blue-100">
            <Users className="w-4 h-4" />
            Farmer accounts detected: {users.length}
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
            <span className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>{message.text}</span>
          </div>
        )}

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-6 py-2 rounded-lg font-medium transition ${activeTab === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            All Devices ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('unassigned')}
            className={`px-6 py-2 rounded-lg font-medium transition ${activeTab === 'unassigned' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            Unassigned ({unassignedFarmerRows.length})
          </button>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by serial, name, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {loading && <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" /></div>}

        {activeTab === 'all' && !loading && (
          <div className="space-y-4">
            {filteredFarmerRows.length === 0 ? (
              <div className="bg-white rounded-lg p-8 text-center">
                <HardDrive className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-700">No farmer accounts found</p>
                <p className="text-sm text-gray-500 mt-2">Farmer accounts in database: {users.length}</p>
              </div>
            ) : (
              filteredFarmerRows.map((row) => (
                <div key={row.id} className="bg-white rounded-lg p-6 border border-gray-200 hover:shadow-lg transition">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-2 items-start mb-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Serial Number</p>
                      <p className="font-mono font-bold text-gray-900 text-lg">{row.serial || 'Not assigned'}</p>
                      <div className="mt-3">
                        <button
                          onClick={() => {
                            if (!canAssignRow(row)) {
                              setMessage({ type: 'error', text: 'Chip ID must be detected before assigning a user' });
                              return;
                            }
                            setAssigningSerialCandidate(row.serial);
                            setAssignModalOpen(true);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-md shadow-sm hover:bg-blue-100"
                          disabled={!canAssignRow(row)}
                        >
                          <Link2 className="w-4 h-4" />
                          Assign
                        </button>
                        {!row.chipId && (
                          <p className="mt-2 text-xs text-amber-700">Wait for the device to request a Chip ID first.</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-gray-600 mb-1">Status</p>
                      <div className="mt-2 space-y-2">
                        {row.isLinked ? (
                          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${isDeviceOnline(row.device?.last_seen) ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-800'}`}>
                            <span className={`w-2 h-2 rounded-full inline-block ${isDeviceOnline(row.device?.last_seen) ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`} />
                            {isDeviceOnline(row.device?.last_seen) ? 'Online' : 'Linked'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm font-medium">
                            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                            Unassigned
                          </span>
                        )}
                        <p className="text-xs text-gray-500">
                          Last push: {formatTimestamp(row.device?.last_seen)}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-gray-600 mb-1">First Seen</p>
                      <p className="text-sm text-gray-700">
                        {row.device?.linked_at ? new Date(row.device.linked_at).toLocaleDateString('en-GB') : '—'}
                      </p>

                    </div>




                    <div>
                      <p className="text-sm text-gray-600 mb-1">Last Seen</p>
                      <p className="text-sm text-gray-700">{row.device?.last_seen ? formatTimestamp(row.device?.last_seen) : 'no data provided'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Linked User</p>
                      <p className="text-sm text-green-500">{row.fullName ? `${row.fullName} ---> ${row.email}` : 'Not assigned'}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Assign Modal */}
        {assignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-lg w-[520px] p-6">
              <h3 className="text-lg font-bold mb-2">Assign device {assigningSerialCandidate}</h3>
              <p className="text-sm text-gray-600 mb-4">Choose a farmer account to link this device to.</p>

              <select
                value={assignTargetUser || ''}
                onChange={(e) => setAssignTargetUser(e.target.value)}
                className="w-full px-3 py-2 border-2 border-black rounded mb-4 text-black bg-white"
              >
                <option value="" className="text-black bg-white">Select farmer...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id} className="text-black bg-white">{u.fullName} ({u.email})</option>
                ))}
              </select>

              <div className="flex justify-end gap-3">
                <button onClick={() => { setAssignModalOpen(false); setAssignTargetUser(null); setAssigningSerialCandidate(null); }} className="px-4 py-2 rounded bg-gray-100">Cancel</button>
                <button
                  onClick={async () => {
                    if (!assigningSerialCandidate || !assignTargetUser) { setMessage({ type: 'error', text: 'Please pick a farmer' }); return; }
                    setAssignModalOpen(false);
                    await handleAssignDevice(assigningSerialCandidate, assignTargetUser);
                    setAssignTargetUser(null);
                    setAssigningSerialCandidate(null);
                  }}
                  className="px-4 py-2 rounded bg-blue-600 text-white"
                >Confirm</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'unassigned' && !loading && (
          <div className="space-y-4">
            {unassignedFarmerRows.length === 0 ? (
              <div className="bg-white rounded-lg p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-4" />
                <p className="text-gray-500">All farmer accounts are assigned!</p>
                <p className="text-sm text-gray-400 mt-2">Farmer accounts detected: {users.length}</p>
              </div>
            ) : (
              unassignedFarmerRows.map((row) => (
                <div key={row.id} className="bg-white rounded-lg p-6 border border-gray-200 hover:shadow-lg transition">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-700 mb-1">Serial Number</p>
                      <p className="font-mono font-bold text-gray-900">{row.serial || 'Not assigned'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-700 mb-1">Chip ID</p>
                      <p className="font-mono text-sm text-gray-800">{row.chipId || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-700 mb-1">First Seen</p>
                      <p className="text-sm text-gray-700">{row.device?.first_seen ? new Date(row.device.first_seen).toLocaleDateString('en-GB') : '—'}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-yellow-50 rounded mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Assign to User:</label>
                    <div className="flex gap-2">
                      <select
                        value={selectedUsersMap[row.serial] || ''}
                        onChange={(e) => setDeviceSelectedUser(row.serial, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-black bg-white"
                        disabled={!canAssignRow(row)}
                      >
                        <option value="" className="text-black" style={{ color: '#000' }}>Select a user...</option>
                        {getAvailableUsers().map((user) => (
                          <option key={user.id} value={user.id} className="text-black" style={{ color: '#000' }}>
                            {user.fullName} ({user.email})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssignDevice(row.serial)}
                        disabled={!canAssignRow(row) || !selectedUsersMap[row.serial] || assigningDevice === row.serial}
                        className={`px-4 py-2 rounded-md transition flex items-center gap-2 ${!canAssignRow(row) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                      >
                        {assigningDevice === row.serial && <Loader2 className="w-4 h-4 animate-spin" />}
                        <Link2 className="w-4 h-4" />
                        Assign
                      </button>
                    </div>
                    {!row.chipId && (
                      <p className="mt-2 text-xs text-amber-700">Chip ID missing, so user selection is locked.</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDeviceManagement;
