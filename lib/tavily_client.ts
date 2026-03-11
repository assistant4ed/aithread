/**
 * Custom Tavily client that uses Bearer token authentication
 *
 * The @tavily/core package uses api_key in JSON body which is deprecated.
 * This client uses the correct Authorization: Bearer header method.
 */

interface TavilySearchOptions {
    searchDepth?: "basic" | "advanced";
    includeAnswers?: boolean;
    maxResults?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
}

interface TavilySearchResult {
    url: string;
    title: string;
    content: string;
    score?: number;
    raw_content?: string | null;
}

interface TavilySearchResponse {
    query: string;
    response_time: number;
    answer?: string | null;
    results: TavilySearchResult[];
    images?: string[];
    request_id: string;
}

export async function tavilySearch(
    apiKey: string,
    query: string,
    options: TavilySearchOptions = {}
): Promise<TavilySearchResponse> {
    const {
        searchDepth = "basic",
        includeAnswers = false,
        maxResults = 5,
        includeDomains = [],
        excludeDomains = []
    } = options;

    const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            query,
            search_depth: searchDepth,
            include_answer: includeAnswers,
            max_results: maxResults,
            include_domains: includeDomains,
            exclude_domains: excludeDomains,
            include_raw_content: false,
            include_images: true
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: { error: response.statusText } }));
        throw new Error(`Tavily API error: ${error.detail?.error || response.statusText}`);
    }

    return response.json();
}
