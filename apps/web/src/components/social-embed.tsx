import React from 'react';

interface SocialEmbedProps {
  platform: 'youtube' | 'instagram' | 'facebook';
  embedUrl: string;
  title?: string;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);

const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
]);

const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
]);

export function sanitizeUrl(url: string, platform?: 'youtube' | 'instagram' | 'facebook'): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed || /[\x00-\x1F\x7F]/.test(trimmed)) return '';

  try {
    const parsed = new URL(trimmed);

    // Strictly enforce http or https protocols. Rejects javascript:, data:, etc.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    const host = parsed.hostname.toLowerCase();

    // Check host and rewrite YouTube URLs to standard /embed/
    if (YOUTUBE_HOSTS.has(host)) {
      if (platform && platform !== 'youtube') return '';

      let videoId = '';
      if (host === 'youtu.be') {
        const seg = parsed.pathname.slice(1).split('/')[0];
        videoId = seg || '';
      } else if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v') || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        const seg = parsed.pathname.replace(/^\/embed\//, '').split('/')[0];
        videoId = seg || '';
      } else if (parsed.pathname.startsWith('/shorts/')) {
        const seg = parsed.pathname.replace(/^\/shorts\//, '').split('/')[0];
        videoId = seg || '';
      } else if (parsed.pathname.startsWith('/v/')) {
        const seg = parsed.pathname.replace(/^\/v\//, '').split('/')[0];
        videoId = seg || '';
      }

      if (videoId && /^[a-zA-Z0-9_-]{1,32}$/.test(videoId)) {
        return `https://www.youtube.com/embed/${videoId}`;
      }
      return '';
    }

    if (INSTAGRAM_HOSTS.has(host)) {
      if (platform && platform !== 'instagram') return '';
      return parsed.toString();
    }

    if (FACEBOOK_HOSTS.has(host)) {
      if (platform && platform !== 'facebook') return '';
      return parsed.toString();
    }

    return '';
  } catch {
    return '';
  }
}

export const SocialEmbed: React.FC<SocialEmbedProps> = ({ platform, embedUrl, title }) => {
  const safeUrl = sanitizeUrl(embedUrl, platform);
  if (!safeUrl) {
    return null;
  }

  return (
    <div className="w-full max-w-xl my-4 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
      {/* Aspect Ratio Container to prevent layout shift */}
      <div className="relative w-full pb-[56.25%] h-0">
        <iframe
          src={safeUrl}
          title={title || `${platform} social content`}
          loading="lazy"
          className="absolute top-0 left-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
};
