import React, { useEffect, useState } from 'react';
import { Eye, Trash2, Upload } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import {
  deleteHomeGalleryItem,
  getHomeGalleryItems,
  saveHomeGalleryItem,
  updateHomeGalleryOrder,
  type HomeGalleryItem,
} from '../utils/homeGallery';
import { db } from '../api';
import { parseApiResponse } from '../utils/parseApiResponse';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const API_HOST = API_BASE_URL.replace(/\/api$/, '');

type TeamMember = {
  id: string;
  name: string;
  role: string;
  description?: string;
  imageUrl: string;
  displayOrder: number;
};

const resolveImageUrl = (url: string): string =>
  url && url.startsWith('/uploads/') ? `${API_HOST}${url}` : url;

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read media'));
    reader.readAsDataURL(file);
  });
};

const inferMediaTypeFromUrl = (url: string): 'image' | 'video' => {
  const lower = url.toLowerCase();
  if (
    lower.startsWith('data:video/') ||
    /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/.test(lower) ||
    /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)/.test(lower)
  ) {
    return 'video';
  }
  return 'image';
};

const MAX_LOCAL_VIDEO_MB = 600;
const MAX_LOCAL_VIDEO_BYTES = MAX_LOCAL_VIDEO_MB * 1024 * 1024;

const ImageForm: React.FC = () => {
  const { t } = useTranslation();

  const [showModeModal, setShowModeModal] = useState(true);
  const [uploadMode, setUploadMode] = useState<'team' | 'dashboard' | 'product' | null>(null);

  const [mediaKind, setMediaKind] = useState<'image' | 'video'>('image');
  const [inputSource, setInputSource] = useState<'file' | 'url'>('file');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamRole, setTeamRole] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [displayOrder, setDisplayOrder] = useState(1);

  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productLocation, setProductLocation] = useState('');
  const [productAddress, setProductAddress] = useState('');
  const [productSeller, setProductSeller] = useState('');
  const [productContact, setProductContact] = useState('');

  const [galleryItems, setGalleryItems] = useState<HomeGalleryItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [previewItem, setPreviewItem] = useState<HomeGalleryItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  const loadGallery = async () => {
    try {
      const items = await getHomeGalleryItems();
      setGalleryItems(items);
      if (items.length === 0) {
        setDisplayOrder(1);
      } else {
        const highestOrder = Math.max(...items.map((item) => item.displayOrder || 0));
        setDisplayOrder(highestOrder + 1);
      }
    } catch (error) {
      console.error('Failed to load gallery:', error);
      setSubmitError('Failed to load saved media from database.');
    }
  };

  const loadTeamMembers = async () => {
    try {
      const rows = await db.getTeamMembers();
      const items: TeamMember[] = (rows || []).map((row: any, index: number) => ({
        id: String(row.id || index),
        name: String(row.name || ''),
        role: String(row.role || ''),
        description: row.description || '',
        imageUrl: resolveImageUrl(String(row.imageUrl || row.image_url || '')),
        displayOrder: Number.isFinite(Number(row.displayOrder ?? row.display_order)) ? Number(row.displayOrder ?? row.display_order) : index + 1,
      }));

      setTeamMembers(items);
      if (items.length === 0) {
        setDisplayOrder(1);
      } else {
        const highest = Math.max(...items.map((item) => item.displayOrder || 0));
        setDisplayOrder(highest + 1);
      }
    } catch (error) {
      console.error('Failed to load team members:', error);
      setSubmitError('Failed to load team members from database.');
    }
  };

  useEffect(() => {
    loadGallery();
    loadTeamMembers();
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      const data = await parseApiResponse(response);
      if (data?.success && Array.isArray(data.products)) {
        setProducts(data.products);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      setSubmitError('Failed to load products from database.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setSubmitError('');
    setSubmitted(false);

    try {
      if (uploadMode === 'team') {
        const name = teamName.trim() || 'Team Member';
        const role = teamRole.trim() || 'Team Member';
        const desc = description.trim();

        if (inputSource === 'file' && file) {
          const form = new FormData();
          form.append('image', file);
          form.append('name', name);
          form.append('role', role);
          form.append('description', desc);
          form.append('displayOrder', String(displayOrder));
          await db.addTeamMember(form);
        } else if (inputSource === 'url' && mediaUrl.trim()) {
          const form = new FormData();
          form.append('imageUrl', mediaUrl.trim());
          form.append('name', name);
          form.append('role', role);
          form.append('description', desc);
          form.append('displayOrder', String(displayOrder));
          await db.addTeamMember(form);
        } else {
          throw new Error('Please provide an image file or URL');
        }

        setSubmitted(true);
        setTitle('');
        setDescription('');
        setTeamName('');
        setTeamRole('');
        setFile(null);
        setMediaUrl('');
        await loadTeamMembers();
        return;
      }

      if (uploadMode === 'product') {
        if (!productName.trim() || !productPrice.trim()) {
          throw new Error('Product name and price are required');
        }
        if (!file) {
          throw new Error('Please upload an image or video file');
        }

        const form = new FormData();
        form.append('product_name', productName.trim());
        form.append('price', productPrice.trim());
        form.append('location', productLocation.trim());
        form.append('address', productAddress.trim());
        form.append('description', description.trim());
        form.append('seller_name', productSeller.trim());
        form.append('contact', productContact.trim());
        form.append('media', file);

        const response = await fetch(`${API_BASE_URL}/products`, {
          method: 'POST',
          body: form,
        });
        const result = await parseApiResponse(response);
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Failed to save product');
        }

        setSubmitted(true);
        setProductName('');
        setProductPrice('');
        setProductLocation('');
        setProductAddress('');
        setProductSeller('');
        setProductContact('');
        setDescription('');
        setFile(null);
        loadProducts();
        return;
      }

      let finalMediaUrl = '';
      let finalMediaType: 'image' | 'video' = mediaKind;

      if (inputSource === 'file' && file) {
        if (mediaKind === 'video' && file.size > MAX_LOCAL_VIDEO_BYTES) {
          throw new Error(`Video too large. Max ${MAX_LOCAL_VIDEO_MB}MB`);
        }
        finalMediaUrl = await fileToDataUrl(file);
      } else if (inputSource === 'url' && mediaUrl.trim()) {
        finalMediaUrl = mediaUrl.trim();
        finalMediaType = inferMediaTypeFromUrl(finalMediaUrl);
      } else {
        throw new Error('Please provide a media file or URL');
      }

      const newItem: Omit<HomeGalleryItem, 'id'> = {
        title: uploadMode === 'team' ? teamName : (title || 'Untitled'),
        description: description.trim(),
        mediaDataUrl: finalMediaUrl,
        mediaType: finalMediaType,
        displayOrder,
        ...(uploadMode === 'team' && { teamName, teamRole }),
      };

      await saveHomeGalleryItem(newItem);
      setSubmitted(true);

      setTitle('');
      setDescription('');
      setTeamName('');
      setTeamRole('');
      setFile(null);
      setMediaUrl('');

      loadGallery();
    } catch (error: any) {
      console.error(error);
      setSubmitError(error.message || 'Failed to save media');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      if (uploadMode === 'team') {
        await db.deleteTeamMember(id);
        loadTeamMembers();
      } else if (uploadMode === 'product') {
        const response = await fetch(`${API_BASE_URL}/products/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_admin: 'true' }),
        });
        const result = await parseApiResponse(response);
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Failed to delete product');
        }
        loadProducts();
      } else {
        await deleteHomeGalleryItem(id);
        loadGallery();
      }
    } catch (error) {
      console.error('Failed to delete media:', error);
      setSubmitError('Failed to delete item from database.');
    }
  };

  const startProductEdit = (product: any) => {
    setEditingProductId(product.id);
    setEditingProduct({
      product_name: product.product_name || '',
      description: product.description || '',
      address: product.address || '',
      location: product.location || '',
      price: product.price || '',
      seller_name: product.seller_name || '',
      contact: product.contact || '',
      media: null as File | null,
    });
  };

  const handleProductEditInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditingProduct({ ...editingProduct, [e.target.id]: e.target.value });
  };

  const handleProductMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingProduct({ ...editingProduct, media: e.target.files?.[0] || null });
  };

  const submitProductEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProductId) return;
    setSavingProduct(true);
    setSubmitError('');

    try {
      const form = new FormData();
      form.append('product_name', editingProduct.product_name || '');
      form.append('description', editingProduct.description || '');
      form.append('address', editingProduct.address || '');
      form.append('location', editingProduct.location || '');
      form.append('price', editingProduct.price || '');
      form.append('seller_name', editingProduct.seller_name || '');
      form.append('contact', editingProduct.contact || '');
      form.append('is_admin', 'true');
      if (editingProduct.media) {
        form.append('media', editingProduct.media);
      }

      const response = await fetch(`${API_BASE_URL}/products/${editingProductId}`, {
        method: 'PUT',
        body: form,
      });
      const result = await parseApiResponse(response);
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to update product');
      }
      setEditingProductId(null);
      setEditingProduct(null);
      loadProducts();
    } catch (error: any) {
      setSubmitError(error?.message || 'Failed to update product');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleOrderUpdate = (id: string, nextOrder: number) => {
    if (!Number.isFinite(nextOrder) || nextOrder < 1) return;
    const desiredOrder = Math.floor(nextOrder);
    if (uploadMode === 'team') {
      db.updateTeamMemberOrder(id, desiredOrder)
        .then(() => loadTeamMembers())
        .catch((error) => {
          console.error('Failed to update order:', error);
          setSubmitError('Failed to update team member order.');
        });
    } else {
      updateHomeGalleryOrder(id, desiredOrder)
        .then(() => loadGallery())
        .catch((error) => {
          console.error('Failed to update order:', error);
          setSubmitError('Failed to update media order.');
        });
    }
  };
  
  const isTeamMode = uploadMode === 'team';
  const isProductMode = uploadMode === 'product';
  const activeItemsCount = isTeamMode ? teamMembers.length : isProductMode ? products.length : galleryItems.length;

  // Mode Selection Modal
  if (showModeModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 min-h-screen">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-xl flex flex-col items-center max-w-sm w-full">
          <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">Choose Upload Type</h2>
          <button
            className="mb-4 w-full px-8 py-3 rounded-xl bg-emerald-600 text-white font-bold text-lg hover:bg-emerald-700 transition"
            onClick={() => {
              setUploadMode('team');
              setShowModeModal(false);
              setMediaKind('image');
              setInputSource('file');
            }}
          >
            Team Member (Image Only)
          </button>
          <button
            className="w-full px-8 py-3 rounded-xl bg-blue-600 text-white font-bold text-lg hover:bg-blue-700 transition"
            onClick={() => {
              setUploadMode('dashboard');
              setShowModeModal(false);
              setMediaKind('image');
            }}
          >
            Dashboard (Image/Video)
          </button>
          <button
            className="mt-4 w-full px-8 py-3 rounded-xl bg-violet-600 text-white font-bold text-lg hover:bg-violet-700 transition"
            onClick={() => {
              setUploadMode('product');
              setShowModeModal(false);
              setMediaKind('image');
              setInputSource('file');
            }}
          >
            Product (Image/Video)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {submitted && (
          <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            Item added successfully!
          </div>
        )}

        {submitError && (
          <div className="mb-6 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {submitError}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* ==================== UPLOAD FORM ==================== */}
          <div className="xl:col-span-3">
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-6">
              <h1 className="text-2xl font-black mb-6">
                {uploadMode === 'team'
                  ? 'Add Team Member'
                  : uploadMode === 'product'
                    ? 'Add Product'
                    : 'Add Gallery Media'}
              </h1>

              <form onSubmit={handleSubmit} className="space-y-6">
                {(uploadMode === 'dashboard' || uploadMode === 'product') && (
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                      Media Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setMediaKind('image'); setFile(null); setMediaUrl(''); }}
                        className={`rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wider border transition-all ${
                          mediaKind === 'image' ? 'bg-violet-700 text-white border-violet-700' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10'
                        }`}
                      >
                        Image
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMediaKind('video'); setFile(null); setMediaUrl(''); }}
                        className={`rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wider border transition-all ${
                          mediaKind === 'video' ? 'bg-violet-700 text-white border-violet-700' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10'
                        }`}
                      >
                        Video
                      </button>
                    </div>
                  </div>
                )}

                {!isProductMode && (
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Upload Source</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setInputSource('file'); setMediaUrl(''); }}
                        className={`rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wider border transition-all ${
                          inputSource === 'file' ? 'bg-blue-700 text-white border-blue-700' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10'
                        }`}
                      >
                        Computer Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => { setInputSource('url'); setFile(null); }}
                        className={`rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wider border transition-all ${
                          inputSource === 'url' ? 'bg-blue-700 text-white border-blue-700' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10'
                        }`}
                      >
                        URL Link
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    {isProductMode || inputSource === 'file' ? `Upload ${mediaKind} File` : `Paste ${mediaKind} URL`}
                  </label>
                  {isProductMode || inputSource === 'file' ? (
                    <input
                      type="file"
                      accept={mediaKind === 'image' ? 'image/*' : 'video/*'}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm"
                    />
                  ) : (
                    <input
                      type="url"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder={mediaKind === 'image' ? 'https://example.com/photo.jpg' : 'https://example.com/video.mp4'}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none"
                    />
                  )}
                </div>

                {uploadMode === 'team' && (
                  <>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Team Member Name</label>
                      <input value={teamName} onChange={(e) => setTeamName(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none" placeholder="e.g. John Doe" />
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Team Member Role</label>
                      <input value={teamRole} onChange={(e) => setTeamRole(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none" placeholder="e.g. Electronics Engineer" />
                    </div>
                  </>
                )}

                {uploadMode === 'dashboard' && (
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Title (Optional)</label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none" placeholder="e.g. Lab Entrance" />
                  </div>
                )}

                {uploadMode === 'product' && (
                  <>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Product Name</label>
                      <input value={productName} onChange={(e) => setProductName(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none" placeholder="e.g. Poultry Feed" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Price</label>
                        <input value={productPrice} onChange={(e) => setProductPrice(e.target.value)} type="number" min="0" className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none" placeholder="0.00" />
                      </div>
                      <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Location</label>
                        <input value={productLocation} onChange={(e) => setProductLocation(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none" placeholder="e.g. Kigali" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Address</label>
                      <input value={productAddress} onChange={(e) => setProductAddress(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none" placeholder="Address" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Seller Name</label>
                        <input value={productSeller} onChange={(e) => setProductSeller(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none" placeholder="Seller name" />
                      </div>
                      <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Contact</label>
                        <input value={productContact} onChange={(e) => setProductContact(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none" placeholder="Phone or email" />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none resize-y"
                    placeholder="Short description..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white px-5 py-3.5 text-sm font-black uppercase tracking-wider"
                >
                  {submitting ? 'Uploading...' : 'Publish'} <Upload size={16} />
                </button>
              </form>
            </div>
          </div>

          {/* ==================== GALLERY LIST ==================== */}
          <div className="xl:col-span-2">
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {isTeamMode ? 'Team Members' : (t('active_gallery') || 'Active Gallery')}
                </h2>
                <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {activeItemsCount} items
                </span>
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {isTeamMode
                  ? teamMembers.map((member) => (
                      <article key={member.id} className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-slate-950">
                        <div className="relative h-48 bg-slate-200 dark:bg-slate-800">
                          {member.imageUrl ? (
                            <img src={member.imageUrl} alt={member.name} className="h-full w-full object-cover bg-slate-900/40" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-slate-500 dark:text-slate-400">No image</div>
                          )}
                          <div className="absolute top-3 right-3 flex gap-2">
                            <button onClick={() => handleDelete(member.id)} className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="p-4">
                          <h3 className="font-black text-slate-800 dark:text-white">{member.name}</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{member.role}</p>
                          {member.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{member.description}</p>
                          )}
                          <div className="mt-3 flex items-center gap-2">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Order</span>
                            <input
                              type="number"
                              min={1}
                              value={member.displayOrder || 1}
                              onChange={(e) => handleOrderUpdate(member.id, Number(e.target.value))}
                              className="w-20 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs outline-none"
                            />
                          </div>
                        </div>
                      </article>
                    ))
                  : isProductMode
                    ? products.map((product) => (
                        <article key={product.id || product.product_id} className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-slate-950">
                          <div className="relative h-48 bg-slate-200 dark:bg-slate-800">
                            {product.media_type === 'video' ? (
                              <video src={resolveImageUrl(product.media_url)} className="h-full w-full object-cover bg-slate-900/40" muted loop playsInline />
                            ) : (
                              <img src={resolveImageUrl(product.media_url || product.image_url)} alt={product.product_name} className="h-full w-full object-cover bg-slate-900/40" />
                            )}
                            <div className="absolute top-3 right-3 flex gap-2">
                              <button onClick={() => startProductEdit(product)} className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600" title="Edit">
                                <Upload size={14} />
                              </button>
                              <button onClick={() => handleDelete(String(product.id))} className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600" title="Delete">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {editingProductId === product.id && editingProduct ? (
                            <form onSubmit={submitProductEdit} className="p-4 space-y-2">
                              <input id="product_name" value={editingProduct.product_name} onChange={handleProductEditInput} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm" placeholder="Product name" required />
                              <textarea id="description" value={editingProduct.description} onChange={handleProductEditInput} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm" placeholder="Description" />
                              <input id="price" value={editingProduct.price} onChange={handleProductEditInput} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm" type="number" min="0" placeholder="Price" required />
                              <input id="location" value={editingProduct.location} onChange={handleProductEditInput} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm" placeholder="Location" />
                              <input id="address" value={editingProduct.address} onChange={handleProductEditInput} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm" placeholder="Address" />
                              <input id="seller_name" value={editingProduct.seller_name} onChange={handleProductEditInput} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm" placeholder="Seller name" />
                              <input id="contact" value={editingProduct.contact} onChange={handleProductEditInput} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm" placeholder="Contact" />
                              <input type="file" accept="image/*,video/*" onChange={handleProductMedia} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
                              <div className="flex gap-2">
                                <button type="submit" disabled={savingProduct} className="flex-1 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-bold">
                                  {savingProduct ? 'Saving...' : 'Save'}
                                </button>
                                <button type="button" onClick={() => { setEditingProductId(null); setEditingProduct(null); }} className="flex-1 rounded-lg bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm font-bold">
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="p-4">
                              <h3 className="font-black text-slate-800 dark:text-white">{product.product_name || 'Product'}</h3>
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">${product.price || '0.00'}</p>
                              {product.location && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Location: {product.location}</p>}
                            </div>
                          )}
                        </article>
                      ))
                    : galleryItems.map((item) => (
                      <article key={item.id} className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-slate-950">
                        <div className="relative h-48 bg-slate-200 dark:bg-slate-800">
                          {item.mediaType === 'video' ? (
                            <video src={item.mediaDataUrl} className="h-full w-full object-contain bg-slate-900/40" muted loop playsInline autoPlay />
                          ) : (
                            <img src={item.mediaDataUrl} alt={item.title} className="h-full w-full object-contain bg-slate-900/40" />
                          )}
                          <div className="absolute top-3 right-3 flex gap-2">
                            <button onClick={() => setPreviewItem(item)} className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600" title="Preview">
                              <Eye size={14} />
                            </button>
                            <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="p-4">
                          <h3 className="font-black text-slate-800 dark:text-white">{item.title || item.teamName || 'Untitled'}</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{item.description}</p>
                          <div className="mt-3 flex items-center gap-2">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Order</span>
                            <input
                              type="number"
                              min={1}
                              value={item.displayOrder || 1}
                              onChange={(e) => handleOrderUpdate(item.id, Number(e.target.value))}
                              className="w-20 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs outline-none"
                            />
                          </div>
                        </div>
                      </article>
                    ))}

                {isTeamMode && teamMembers.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500 dark:text-slate-400 border border-dashed rounded-xl">
                    No team members yet. Add some above!
                  </div>
                )}

                {!isTeamMode && !isProductMode && galleryItems.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500 dark:text-slate-400 border border-dashed rounded-xl">
                    No media yet. Add some above!
                  </div>
                )}

                {isProductMode && products.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500 dark:text-slate-400 border border-dashed rounded-xl">
                    No products yet. Add some above!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewItem(null)}>
          <div className="max-w-4xl w-full rounded-2xl overflow-hidden bg-slate-900 border border-white/10" onClick={e => e.stopPropagation()}>
            {previewItem.mediaType === 'video' ? (
              <video src={previewItem.mediaDataUrl} className="w-full max-h-[75vh]" controls autoPlay playsInline />
            ) : (
              <img src={previewItem.mediaDataUrl} alt={previewItem.title} className="w-full max-h-[75vh] object-contain bg-slate-950" />
            )}
            <div className="p-6">
              <h3 className="text-xl font-black text-white">{previewItem.title || previewItem.teamName}</h3>
              <p className="text-slate-300 mt-2">{previewItem.description}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageForm;