export interface PostFormat {
    id: string;
    description: string;
    trigger: string;
    structure: string;
    example: string;
    visualExample?: string;
    bestFor?: string;
    tone?: string;
}

export const POST_FORMATS: Record<string, PostFormat> = {
    NEWS_FLASH: {
        id: 'NEWS_FLASH',
        description: 'Breaking announcement — punchy, urgent, factual',
        trigger: 'Major product launch, funding round, acquisition, regulatory decision',
        structure: 'Hook → Key fact → Why it matters → CTA',
        example: 'Anthropic just raised $4B. At a $61B valuation. Claude is now the best-funded AI lab not named OpenAI.',
        visualExample: '🚨 [HEADLINE]\n📊 [KEY METRIC]\n💡 [IMPLICATION]\n👉 [ACTION]',
        bestFor: 'Time-sensitive announcements, breaking news, major industry events',
        tone: 'Urgent, factual, energetic'
    },
    LISTICLE: {
        id: 'LISTICLE',
        description: 'Numbered list of tools, tips, or ranked items',
        trigger: 'Multiple tools, frameworks, tips, or options being compared',
        structure: 'Hook → Numbered items (3-7 max) → Closing insight',
        example: '5 AI tools that replaced my entire design stack:\n1. ...',
        visualExample: '🎯 [HOOK]\n\n1️⃣ [ITEM]\n2️⃣ [ITEM]\n3️⃣ [ITEM]\n\n✨ [CONCLUSION]',
        bestFor: 'Tool comparisons, curated resources, ranking popular options',
        tone: 'Helpful, organized, actionable'
    },
    HOT_TAKE: {
        id: 'HOT_TAKE',
        description: 'Opinionated, debate-starting single perspective',
        trigger: 'Controversial opinion, industry debate, contrarian view',
        structure: 'Bold claim → Supporting argument → Invitation to debate',
        example: 'Cursor will kill GitHub Copilot. Not because it\'s better — because developers actually enjoy using it.',
        visualExample: '🔥 [CONTROVERSIAL CLAIM]\n\n📝 [ARGUMENT 1]\n📝 [ARGUMENT 2]\n\n💬 Change my mind.',
        bestFor: 'Sparking discussion, challenging conventional wisdom, building engagement',
        tone: 'Bold, opinionated, confident'
    },
    QUOTE_DRIVEN: {
        id: 'QUOTE_DRIVEN',
        description: 'Centers around a notable quote from an industry figure',
        trigger: 'A specific person said something significant or surprising',
        structure: 'Hook → Key quote → Context → Implication',
        example: '"We have 6 months before AGI" — said by someone who actually knows. Context matters here.',
        visualExample: '💬 "[QUOTE]"\n— [PERSON], [ROLE]\n\n🔍 [CONTEXT]\n💡 [ANALYSIS]',
        bestFor: 'Industry leader statements, expert predictions, notable reactions',
        tone: 'Authoritative, analytical, contextual'
    },
    EXPLAINER: {
        id: 'EXPLAINER',
        description: 'Breaks down a complex concept into simple terms',
        trigger: 'Technical concept, new term, or complex development being discussed',
        structure: 'Hook (what people are confused about) → Simple explanation → So what?',
        example: 'Everyone\'s talking about MCP and nobody\'s explaining it simply. Here\'s what it actually is:',
        visualExample: '❓ [CONFUSING THING]\n\n📚 [SIMPLE DEFINITION]\n🔧 [HOW IT WORKS]\n💡 [WHY IT MATTERS]',
        bestFor: 'New technologies, industry jargon, complex frameworks',
        tone: 'Educational, clear, accessible'
    },
    TREND_ALERT: {
        id: 'TREND_ALERT',
        description: 'Spotlights an emerging pattern across multiple sources',
        trigger: 'Same theme appearing from multiple independent accounts',
        structure: 'Hook (the pattern) → Evidence points → What it signals',
        example: '3 separate dev teams just shipped the same thing this week. AI-powered code review is the new CI pipeline.',
        visualExample: '📈 [PATTERN SPOTTED]\n\n✓ [SIGNAL 1]\n✓ [SIGNAL 2]\n✓ [SIGNAL 3]\n\n🔮 [PREDICTION]',
        bestFor: 'Identifying emerging trends, market shifts, pattern recognition',
        tone: 'Observant, insightful, forward-looking'
    },
    THREAD_STORM: {
        id: 'THREAD_STORM',
        description: 'Multi-point thread-style breakdown with numbered insights',
        trigger: 'Complex topic requiring multiple connected points',
        structure: 'Intro hook → 5-10 numbered insights → Summary takeaway',
        example: 'Why developer tools are eating the world (a thread):\n\n1/ The shift started in 2020...\n2/ Then GitHub Copilot proved...\n3/ Now we\'re seeing...',
        visualExample: '🧵 [TOPIC] — a thread:\n\n1/ [POINT]\n2/ [POINT]\n3/ [POINT]\n...\n\nTL;DR: [SUMMARY]',
        bestFor: 'Deep dives, step-by-step analysis, multi-faceted topics',
        tone: 'Comprehensive, sequential, engaging'
    },
    CASE_STUDY: {
        id: 'CASE_STUDY',
        description: 'Real-world example with problem → solution → results',
        trigger: 'Company/person achieved notable results with specific approach',
        structure: 'Context → Problem → Solution → Outcome → Lesson',
        example: 'How Linear 10x\'d their velocity:\n\nProblem: Jira was killing team morale\nSolution: Built their own tool\nResult: 2-week sprints → 2-day cycles',
        visualExample: '📖 [SUBJECT] Case Study\n\n⚠️ Problem: [X]\n✅ Solution: [Y]\n📊 Results: [Z]\n\n💡 Key Lesson: [TAKEAWAY]',
        bestFor: 'Success stories, implementation examples, best practices',
        tone: 'Analytical, evidence-based, practical'
    },
    COMPARISON: {
        id: 'COMPARISON',
        description: 'Side-by-side feature or tool comparison with clear winner/context',
        trigger: 'Two popular alternatives being debated or launched',
        structure: 'Setup → Option A vs Option B → Key differences → Recommendation',
        example: 'Claude vs GPT-5:\n\nSpeed: GPT wins\nReasoning: Claude wins\nCost: Claude wins\n\nFor most devs? Claude.',
        visualExample: '⚔️ [A] vs [B]\n\n[A]: ✓ [PRO] ✗ [CON]\n[B]: ✓ [PRO] ✗ [CON]\n\n🏆 Winner: [CONTEXT-DEPENDENT]',
        bestFor: 'Product launches, feature debates, choosing between alternatives',
        tone: 'Balanced, objective, decisive'
    },
    TUTORIAL: {
        id: 'TUTORIAL',
        description: 'Step-by-step how-to guide with actionable instructions',
        trigger: 'Specific problem many people are trying to solve',
        structure: 'Problem statement → Prerequisites → Steps (3-5) → Expected outcome',
        example: 'How to set up Claude Code in 5 minutes:\n\n1. Install VS Code\n2. Add extension\n3. Configure API key\n4. Done. Start coding.',
        visualExample: '🎓 How to [TASK]\n\nYou\'ll need: [PREREQ]\n\n→ Step 1: [ACTION]\n→ Step 2: [ACTION]\n→ Step 3: [ACTION]\n\n✅ [RESULT]',
        bestFor: 'Setup guides, problem-solving, skill-building',
        tone: 'Instructional, clear, encouraging'
    },
    DATA_STORY: {
        id: 'DATA_STORY',
        description: 'Statistics-driven narrative with surprising insights',
        trigger: 'Compelling data or research findings released',
        structure: 'Eye-catching stat → Context → More data → Conclusion',
        example: '87% of developers now use AI daily.\n\nThat\'s up from 12% in 2023.\n\nBut here\'s the kicker: 92% still don\'t trust it for production.',
        visualExample: '📊 [SHOCKING STAT]\n\nContext: [BACKGROUND]\n\n📈 [STAT 2]\n📉 [STAT 3]\n\n🎯 Takeaway: [INSIGHT]',
        bestFor: 'Research findings, survey results, market analysis',
        tone: 'Data-driven, analytical, revelatory'
    },
    PREDICTION: {
        id: 'PREDICTION',
        description: 'Future trend forecast with rationale and timeline',
        trigger: 'Enough signals to make an educated prediction',
        structure: 'Prediction → Current evidence → Why it\'ll happen → Timeline',
        example: 'By 2027, coding bootcamps will teach AI prompting before syntax.\n\nWhy? Because GitHub Copilot graduates already ship faster.',
        visualExample: '🔮 Prediction: [FUTURE STATE]\n\n📍 Today: [CURRENT]\n🚀 Drivers: [REASON]\n⏰ Timeline: [WHEN]',
        bestFor: 'Industry forecasts, trend extrapolation, strategic thinking',
        tone: 'Visionary, bold, reasoned'
    },
    MYTH_BUSTER: {
        id: 'MYTH_BUSTER',
        description: 'Debunks common misconception with facts',
        trigger: 'Widespread misunderstanding circulating',
        structure: 'Myth stated → Why it\'s wrong → What\'s actually true → Proof',
        example: 'Myth: "AI will replace developers."\n\nReality: AI is replacing tasks, not roles. Devs are shipping 3x faster.\n\nSource: GitHub\'s 2026 report.',
        visualExample: '❌ MYTH: [FALSE BELIEF]\n\n✅ REALITY: [TRUTH]\n\n📚 Evidence: [PROOF]\n\n💡 Why it matters: [IMPACT]',
        bestFor: 'Correcting misinformation, educational content, contrarian views',
        tone: 'Authoritative, corrective, evidence-based'
    },
    RESOURCE_PACK: {
        id: 'RESOURCE_PACK',
        description: 'Curated collection of links/tools with annotations',
        trigger: 'Multiple valuable resources on same topic worth sharing',
        structure: 'Theme → Resource 1 (+ why) → Resource 2 (+ why) → ... → Call to save/share',
        example: 'Ultimate AI dev toolkit:\n\n→ Cursor (coding)\n→ v0 (UI)\n→ Claude (thinking)\n→ Perplexity (research)\n\nBookmark this.',
        visualExample: '🎁 [COLLECTION THEME]\n\n🔗 [RESOURCE 1] — [WHY]\n🔗 [RESOURCE 2] — [WHY]\n🔗 [RESOURCE 3] — [WHY]\n\n💾 Save for later',
        bestFor: 'Tool lists, reading lists, starter kits',
        tone: 'Helpful, curated, valuable'
    },
    BEHIND_SCENES: {
        id: 'BEHIND_SCENES',
        description: 'Process/workflow reveal with insider perspective',
        trigger: 'Interesting process or workflow worth sharing',
        structure: 'Hook (the outcome) → How it\'s actually done → Key insight → Invitation',
        example: 'How I write viral threads:\n\n1. Start with the punchline\n2. Work backward\n3. Delete the first 3 tweets\n\nThat\'s it. Try it.',
        visualExample: '🎬 How [OUTCOME] actually happens:\n\n→ [STEP 1]\n→ [STEP 2]\n→ [UNEXPECTED STEP]\n\n🔑 Secret: [INSIGHT]',
        bestFor: 'Process sharing, transparency, skill-sharing',
        tone: 'Authentic, insider, generous'
    },
    ASK_ME_ANYTHING: {
        id: 'ASK_ME_ANYTHING',
        description: 'Q&A style with expert answers to common questions',
        trigger: 'Frequently asked questions on a topic',
        structure: 'Setup → Q1: [Answer] → Q2: [Answer] → Q3: [Answer] → Invite more questions',
        example: 'AI coding tools FAQ:\n\nQ: Will I lose my skills?\nA: No. You\'ll level up different ones.\n\nQ: Which one should I start with?\nA: Cursor. It just works.',
        visualExample: '💬 [TOPIC] — Your Questions Answered\n\nQ: [QUESTION 1]\nA: [ANSWER]\n\nQ: [QUESTION 2]\nA: [ANSWER]\n\n❓ More questions? Ask below.',
        bestFor: 'Community engagement, addressing objections, education',
        tone: 'Conversational, helpful, approachable'
    },
    TIMELINE: {
        id: 'TIMELINE',
        description: 'Chronological event breakdown showing evolution',
        trigger: 'Significant events with clear progression over time',
        structure: 'Context → Event 1 (date) → Event 2 (date) → ... → What\'s next',
        example: 'The AI race timeline:\n\n2022: ChatGPT drops\n2023: GPT-4 changes everything\n2024: Claude catches up\n2025: o3 goes viral\n2026: ???',
        visualExample: '📅 [TOPIC] Timeline\n\n2024: [EVENT]\n2025: [EVENT]\n2026: [EVENT]\n\n⏭️ Next: [PREDICTION]',
        bestFor: 'Historical context, evolution stories, industry narratives',
        tone: 'Informative, structured, contextual'
    },
    INFOGRAPHIC_TEXT: {
        id: 'INFOGRAPHIC_TEXT',
        description: 'Structured data visualization using text formatting',
        trigger: 'Complex information best shown visually with numbers/comparisons',
        structure: 'Title → Visual data blocks → Key insight highlighted',
        example: 'AI Model Costs (per 1M tokens):\n\nGPT-5: $15\nClaude: $3\nLlama: $0.10\n\n👉 That\'s 150x difference.',
        visualExample: '📊 [DATA TITLE]\n\n[CATEGORY A]: ████████ 80%\n[CATEGORY B]: █████ 50%\n[CATEGORY C]: ██ 20%\n\n🎯 Key: [INSIGHT]',
        bestFor: 'Market data, pricing comparison, survey results',
        tone: 'Visual, concise, impactful'
    }
};

