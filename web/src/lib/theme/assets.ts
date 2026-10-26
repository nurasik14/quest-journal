/**
 * Asset URL helpers. The app serves web/public at "/"; if it's ever mounted
 * under a sub-path, call setAssetBase(import.meta.env.BASE_URL) once at
 * startup AND override the --qj-img-* / --qj-decor-* URLs in tokens.css.
 */
import type { DecorPhoto, DecorSvg } from './types';

let base = '/';

export function setAssetBase(b: string): void {
  base = b.endsWith('/') ? b : b + '/';
}

export function assetBase(): string {
  return base;
}

const PHOTO_FILES: Record<DecorPhoto, string> = {
  drawers: 'apothecary-drawers.webp',
  'band-evening': 'band-evening.webp',
  'band-garden': 'band-garden.webp',
  'band-notes': 'band-notes.webp',
  'hero-consorts': 'hero-consorts.webp',
  'loader-pestle': 'loader-pestle.webp'
};

/** SVG to show when an image is missing */
export const PHOTO_FALLBACK: Record<DecorPhoto, DecorSvg> = {
  drawers: 'book',
  'band-evening': 'plum-branch',
  'band-garden': 'plum-blossom',
  'band-notes': 'scroll',
  'hero-consorts': 'fan',
  'loader-pestle': 'mortar-pestle'
};

export function photoUrl(name: DecorPhoto): string {
  return `${base}decor/img/${PHOTO_FILES[name]}`;
}

/** Ink-only woodblock herb plate (committed: public domain, 1848). */
export function herbPlateUrl(slug: string): string {
  return `${base}decor/herbs/${slug}.webp`;
}

export function svgUrl(name: string): string {
  return `${base}decor/${name}.svg`;
}

export function stickerUrl(file: string, manifestBase = 'stickers/'): string {
  const b = manifestBase.replace(/^\//, '');
  return `${base}${b}${b.endsWith('/') ? '' : '/'}${file}`;
}
