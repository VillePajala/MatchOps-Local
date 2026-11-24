import Image from 'next/image';
import { useState } from 'react';

interface VideoFacadeProps {
  /** YouTube video id (the videos are vertical Shorts, 9:16). */
  videoId: string;
  /** Video title: the button's accessible name and the iframe title. */
  title: string;
  /** Local poster image shown until the visitor presses play. */
  poster: string;
  /** Short label under the play button, e.g. "Katso video". */
  playLabel: string;
  className?: string;
}

/**
 * Click-to-load YouTube player. Until the visitor presses play the page shows
 * only a local poster image: no request reaches YouTube, so nothing is loaded
 * or set by Google on page view. On click the privacy-enhanced
 * youtube-nocookie.com player replaces the poster and starts playing.
 */
export default function VideoFacade({ videoId, title, poster, playLabel, className = '' }: VideoFacadeProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      className={`relative w-full max-w-[300px] aspect-[9/16] overflow-hidden rounded-[1.5rem] bg-black border border-slate-700/60 shadow-2xl shadow-black/50 ${className}`}
    >
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`${playLabel}: ${title}`}
          className="group absolute inset-0 h-full w-full cursor-pointer"
        >
          <Image
            src={poster}
            alt=""
            fill
            sizes="300px"
            className="object-cover object-top opacity-70 transition-opacity group-hover:opacity-80"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-slate-950/10" />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-slate-900 shadow-lg transition-transform group-hover:scale-110">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="rounded-full bg-slate-950/70 px-3 py-1 text-sm font-semibold text-white">
              {playLabel}
            </span>
          </span>
          <span className="absolute inset-x-0 bottom-0 p-4 text-left text-sm font-semibold leading-snug text-white">
            {title}
          </span>
        </button>
      )}
    </div>
  );
}
