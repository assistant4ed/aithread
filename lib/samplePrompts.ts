/**
 * Sample Workspace Configurations
 * Pre-built templates for common content creation scenarios
 */

export interface WorkspaceTemplate {
    id: string;
    name: string;
    description: string;
    category: "news" | "education" | "product" | "community" | "entertainment";
    contentMode: "SCRAPE" | "REFERENCE" | "SEARCH" | "VARIATIONS" | "AUTO_DISCOVER";
    synthesisPrompt: string;
    translationPrompt?: string;
    synthesisLanguage?: string;
    preferredFormats: string[];
    sampleSources?: string[];
    autoDiscoverNiche?: string;
    variationBaseTopics?: string[];
    variationCount?: number;
}

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
    {
        id: "tech-news-hk",
        name: "Tech News HK",
        description: "Hong Kong tech news aggregator (Traditional Chinese)",
        category: "news",
        contentMode: "SEARCH",
        synthesisPrompt: "You are a viral tech news curator for Hong Kong developers and tech enthusiasts. Synthesize posts into punchy, high-signal summaries that feel like insider knowledge. Focus on: breaking product launches, AI developments, developer tools, and industry drama. Tone: energetic, slightly irreverent, zero fluff.",
        translationPrompt: "Use Hong Kong colloquial style. Professional but not stiff.",
        synthesisLanguage: "Traditional Chinese (HK/TW)",
        preferredFormats: ["NEWS_FLASH", "LISTICLE", "TREND_ALERT", "HOT_TAKE", "INFOGRAPHIC_TEXT"],
        sampleSources: []
    },
    {
        id: "ai-tools-curator",
        name: "AI Tools Curator",
        description: "Auto-discover and curate emerging AI tools",
        category: "product",
        contentMode: "AUTO_DISCOVER",
        synthesisPrompt: "You are an AI tools curator for developers and creators. Discover and highlight new AI tools that are genuinely useful, not just hype. Focus on: practical applications, real-world use cases, and honest assessments. Tone: helpful, pragmatic, enthusiastic about genuinely good tools.",
        synthesisLanguage: "English",
        preferredFormats: ["RESOURCE_PACK", "COMPARISON", "TUTORIAL", "CASE_STUDY", "LISTICLE"],
        autoDiscoverNiche: "AI developer tools, code generation, IDE plugins, and AI-powered productivity tools for software engineers",
    },
    {
        id: "crypto-daily",
        name: "Crypto Daily",
        description: "Daily crypto market updates and analysis",
        category: "news",
        contentMode: "VARIATIONS",
        synthesisPrompt: "You are a crypto market analyst providing daily updates. Balance hype with skepticism. Focus on: market movements, regulatory news, major protocol updates, and institutional adoption. Tone: analytical, balanced, no shilling.",
        synthesisLanguage: "English",
        preferredFormats: ["DATA_STORY", "NEWS_FLASH", "PREDICTION", "MYTH_BUSTER", "INFOGRAPHIC_TEXT"],
        variationBaseTopics: ["Bitcoin ETF updates", "DeFi protocol news", "Layer 2 scaling solutions", "NFT market trends"],
        variationCount: 3
    },
    {
        id: "startup-insider",
        name: "Startup Insider",
        description: "Startup ecosystem news and funding rounds",
        category: "news",
        contentMode: "SEARCH",
        synthesisPrompt: "You are a startup ecosystem insider reporting on funding, launches, and market moves. Synthesize signals that matter to founders and investors. Focus on: fundraising announcements, pivots, market opportunities, and cautionary tales. Tone: savvy, insider, fast-paced.",
        synthesisLanguage: "English",
        preferredFormats: ["NEWS_FLASH", "CASE_STUDY", "DATA_STORY", "PREDICTION", "BEHIND_SCENES"],
        sampleSources: []
    },
    {
        id: "dev-educator",
        name: "Dev Educator",
        description: "Educational content for developers",
        category: "education",
        contentMode: "VARIATIONS",
        synthesisPrompt: "You are a developer educator creating clear, actionable tutorials and explanations. Make complex topics accessible without dumbing them down. Focus on: practical examples, real-world use cases, and step-by-step guides. Tone: patient, clear, encouraging.",
        synthesisLanguage: "English",
        preferredFormats: ["TUTORIAL", "EXPLAINER", "CASE_STUDY", "THREAD_STORM", "ASK_ME_ANYTHING"],
        variationBaseTopics: ["React Server Components", "TypeScript generics", "Docker best practices", "API design patterns"],
        variationCount: 4
    },
    {
        id: "product-launches",
        name: "Product Launches",
        description: "Track and announce new product features",
        category: "product",
        contentMode: "SCRAPE",
        synthesisPrompt: "You are a product marketing voice announcing new features and updates. Highlight user benefits over technical specs. Focus on: what's new, why it matters, and how to get started. Tone: exciting, clear, user-focused, never salesy.",
        synthesisLanguage: "English",
        preferredFormats: ["NEWS_FLASH", "TUTORIAL", "COMPARISON", "CASE_STUDY", "LISTICLE"],
        sampleSources: ["@producthunt", "@betalist", "@indiemakers"]
    },
    {
        id: "web3-builder",
        name: "Web3 Builder Community",
        description: "Web3 developer community highlights",
        category: "community",
        contentMode: "SCRAPE",
        synthesisPrompt: "You are a community manager for Web3 builders. Highlight member wins, interesting projects, and collaborative opportunities. Focus on: community highlights, technical discussions, and builder stories. Tone: warm, inclusive, technically curious.",
        synthesisLanguage: "English",
        preferredFormats: ["BEHIND_SCENES", "CASE_STUDY", "ASK_ME_ANYTHING", "RESOURCE_PACK", "THREAD_STORM"],
        sampleSources: ["@vitalikbuterin", "@punk6529", "@ethereumjs"]
    },
    {
        id: "design-trends",
        name: "Design Trends",
        description: "Curate design inspiration and trends",
        category: "entertainment",
        contentMode: "AUTO_DISCOVER",
        synthesisPrompt: "You are a design curator spotting emerging trends and inspiring work. Synthesize design movements, tools, and case studies. Focus on: visual trends, design systems, creative tools, and exceptional work. Tone: aesthetic, inspiring, analytical.",
        synthesisLanguage: "English",
        preferredFormats: ["TREND_ALERT", "CASE_STUDY", "LISTICLE", "RESOURCE_PACK", "BEHIND_SCENES"],
        autoDiscoverNiche: "UI/UX design trends, design systems, Figma plugins, and innovative web design work"
    },
    {
        id: "ai-research-digest",
        name: "AI Research Digest",
        description: "Summarize latest AI research papers",
        category: "education",
        contentMode: "SEARCH",
        synthesisPrompt: "You are an AI researcher making academic papers accessible to practitioners. Translate complex research into practical insights. Focus on: novel techniques, surprising results, and real-world applications. Tone: academic but approachable, precise, insightful.",
        synthesisLanguage: "English",
        preferredFormats: ["EXPLAINER", "DATA_STORY", "PREDICTION", "THREAD_STORM", "INFOGRAPHIC_TEXT"],
        sampleSources: []
    },
    {
        id: "indie-maker",
        name: "Indie Maker Stories",
        description: "Indie hacker success stories and learnings",
        category: "community",
        contentMode: "SCRAPE",
        synthesisPrompt: "You are chronicling the indie maker journey. Share wins, failures, and lessons learned. Focus on: revenue milestones, growth tactics, honest struggles, and practical advice. Tone: authentic, encouraging, transparent.",
        synthesisLanguage: "English",
        preferredFormats: ["BEHIND_SCENES", "CASE_STUDY", "ASK_ME_ANYTHING", "DATA_STORY", "HOT_TAKE"],
        sampleSources: ["@levelsio", "@thepatwalls", "@deadcoder0904"]
    }
];

/**
 * Get template by ID
 */
export function getTemplate(id: string): WorkspaceTemplate | undefined {
    return WORKSPACE_TEMPLATES.find(t => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): WorkspaceTemplate[] {
    return WORKSPACE_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get all template categories
 */
export function getTemplateCategories(): string[] {
    return Array.from(new Set(WORKSPACE_TEMPLATES.map(t => t.category)));
}
