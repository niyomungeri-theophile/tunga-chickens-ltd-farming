import { db } from '../api';

const API_HOST = (import.meta.env.VITE_API_URL || '/api').replace(/\/api$/, '');

/** Resolve server-relative upload paths to an absolute URL the browser can load. */
const resolveMediaUrl = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('/uploads/')) return url;

  const uploadsIndex = url.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return url.slice(uploadsIndex);
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      return parsed.pathname.startsWith('/uploads/') ? parsed.pathname : url;
    } catch {
      return url;
    }
  }

  return url;
};

export interface HomeGalleryItem {
  id: string;
  title: string;
  description: string;
  mediaDataUrl: string;
  mediaType: 'image' | 'video';
  createdAt: string;
  displayOrder: number;
  teamName?: string;
  teamRole?: string;
}

const normalizeGalleryItem = (item: any, index: number): HomeGalleryItem => ({
  id: String(item.id || Date.now().toString()),
  title: String(item.title || ''),
  description: String(item.description || ''),
  mediaDataUrl: resolveMediaUrl(String(item.mediaDataUrl || item.media_data_url || item.imageDataUrl || '')),
  mediaType: item.mediaType === 'video' || item.media_type === 'video' ? 'video' : 'image',
  createdAt: String(item.createdAt || item.created_at || new Date().toISOString()),
  displayOrder: Number.isFinite(Number(item.displayOrder ?? item.display_order)) ? Number(item.displayOrder ?? item.display_order) : index + 1,
  teamName: item.teamName || item.team_name || '',
  teamRole: item.teamRole || item.team_role || '',
});

export const getHomeGalleryItems = async (): Promise<HomeGalleryItem[]> => {
  const rows = await db.getHeroMedia();
  const parsed = Array.isArray(rows) ? rows : [];
  return parsed
    .map(normalizeGalleryItem)
    .filter((item) => Boolean(item.mediaDataUrl))
    .sort((first, second) => first.displayOrder - second.displayOrder);
};

export const saveHomeGalleryItem = async (item: HomeGalleryItem) => {
  return await db.addHeroMedia(item);
};

export const deleteHomeGalleryItem = async (id: string) => {
  return await db.deleteHeroMedia(id);
};

export const updateHomeGalleryOrder = async (id: string, displayOrder: number) => {
  return await db.updateHeroMediaOrder(id, displayOrder);
};
