import React, { useEffect, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useLocation } from 'react-router-dom';
import { Edit, Trash2 } from 'lucide-react';
import { parseApiResponse } from '../utils/parseApiResponse';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const ASSET_BASE_URL = API_BASE_URL.replace(/\/?api\/?$/, '');

const resolveImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${ASSET_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const MyProducts: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const location = useLocation();
  const role = (localStorage.getItem('userRole') || '').toLowerCase();
  const params = new URLSearchParams(location.search);
  const actingUserId = params.get('userId') || localStorage.getItem('userId') || '';
  const actingUserName = params.get('userName') || localStorage.getItem('userName') || '';
  const actingUserEmail = params.get('userEmail') || '';
  const actingAsFarmer = Boolean(params.get('userId'));
  const isAdmin = role === 'admin' || role === 'supervisor';
  const viewerId = localStorage.getItem('userId') || '';
  const viewerName = localStorage.getItem('userName') || '';
  const targetUserId = params.get('userId') || viewerId;
  const { t } = useTranslation();

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      const data = await parseApiResponse(response);
      if (data?.success && Array.isArray(data.products)) {
        if (params.get('userId')) {
          const ownedProducts = data.products.filter((product: any) => String(product.uploaded_by || '') === String(targetUserId));
          setProducts(ownedProducts);
        } else if (isAdmin) {
          setProducts(data.products);
        } else {
          const ownedProducts = data.products.filter((product: any) => String(product.uploaded_by || '') === String(viewerId));
          setProducts(ownedProducts);
        }
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Failed to load products', error);
      setProducts([]);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [location.search]);

  const startEdit = (product: any) => {
    setErrorMessage('');
    setEditingId(product.id);
    setEditForm({
      product_name: product.product_name || '',
      description: product.description || '',
      address: product.address || '',
      location: product.location || '',
      price: product.price || '',
      seller_name: product.seller_name || '',
      contact: product.contact || '',
      image: null as File | null,
    });
  };

  const handleEditInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditForm({ ...editForm, [e.target.id]: e.target.value });
  };

  const handleEditImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditForm({ ...editForm, image: e.target.files?.[0] || null });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    setSaving(true);
    setErrorMessage('');

    const formData = new FormData();
    formData.append('product_name', editForm.product_name || '');
    formData.append('description', editForm.description || '');
    formData.append('address', editForm.address || '');
    formData.append('location', editForm.location || '');
    formData.append('price', editForm.price || '');
    formData.append('seller_name', editForm.seller_name || '');
    formData.append('contact', editForm.contact || '');

    if (actingUserId) {
      formData.append('uploaded_by', actingUserId);
    }
    if (isAdmin) {
      formData.append('is_admin', 'true');
    }

    if (editForm.image) {
      formData.append('media', editForm.image);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/products/${editingId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: formData,
      });
      const result = await parseApiResponse(response);
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Update failed');
      }
      await fetchProducts();
      setEditingId(null);
      setEditForm(null);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to update product');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId: number) => {
    if (!window.confirm(t('confirm_delete_product'))) return;
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await parseApiResponse(response);
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Delete failed');
      }
      await fetchProducts();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to delete product');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-2 flex flex-col items-center">
      <h2 className="text-3xl font-black mb-8 text-white">{isAdmin && !params.get('userId') ? t('all_products') : t('my_products')}</h2>
      {params.get('userId') && (
        <div className="mb-4 rounded bg-blue-600/20 px-4 py-2 text-blue-200">
          {t('viewing_products_for_selected_farmer')}
        </div>
      )}
      {errorMessage && <div className="mb-4 rounded bg-red-600/20 px-4 py-2 text-red-300">{errorMessage}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 w-full max-w-6xl">
        {products.length === 0 && <div className="text-slate-400 col-span-full text-center">{t('no_products_registered_yet')}</div>}
        {products.map((product) => (
          <div key={product.id || product.product_id} className="relative bg-slate-900 rounded-2xl shadow-lg overflow-hidden flex flex-col">
            <div className="relative">
              {product.media_type === 'video' ? (
                <video
                  className="w-full h-60 object-cover"
                  controls
                  src={resolveImageUrl(product.media_url)}
                />
              ) : (
                <img
                  src={resolveImageUrl(product.image_url || product.media_url) || 'https://via.placeholder.com/600x400?text=No+Image'}
                  alt={product.product_name || 'Product'}
                  className="w-full h-60 object-cover"
                  onError={e => (e.currentTarget.src = 'https://via.placeholder.com/600x400?text=No+Image')}
                />
              )}
              <div className="absolute top-3 right-3 flex gap-2">
                {(isAdmin || String(product.uploaded_by || '') === String(targetUserId)) && (
                  <>
                    <button
                      type="button"
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 shadow transition"
                      title="Edit"
                      onClick={() => startEdit(product)}
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      type="button"
                      className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2 shadow transition"
                      title="Delete"
                      onClick={() => handleDelete(product.id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </div>
            </div>
            {editingId === product.id && editForm ? (
              <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 gap-2 p-4">
                <input id="product_name" value={editForm.product_name} onChange={handleEditInput} className="w-full rounded bg-slate-100 px-3 py-2 text-slate-900 placeholder:text-slate-500" placeholder="Product name" required />
                <textarea id="description" value={editForm.description} onChange={handleEditInput} className="w-full rounded bg-slate-100 px-3 py-2 text-slate-900 placeholder:text-slate-500" placeholder="Description" required />
                <input id="price" value={editForm.price} onChange={handleEditInput} className="w-full rounded bg-slate-100 px-3 py-2 text-slate-900 placeholder:text-slate-500" placeholder="Price" type="number" min="0" required />
                <input id="location" value={editForm.location} onChange={handleEditInput} className="w-full rounded bg-slate-100 px-3 py-2 text-slate-900 placeholder:text-slate-500" placeholder="Location" required />
                <input id="address" value={editForm.address} onChange={handleEditInput} className="w-full rounded bg-slate-100 px-3 py-2 text-slate-900 placeholder:text-slate-500" placeholder="Address" />
                <input id="seller_name" value={editForm.seller_name} onChange={handleEditInput} className="w-full rounded bg-slate-100 px-3 py-2 text-slate-900 placeholder:text-slate-500" placeholder="Seller name" />
                <input id="contact" value={editForm.contact} onChange={handleEditInput} className="w-full rounded bg-slate-100 px-3 py-2 text-slate-900 placeholder:text-slate-500" placeholder="Contact" />
                <input id="image" onChange={handleEditImage} className="w-full rounded bg-slate-100 px-3 py-2 text-slate-900" type="file" accept="image/*" />
                <div className="flex gap-2 mt-2">
                  <button type="submit" className="btn btn-navy flex-1" disabled={saving}>{saving ? t('processing') : t('save')}</button>
                  <button type="button" className="btn btn-secondary flex-1" onClick={() => { setEditingId(null); setEditForm(null); }}>{t('cancel')}</button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col flex-1 p-4">
                <div className="font-black text-lg text-white mb-1">{product.product_name}</div>
                {product.description && <div className="text-slate-400 mb-2">{product.description}</div>}
                <div className="text-xs text-slate-500">Location: {product.location || '-'}</div>
                {product.address && <div className="text-xs text-slate-500">Address: {product.address}</div>}
                <div className="font-black text-green-400 mt-2">${product.price}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyProducts;
