
/**
 * TF-IDF + Cosine Similarity Clustering
 * Zero-dependency implementation for grouping short social media texts.
 */

// Stopwords to filter out (English + common internet slang)
const STOPWORDS = new Set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there",
    "their", "what", "so", "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time", "no",
    "just", "him", "know", "take", "people", "into", "year", "your", "good", "some", "could", "them", "see", "other", "than", "then",
    "now", "look", "only", "come", "its", "over", "think", "also", "back", "after", "use", "two", "how", "our", "work", "first", "well",
    "way", "even", "new", "want", "because", "any", "these", "give", "day", "most", "us", "is", "are", "was", "were", "has", "had", "been",
    "http", "https", "com", "www", "thread", "threads"
]);

export interface Document {
    id: string;
    text: string;
}

export interface RawCluster {
    postIds: string[];
    terms: string[]; // Top terms that defined this cluster
}

/**
 * Tokenize text: lowercase, remove punctuation, filter stopwords/short words
 */
export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, "") // Remove punctuation
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const val of vecA.values()) normA += val * val;
    for (const val of vecB.values()) normB += val * val;

    if (normA === 0 || normB === 0) return 0;

    for (const [term, valA] of vecA) {
        if (vecB.has(term)) {
            dotProduct += valA * vecB.get(term)!;
        }
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Main clustering entry point
 * @param posts List of posts to cluster
 * @param threshold Similarity threshold (0.0 to 1.0). Higher = stricter.
 */
export function clusterPosts(posts: Document[], threshold: number = 0.25): RawCluster[] {
    if (posts.length === 0) return [];
    if (posts.length === 1) return [{ postIds: [posts[0].id], terms: [] }];

    // 1. Calculate TF-IDF
    const corpusSize = posts.length;
    const docFreq = new Map<string, number>();
    const docsTerms = posts.map(p => {
        const terms = tokenize(p.text);
        const uniqueTerms = new Set(terms);
        for (const t of uniqueTerms) {
            docFreq.set(t, (docFreq.get(t) || 0) + 1);
        }
        return { id: p.id, terms, uniqueTerms };
    });

    const vectors: Map<string, number>[] = docsTerms.map(doc => {
        const vec = new Map<string, number>();
        const termCounts = new Map<string, number>();

        for (const t of doc.terms) termCounts.set(t, (termCounts.get(t) || 0) + 1);

        for (const [term, count] of termCounts) {
            const tf = count / doc.terms.length;
            const idf = Math.log(corpusSize / (1 + (docFreq.get(term) || 0)));
            vec.set(term, tf * idf);
        }
        return vec;
    });

    // 2. Compute Distance Matrix (1 - similarity)
    // We'll use a simple greedy clustering approach since N is small (<500 typically)
    // For larger N, full agglomerative with matrix is O(N^3) or O(N^2 log N), greedy is O(N^2)

    const clusters: string[][] = [];
    const assigned = new Set<string>();

    // Sort by length to process richer posts first
    const sortedIndices = vectors.map((_, i) => i).sort((a, b) =>
        docsTerms[b].terms.length - docsTerms[a].terms.length
    );

    for (const i of sortedIndices) {
        if (assigned.has(posts[i].id)) continue;

        const currentCluster = [posts[i].id];
        assigned.add(posts[i].id);
        const vecA = vectors[i];

        for (const j of sortedIndices) {
            if (i === j || assigned.has(posts[j].id)) continue;

            const vecB = vectors[j];
            const sim = cosineSimilarity(vecA, vecB);

            if (sim >= threshold) {
                currentCluster.push(posts[j].id);
                assigned.add(posts[j].id);
            }
        }

        clusters.push(currentCluster);
    }

    return clusters.map(c => ({
        postIds: c,
        terms: [] // Terms are tricky to aggregate in greedy, leaving empty for now is fine
    }));
}
