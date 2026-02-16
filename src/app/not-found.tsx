import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-yellow-400 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-slate-200 mb-2">
          <span lang="fi">Sivua ei löytynyt</span>{' / '}
          <span lang="en">Page Not Found</span>
        </h2>
        <p className="text-slate-400 mb-8">
          <span lang="fi">Etsimääsi sivua ei ole olemassa.</span>{' / '}
          <span lang="en">The page you&apos;re looking for doesn&apos;t exist.</span>
        </p>
        <Link
          href="/"
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors inline-block"
        >
          <span lang="fi">Etusivulle</span>{' / '}
          <span lang="en">Go Home</span>
        </Link>
      </div>
    </div>
  );
}
