import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { FaSearch, FaTimes } from 'react-icons/fa';
import { createSearchIndex, searchIndex, type SearchResult, type SearchIndexData } from '@/lib/guide/searchIndex';
import { getSectionBySlug } from '@/lib/guide/guideConfig';

type SearchIndex = ReturnType<typeof createSearchIndex>;

interface GuideSearchProps {
  searchData: SearchIndexData;
  onResultClick?: () => void;
}

export default function GuideSearch({ searchData, onResultClick }: GuideSearchProps) {
  const { t } = useTranslation('guide');
  const { locale } = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Create index once from search data
  const index = useMemo((): SearchIndex | null => {
    if (!searchData?.documents) return null;
    return createSearchIndex(searchData.documents);
  }, [searchData]);

  // Search when query changes
  useEffect(() => {
    if (!index || !query.trim()) {
      setResults([]);
      return;
    }

    const matches = searchIndex(index, query.trim(), 5);
    setResults(matches);
  }, [index, query]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
      }
    },
    []
  );

  const handleResultClick = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    onResultClick?.();
  }, [onResultClick]);

  const getLocalizedTitle = (result: SearchResult) => {
    const section = getSectionBySlug(result.slug);
    if (!section) return result.title;
    return locale === 'fi' ? section.titleFi : section.title;
  };

  const getLocalizedDescription = (result: SearchResult) => {
    const section = getSectionBySlug(result.slug);
    if (!section) return result.description;
    return locale === 'fi' ? section.descriptionFi : section.description;
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="relative">
        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          className="w-full pl-10 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          aria-label={t('search.placeholder')}
          aria-expanded={isOpen && results.length > 0}
          aria-controls="search-results"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
            aria-label={t('search.clear')}
          >
            <FaTimes className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && query.trim() && (
        <div
          id="search-results"
          className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50"
          role="listbox"
        >
          {results.length > 0 ? (
            <ul className="divide-y divide-slate-700">
              {results.map((result) => {
                const section = getSectionBySlug(result.slug);
                const Icon = section?.icon;

                return (
                  <li key={result.slug}>
                    <Link
                      href={`/guide/${result.slug}`}
                      onClick={handleResultClick}
                      className="flex items-start gap-3 p-3 hover:bg-slate-700/50 transition-colors"
                      role="option"
                    >
                      {Icon && (
                        <div className="flex-shrink-0 w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {getLocalizedTitle(result)}
                        </p>
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {getLocalizedDescription(result)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-4 text-center text-sm text-slate-400">
              {t('search.noResults', { query })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
