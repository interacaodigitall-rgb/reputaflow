import { Business } from '../types';
import { BRAND_FAVICON_URL, BRAND_LOGO_URL } from '../components/common/BrandLogo';

export const DEFAULT_DOCUMENT_TITLE = 'GlowfyHub - Beleza, Agendamentos & Gestão de Avaliações';
export const DEFAULT_DOCUMENT_DESCRIPTION =
  'GlowfyHub - Plataforma completa de Beleza, Agendamentos e Gestão de Avaliações de Clientes.';
export const DEFAULT_FAVICON_URL = BRAND_FAVICON_URL;
export const DEFAULT_APPLE_TOUCH_ICON_URL = BRAND_LOGO_URL;

function setOrCreateLinkTag(rel: string, href: string) {
  if (typeof document === 'undefined' || !document.head) return;

  const existing = document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`);
  const cleanHref = href.trim();

  if (existing.length > 0) {
    const primary = existing[0];
    primary.href = cleanHref;
    if (cleanHref.toLowerCase().endsWith('.svg')) {
      primary.type = 'image/svg+xml';
    } else if (cleanHref.toLowerCase().endsWith('.ico')) {
      primary.type = 'image/x-icon';
    } else if (cleanHref.toLowerCase().endsWith('.png')) {
      primary.type = 'image/png';
    } else {
      primary.removeAttribute('type');
    }
    // Remove duplicate tags of same rel to prevent browser conflict
    for (let i = 1; i < existing.length; i++) {
      existing[i].remove();
    }
  } else {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = cleanHref;
    document.head.appendChild(link);
  }
}

function setOrCreateMetaTag(attr: 'name' | 'property', key: string, content: string) {
  if (typeof document === 'undefined' || !document.head) return;

  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

/**
 * Updates document title, favicon (<link rel="icon"> & <link rel="apple-touch-icon">),
 * and meta description dynamically for the public review page of a business.
 */
export function applyBusinessDocumentMeta(business: Business) {
  if (typeof document === 'undefined' || !business) return;

  const businessName = (business.name || 'Estabelecimento').trim();
  const segment = (business.category || 'Comércio & Serviços').trim();

  const title = `${businessName} • Avaliação Oficial`;
  const description = `Avalie a sua experiência em ${businessName} (${segment}). A sua opinião é muito importante para nós.`;

  document.title = title;
  setOrCreateMetaTag('name', 'description', description);
  setOrCreateMetaTag('property', 'og:title', title);
  setOrCreateMetaTag('property', 'og:description', description);
  setOrCreateMetaTag('name', 'apple-mobile-web-app-title', businessName);

  const logoUrl = (business.logoUrl || '').trim();
  if (logoUrl) {
    setOrCreateLinkTag('icon', logoUrl);
    setOrCreateLinkTag('shortcut icon', logoUrl);
    setOrCreateLinkTag('apple-touch-icon', logoUrl);
  } else {
    setOrCreateLinkTag('icon', DEFAULT_FAVICON_URL);
    setOrCreateLinkTag('shortcut icon', DEFAULT_FAVICON_URL);
    setOrCreateLinkTag('apple-touch-icon', DEFAULT_APPLE_TOUCH_ICON_URL);
  }
}

/**
 * Restores the default platform title, meta description, and favicons
 * when returning to the administrative dashboard or login screen.
 */
export function restoreDefaultDocumentMeta() {
  if (typeof document === 'undefined') return;

  document.title = DEFAULT_DOCUMENT_TITLE;
  setOrCreateMetaTag('name', 'description', DEFAULT_DOCUMENT_DESCRIPTION);
  setOrCreateMetaTag('property', 'og:title', DEFAULT_DOCUMENT_TITLE);
  setOrCreateMetaTag('property', 'og:description', DEFAULT_DOCUMENT_DESCRIPTION);
  setOrCreateMetaTag('name', 'apple-mobile-web-app-title', 'GlowfyHub');

  setOrCreateLinkTag('icon', DEFAULT_FAVICON_URL);
  setOrCreateLinkTag('shortcut icon', DEFAULT_FAVICON_URL);
  setOrCreateLinkTag('apple-touch-icon', DEFAULT_APPLE_TOUCH_ICON_URL);
}
