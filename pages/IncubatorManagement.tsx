import React, { useState } from 'react';
import { Boxes, Search, Edit2, Trash2, Plus, X, Activity, Hash, Layers, Monitor, ChevronLeft, ChevronRight } from 'lucide-react';

const IncubatorManagement: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const incubators = [
    { id: '9678588', description: 'Incubator Unit A', location: 'Section B1', status: 'Active', capacity: 102 },
    { id: '1235433', description: 'Incubator Unit B', location: 'Section C4', status: 'Active', capacity: 102 },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-10 animate-fade-in font-['Poppins',_sans-serif] bg-[#f9fafb] min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 mb-8 sm:mb-12">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-1">Incubator Management</h1>
          <p className="text-slate-500 text-sm">Register and manage all incubation units</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-[#3730a3] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#312e81] shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
        >
          <Plus size={20} /> Register New Incubator
        </button>
      </div>

      {/* Summary Metrics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-40">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total Incubators</p>
          <div className="flex items-end justify-between">
            <h2 className="text-4xl font-extrabold text-slate-900 leading-none">2</h2>
            <div className="p-3 bg-slate-50 rounded-xl text-slate-400"><Hash size={24} /></div>
          </div>
        </div>
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-40">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Active Units</p>
          <div className="flex items-end justify-between">
            <h2 className="text-4xl font-extrabold text-slate-900 leading-none">2</h2>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-500"><Activity size={24} /></div>
          </div>
        </div>
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-40">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total Capacity</p>
          <div className="flex items-end justify-between">
            <h2 className="text-4xl font-extrabold text-slate-900 leading-none">204</h2>
            <div className="p-3 bg-amber-50 rounded-xl text-amber-500"><Layers size={24} /></div>
          </div>
        </div>
      </div>

      {/* Main Units Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            <Monitor size={20} className="text-indigo-600" />
            <h3>All Incubation Units</h3>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search incubators..." 
              className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl w-full md:w-64 outline-none focus:border-indigo-500 transition-all text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] border-b border-slate-100">
                <th className="px-6 py-5">Physical ID</th>
                <th className="px-6 py-5">Description</th>
                <th className="px-6 py-5">Location</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {incubators.map((unit, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-bold">
                        {idx + 1}
                      </div>
                      <span className="text-sm font-bold text-slate-800">{unit.id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-600">{unit.description}</td>
                  <td className="px-6 py-5 text-sm text-slate-500">{unit.location}</td>
                  <td className="px-6 py-5">
                    <span className="px-3 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-emerald-100 text-emerald-600">
                      {unit.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-3 text-sm">
                      <button className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 font-bold transition-all">
                        <Edit2 size={14} /> edit
                      </button>
                      <button className="flex items-center gap-1 text-rose-400 hover:text-rose-600 font-bold transition-all">
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-slate-50 flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-widest">
          <span>Showing 1 to {incubators.length} of {incubators.length} incubators</span>
          <div className="flex gap-2">
            <button className="px-4 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
              <ChevronLeft size={14} /> Previous
            </button>
            <button className="px-4 py-1.5 bg-indigo-500 text-white rounded-lg font-bold">1</button>
            <button className="px-4 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Register New Incubator Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">Register New Incubator</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Physical Id</label>
                <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-indigo-500 transition-all text-sm" placeholder="Enter device ID" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">select user</label>
                <div className="relative">
                   <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-indigo-500 transition-all text-sm appearance-none cursor-pointer">
                    <option>select user</option>
                    <option>Admin User</option>
                    <option>Rodri</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Capacity (eggs)</label>
                <input type="number" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-indigo-500 transition-all text-sm" placeholder="e.g. 100" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Location</label>
                <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-indigo-500 transition-all text-sm" placeholder="e.g. Unit A" />
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="px-6 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-white transition-all text-sm">Cancel</button>
              <button className="px-6 py-2.5 bg-[#4f46e5] text-white rounded-xl font-bold hover:bg-[#4338ca] transition-all shadow-md text-sm">Register Incubator</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncubatorManagement;