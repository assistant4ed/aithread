export const POST_FORMATS: Record<string, { id: string; description: string; trigger: string; structure: string; example: string }> = {
    NEWS_FLASH: {
        id: 'NEWS_FLASH',
        description: 'Breaking announcement — punchy, urgent, factual',
        trigger: 'Major product launch, funding round, acquisition, regulatory decision',
        structure: 'Hook → Key fact → Why it matters → CTA',
        example: 'Anthropic just raised $4B. At a $61B valuation. Claude is now the best-funded AI lab not named OpenAI.'
    },
    LISTICLE: {
        id: 'LISTICLE',
        description: 'Numbered list of tools, tips, or ranked items',
        trigger: 'Multiple tools, frameworks, tips, or options being compared',
        structure: 'Hook → Numbered items (3-7 max) → Closing insight',
        example: '5 AI tools that replaced my entire design stack:\n1. ...'
    },
    HOT_TAKE: {
        id: 'HOT_TAKE',
        description: 'Opinionated, debate-starting single perspective',
        trigger: 'Controversial opinion, industry debate, contrarian view',
        structure: 'Bold claim → Supporting argument → Invitation to debate',
        example: 'Cursor will kill GitHub Copilot. Not because it\'s better — because developers actually enjoy using it.'
    },
    QUOTE_DRIVEN: {
        id: 'QUOTE_DRIVEN',
        description: 'Centers around a notable quote from an industry figure',
        trigger: 'A specific person said something significant or surprising',
        structure: 'Hook → Key quote → Context → Implication',
        example: '"We have 6 months before AGI" — said by someone who actually knows. Context matters here.'
    },
    EXPLAINER: {
        id: 'EXPLAINER',
        description: 'Breaks down a complex concept into simple terms',
        trigger: 'Technical concept, new term, or complex development being discussed',
        structure: 'Hook (what people are confused about) → Simple explanation → So what?',
        example: 'Everyone\'s talking about MCP and nobody\'s explaining it simply. Here\'s what it actually is:'
    },
    TREND_ALERT: {
        id: 'TREND_ALERT',
        description: 'Spotlights an emerging pattern across multiple sources',
        trigger: 'Same theme appearing from multiple independent accounts',
        structure: 'Hook (the pattern) → Evidence points → What it signals',
        example: '3 separate dev teams just shipped the same thing this week. AI-powered code review is the new CI pipeline.'
    }
};

