import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="s1-canvas flex items-center justify-center min-h-screen font-ui text-ink">
      <div className="text-center">
        <h1 className="font-display text-7xl font-bold italic text-action mb-4">404</h1>
        <h2 className="font-display text-3xl font-bold italic text-ink mb-2">
          <span lang="fi">Sivua ei löytynyt</span>{' / '}
          <span lang="en">Page Not Found</span>
        </h2>
        <p className="text-ink-3 mb-8 px-4">
          <span lang="fi">Etsimääsi sivua ei ole olemassa.</span>{' / '}
          <span lang="en">The page you&apos;re looking for doesn&apos;t exist.</span>
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center min-h-12 px-6 rounded-full s1-primary font-semibold transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-carbon"
        >
          <span lang="fi">Etusivulle</span>{' / '}
          <span lang="en">Go Home</span>
        </Link>
      </div>
    </div>
  );
}
