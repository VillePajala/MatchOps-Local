import FlexSearch from 'flexsearch';

export interface SearchResult {
  slug: string;
  title: string;
  description: string;
  content: string;
  [key: string]: string; // Index signature for FlexSearch
}

export interface SearchIndexData {
  documents: SearchResult[];
}

// Store document data separately since Index only stores IDs
let documentStore: Map<string, SearchResult> = new Map();

/**
 * Create a FlexSearch index for client-side search
 */
export function createSearchIndex(documents: SearchResult[]) {
  // Reset store
  documentStore = new Map();

  // Create a simple index for combined text search
  const index = new FlexSearch.Index({
    tokenize: 'forward',
    resolution: 9,
  });

  for (const doc of documents) {
    // Store document for retrieval
    documentStore.set(doc.slug, doc);

    // Index combined searchable text
    const searchText = `${doc.title} ${doc.description} ${doc.content}`;
    index.add(doc.slug, searchText);
  }

  return index;
}

/**
 * Search the index and return matching results
 */
export function searchIndex(
  index: ReturnType<typeof createSearchIndex>,
  query: string,
  limit = 10
): SearchResult[] {
  if (!query.trim()) return [];

  const slugs = index.search(query, { limit }) as string[];

  return slugs
    .map(slug => documentStore.get(slug))
    .filter((doc): doc is SearchResult => doc !== undefined);
}
