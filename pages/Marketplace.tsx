import React, { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const ASSET_BASE_URL = API_BASE_URL.replace(/\/?api\/?$/, '');

const resolveImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${ASSET_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

import { parseApiResponse } from '../utils/parseApiResponse';

const Marketplace: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const role = String(localStorage.getItem('userRole') || '').toLowerCase();
  const isAdminLike = role === 'admin' || role === 'supervisor';
  const authToken = localStorage.getItem('authToken') || '';

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      const data = await parseApiResponse(response);
      if (data?.success && Array.isArray(data.products)) {
        setProducts(data.products);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Failed to load products', error);
      setProducts([]);
    }
  };

  const handleDelete = async (productId: number | string) => {
    if (!isAdminLike) return;
    if (!window.confirm('Delete this product?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await parseApiResponse(response);
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Delete failed');
      }
      await fetchProducts();
    } catch (error) {
      console.error('Failed to delete product', error);
      alert('Failed to delete product');
    }
  };

  useEffect(() => {
    fetchProducts();
    const intervalId = window.setInterval(fetchProducts, 8000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="mx-auto py-10 px-2 max-w-7xl">
      {/* Hero / title section with stats */}
      <section className="mb-8 rounded-2xl bg-slate-900 p-8 text-center text-white">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-green-500">
          Marketplace
        </h1>
        <p className="text-sm text-slate-300 mb-6">Find local poultry products and supplies from community sellers</p>

        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-slate-800 p-6">
            <div className="text-4xl font-extrabold text-emerald-400">{products.length}</div>
            <div className="text-xs uppercase tracking-wide text-slate-400 mt-2">Total Products</div>
          </div>
          <div className="rounded-xl bg-slate-800 p-6">
            <div className="text-4xl font-extrabold text-emerald-400">{new Set(products.map(p => (p.uploader_email || p.seller_name || p.uploader_full_name || '').toLowerCase())).size}</div>
            <div className="text-xs uppercase tracking-wide text-slate-400 mt-2">Contributors</div>
          </div>
          <div className="rounded-xl bg-slate-800 p-6">
            <div className="text-4xl font-extrabold text-emerald-400">{(function(){
                // compute latest update from product timestamps if available
                try {
                  const dates = products
                    .map(p => p.updated_at || p.created_at)
                    .filter(Boolean)
                    .map(d => new Date(d).getTime());
                  if (dates.length === 0) return new Date().toLocaleDateString('en-GB');
                  const maxTs = Math.max.apply(null, dates as any);
                  const max = new Date(maxTs);
                  return max.toLocaleDateString('en-GB');
                } catch (e) {
                  return new Date().toLocaleDateString('en-GB');
                }
              })()}</div>
            <div className="text-xs uppercase tracking-wide text-slate-400 mt-2">Latest Update</div>
          </div>
        </div>
      </section>
      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Available Products</h3>
            <button
              type="button"
              className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs font-bold hover:bg-slate-800"
              onClick={() => window.location.reload()}
            >
              Refresh
            </button>
          </div>
          <div className="mb-4">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, location, seller, or contact"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {products
              .filter((product) => {
                const haystack = [
                  product.product_name,
                  product.description,
                  product.location,
                  product.address,
                  product.seller_name,
                  product.contact,
                  product.uploader_full_name,
                  product.uploader_email,
                  product.uploader_contact,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
                return haystack.includes(searchTerm.trim().toLowerCase());
              })
              .map((product) => (
              <div key={product.id || product.product_id} className="bg-white rounded-xl shadow p-4 flex flex-col items-center">
                {product.media_type === 'video' ? (
                  <video
                    className="w-full max-w-xs h-44 object-cover rounded-lg mb-4"
                    controls
                    src={resolveImageUrl(product.media_url)}
                  />
                ) : (
                  <img
                    src={resolveImageUrl(product.image_url || product.media_url) || 'https://via.placeholder.com/300x220?text=No+Image'}
                    alt={product.product_name || 'Product'}
                    className="w-full max-w-xs h-44 object-cover rounded-lg mb-4"
                    onError={e => (e.currentTarget.src = 'https://via.placeholder.com/300x220?text=No+Image')}
                  />
                )}
                {isAdminLike && (
                  <div className="w-full mb-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(product.id || product.product_id)}
                      className="w-full rounded-lg bg-red-600 text-white px-3 py-2 text-xs font-bold hover:bg-red-700"
                    >
                      Remove Product
                    </button>
                  </div>
                )}
                <div className="font-bold text-lg mb-1 text-slate-900">{product.product_name}</div>
                {product.description && (
                  <div className="text-xs text-slate-700 mb-2">{product.description}</div>
                )}
                <div className="font-black text-emerald-600 mb-2">Unit Price: ${product.price}</div>
                <div className="text-xs text-slate-700 mb-1">Location: {product.location || '-'}</div>
                {product.address && (
                  <div className="text-xs text-slate-700 mb-1">Address: {product.address}</div>
                )}
                <div className="mt-3 w-full rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
                  <div className="font-bold text-slate-900 mb-1">Seller information: </div>
                  <div className="mb-1">Name: {product.uploader_full_name || product.seller_name || '-'}</div>
                  <div className="mb-1">Email: {product.uploader_email || product.contact || '-'}</div>
                  <div>Contact: {product.uploader_contact || product.contact || '-'}</div>
                </div>
                
                <button className="btn btn-navy w-full mb-2" disabled>Buy Now</button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Marketplace;
