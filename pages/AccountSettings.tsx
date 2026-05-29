import React, { useState } from 'react';
import { UserCircle, Shield, AlertTriangle, Save, Eye, Settings } from 'lucide-react';

const AccountSettings: React.FC = () => {
  const [showCurrentPass, setShowCurrentPass] = useState(false);

  return (
    <div className="p-4 sm:p-6 md:p-10 animate-fade-in font-['Poppins',_sans-serif] bg-[#f9fafb] min-h-screen">
      {/* Blue Header Section */}
      <div className="bg-[#4f46e5] text-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[2.5rem] shadow-lg mb-8 sm:mb-10 relative overflow-hidden">
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-4xl font-extrabold mb-1">Account Settings</h1>
            <p className="text-white/80 text-sm sm:text-lg">Manage your profile and security settings</p>
          </div>
          <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
            <Settings className="text-white" size={24} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Profile Information Card */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3 font-bold text-slate-800">
              <UserCircle className="text-[#4f46e5]" size={20} />
              <h3>Profile Information</h3>
            </div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.15em]">Last updated: 30/01/2026</span>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">First Name</label>
                <input type="text" defaultValue="John" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-[#4f46e5] transition-all font-medium text-slate-700" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Last Name</label>
                <input type="text" defaultValue="Doe" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-[#4f46e5] transition-all font-medium text-slate-700" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                <input type="email" defaultValue="john@example.com" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-[#4f46e5] transition-all font-medium text-slate-700" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Phone Number</label>
                <input type="text" defaultValue="emmyzoo238@gmail.com" className="w-full bg-[#f0f4ff] border border-slate-100 rounded-xl px-4 py-3.5 outline-none focus:border-[#4f46e5] transition-all font-medium text-slate-700" />
              </div>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center gap-3 font-bold text-slate-800">
            <Shield className="text-[#4f46e5]" size={20} />
            <h3>Change Password</h3>
          </div>
          <div className="p-8 space-y-6">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Current Password</label>
              <div className="relative">
                <input 
                  type={showCurrentPass ? "text" : "password"} 
                  defaultValue="••••" 
                  className="w-full bg-[#f0f4ff] border border-slate-100 rounded-xl px-4 py-4 pr-12 outline-none focus:border-[#4f46e5] transition-all font-medium text-slate-700" 
                />
                <button 
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-[#4f46e5] transition-colors"
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">New Password</label>
              <div className="relative">
                <input type="password" placeholder="" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 pr-12 outline-none focus:border-[#4f46e5] transition-all font-medium text-slate-700" />
                <button className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-[#4f46e5] transition-colors"><Eye size={18} /></button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2.5 ml-1 font-medium">Minimum 8 characters with at least one number</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Confirm New Password</label>
              <div className="relative">
                <input type="password" placeholder="" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 pr-12 outline-none focus:border-[#4f46e5] transition-all font-medium text-slate-700" />
                <button className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-[#4f46e5] transition-colors"><Eye size={18} /></button>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button className="flex items-center gap-2 px-8 py-3.5 bg-[#4f46e5] text-white rounded-xl font-bold hover:bg-[#4338ca] shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]">
                <Save size={18} /> Save Changes
              </button>
            </div>
          </div>
        </div>

        {/* Danger Zone Section - Red Warning as per Image 3 */}
        <div className="bg-rose-50/50 border border-rose-100 rounded-[2.5rem] p-8">
          <div className="flex items-center gap-3 text-rose-600 font-bold mb-6">
            <AlertTriangle size={24} />
            <h3 className="text-xl">Danger Zone</h3>
          </div>
          <div className="bg-white p-8 rounded-[2rem] border border-rose-100">
            <h4 className="font-bold text-rose-900 mb-1">Delete Account Permanently</h4>
            <p className="text-xs text-rose-500/70 mb-8 leading-relaxed">This will permanently erase all your data from our systems. This action cannot be undone.</p>
            <button className="px-8 py-3.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 active:scale-[0.98]">
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;