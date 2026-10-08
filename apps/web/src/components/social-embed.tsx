import React from 'react';

interface SocialEmbedProps {
  platform: 'youtube' | 'instagram' | 'facebook';
  embedUrl: string;
  title?: string;
}

export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (['youtube.com', 'www.youtube.com', 'youtu.be', 'instagram.com', 'www.instagram.com', 'facebook.com', 'www.facebook.com'].includes(parsed.hostname)) {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export const SocialEmbed: React.FC<SocialEmbedProps> = ({ platform, embedUrl, title }) => {
  const safeUrl = sanitizeUrl(embedUrl);
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
