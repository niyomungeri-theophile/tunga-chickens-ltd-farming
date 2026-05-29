import React, { useState } from 'react';
import { parseApiResponse } from '../utils/parseApiResponse';
import { useLocation } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const ProductRegister: React.FC = () => {
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    location: '',
    address: '',
    sellerName: '',
    contact: '',
    media: null as File | null,
  });
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const actingUserId = params.get('userId') || localStorage.getItem('userId') || '';
  const actingUserName = params.get('userName') || localStorage.getItem('userName') || '';
  const actingAsFarmer = Boolean(params.get('userId'));
  const role = (localStorage.getItem('userRole') || '').toLowerCase();
  const isAdmin = (role === 'admin' || role === 'supervisor') && !actingAsFarmer;

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.id]: e.target.value });
  };
  const handleMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, media: e.target.files?.[0] || null });
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrorMessage('');
    const authToken = localStorage.getItem('authToken') || '';
    if (!authToken) {
      setErrorMessage('Please sign in to post a product.');
      return;
    }

    const formData = new FormData();
    const safeName = form.name.trim();
    formData.append('product_name', safeName);
    formData.append('price', form.price || '');
    formData.append('location', form.location || '');
    formData.append('description', form.description || '');
    formData.append('address', form.address || '');

    if (form.sellerName.trim()) {
      formData.append('seller_name', form.sellerName.trim());
    }

    if (form.contact.trim()) {
      formData.append('contact', form.contact.trim());
    }

    const sellerName = actingUserName || localStorage.getItem('userName') || '';
    if (sellerName) {
      formData.append('seller_name', sellerName);
    }

    if (actingUserId) {
      formData.append('uploaded_by', actingUserId);
    }

    if (form.media) {
      formData.append('media', form.media);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`
        },
        body: formData,
      });
      const result = await parseApiResponse(response);
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Upload failed');
      }
      setSubmitted(true);
      setForm({ name: '', description: '', price: '', location: '', address: '', sellerName: '', contact: '', media: null });
    } catch (err) {
      console.error('Product upload failed:', err);
      const message = err instanceof Error ? err.message : 'Product upload failed. Please try again.';
      setErrorMessage(message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 py-10 px-2">
      <div className="w-full max-w-2xl bg-slate-900 rounded-2xl shadow-lg p-8">
        <h2 className="text-3xl font-black mb-8 text-white">Add Product</h2>
        {submitted && <div className="mb-4 p-3 rounded bg-green-600/20 text-green-300 font-bold text-center">Product registered successfully!</div>}
        {errorMessage && <div className="mb-4 p-3 rounded bg-red-600/20 text-red-300 font-bold text-center">{errorMessage}</div>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setMediaType('image')}
              className={`flex-1 py-3 rounded-xl font-black text-lg transition-all shadow ${mediaType === 'image' ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-slate-800 text-slate-300'}`}
            >
              IMAGE
            </button>
            <button
              type="button"
              onClick={() => setMediaType('video')}
              className={`flex-1 py-3 rounded-xl font-black text-lg transition-all shadow ${mediaType === 'video' ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-slate-800 text-slate-300'}`}
            >
              VIDEO
            </button>
          </div>
          <div className="flex gap-4">
            <button type="button" className="flex-1 py-3 rounded-xl font-black text-base transition-all bg-blue-600 text-white shadow hover:bg-blue-700">COMPUTER UPLOAD</button>
            <button type="button" className="flex-1 py-3 rounded-xl font-black text-base transition-all bg-slate-800 text-slate-400 shadow opacity-60 cursor-not-allowed" disabled>URL LINK</button>
          </div>
          <div>
            <label className="block font-bold text-slate-300 mb-2">
              {mediaType === 'image' ? 'UPLOAD IMAGE FILE' : 'UPLOAD VIDEO FILE'}
            </label>
            <input
              id="media"
              onChange={handleMedia}
              className="block w-full rounded bg-slate-800 text-slate-100 border-0 py-2 px-3"
              type="file"
              accept={mediaType === 'image' ? 'image/*' : 'video/*'}
              required
            />
          </div>
          <div>
            <label className="block font-bold text-slate-400 mb-1">TITLE</label>
            <input id="name" value={form.name} onChange={handleInput} className="block w-full rounded bg-slate-800 text-slate-100 border-0 py-2 px-3 mb-2" placeholder="e.g. Product Name" required />
          </div>
          <div>
            <label className="block font-bold text-slate-400 mb-1">DESCRIPTION</label>
            <textarea id="description" value={form.description} onChange={handleInput} className="block w-full rounded bg-slate-800 text-slate-100 border-0 py-2 px-3" placeholder="Short description..." required />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block font-bold text-slate-400 mb-1">PRICE ($)</label>
              <input id="price" value={form.price} onChange={handleInput} className="block w-full rounded bg-slate-800 text-slate-100 border-0 py-2 px-3" type="number" min="0" required />
            </div>
            <div className="flex-1">
              <label className="block font-bold text-slate-400 mb-1">LOCATION</label>
              <input id="location" value={form.location} onChange={handleInput} className="block w-full rounded bg-slate-800 text-slate-100 border-0 py-2 px-3" placeholder="e.g. Kigali" required />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block font-bold text-slate-400 mb-1">SELLER NAME</label>
              <input id="sellerName" value={form.sellerName} onChange={handleInput} className="block w-full rounded bg-slate-800 text-slate-100 border-0 py-2 px-3" placeholder="Seller name" />
            </div>
            <div className="flex-1">
              <label className="block font-bold text-slate-400 mb-1">CONTACT</label>
              <input id="contact" value={form.contact} onChange={handleInput} className="block w-full rounded bg-slate-800 text-slate-100 border-0 py-2 px-3" placeholder="Phone or email" />
            </div>
          </div>
          <div>
            <label className="block font-bold text-slate-400 mb-1">ADDRESS</label>
            <input id="address" value={form.address} onChange={handleInput} className="block w-full rounded bg-slate-800 text-slate-100 border-0 py-2 px-3" placeholder="Address" required />
          </div>
          <button type="submit" className="w-full py-4 rounded-xl font-black text-lg bg-purple-600 text-white shadow hover:bg-purple-700 flex items-center justify-center gap-2 mt-2">
            PUBLISH
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProductRegister;