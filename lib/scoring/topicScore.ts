
export interface TopicScoreInput {
    likeCount: number;
    replyCount: number;
    repostCount: number;
    quoteCount: number;
    followerCount: number | null; // explicitly nullable for topic sources
    ageHours: number;
}

export interface TopicScoreResult {
    score: number;
    tier: 'ESTABLISHED' | 'EMERGING' | 'UNKNOWN';
    passesGate: boolean;
}

const TOPIC_THRESHOLDS = {
    ESTABLISHED: { minFollowers: 5000, minScore: 8 }, // known accounts
    EMERGING: { minFollowers: 500, minScore: 15 }, // mid-tier — needs more engagement proof
    UNKNOWN: { minFollowers: 0, minScore: 25 }, // no follower data — very high bar
};

export function calculateTopicScore(input: TopicScoreInput): TopicScoreResult {
    const {
        likeCount, replyCount, repostCount, quoteCount,
        followerCount, ageHours
    } = input;

    // Time decay: half-life of 48 hours (faster decay than account posts)
    const halfLifeHours = 48;
    const decayFactor = Math.pow(0.5, ageHours / halfLifeHours);

    // Raw engagement signal (no follower dependency)
    const rawEngagement = likeCount + (replyCount * 3) + (repostCount * 2) + (quoteCount * 2);
    const decayedEngagement = rawEngagement * decayFactor;

    // Determine account tier
    let tier: TopicScoreResult['tier'];
    if (followerCount === null || followerCount === undefined || followerCount === 0) {
        tier = 'UNKNOWN';
    } else if (followerCount >= TOPIC_THRESHOLDS.ESTABLISHED.minFollowers) {
        // Blend breakout ratio with raw engagement for established accounts
        const breakoutRatio = rawEngagement / followerCount;
        const blendedScore = (decayedEngagement * 0.4) + (breakoutRatio * 1000 * 0.6);

        return {
            score: blendedScore,
            tier: 'ESTABLISHED',
            passesGate: blendedScore >= TOPIC_THRESHOLDS.ESTABLISHED.minScore
        };
    } else {
        tier = 'EMERGING';
    }

    const threshold = TOPIC_THRESHOLDS[tier].minScore;
    return {
        score: decayedEngagement,
        tier,
        passesGate: decayedEngagement >= threshold
    };
}

/**
 * Replace hard freshness gate with score-weighted freshness.
 * Applies a sliding penalty instead of a hard cutoff for topic sources.
 */
/**
 * Apply sliding freshness penalty for topic posts.
 *
 * Note: ACCOUNT posts never reach this function — they are hard-rejected
 * upstream in processPost() at settings.maxPostAgeHours. Only TOPIC posts
 * use the sliding penalty here.
 */
export function applyFreshnessAdjustment(
    baseScore: number,
    ageHours: number,
): number {
    // Topic sources: sliding penalty instead of hard cutoff
    if (ageHours <= 6) return baseScore * 1.0;  // prime window, no penalty
    if (ageHours <= 24) return baseScore * 0.75; // still fresh, small penalty
    if (ageHours <= 48) return baseScore * 0.45; // aging, needs strong engagement
    if (ageHours <= 72) return baseScore * 0.2;  // stale — only viral content survives
    return 0; // hard cutoff still exists, just pushed out to 72h
}
