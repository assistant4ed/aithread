# NewsAPI Removal Plan

## Decision: Remove NewsAPI Integration

**Rationale:**
- Tavily provides superior real-time search results
- NewsAPI free tier is too limited (100 req/day, 24h delay)
- NewsAPI paid tier is expensive ($449/month) for marginal value
- Simplifies codebase and reduces maintenance burden

---

## Option 1: Complete Removal (Recommended)

### Changes Required:

#### 1. Remove from Schema
**File:** `prisma/schema.prisma`

```diff
- newsApiKey            String?              // Per-workspace News API key (SEARCH mode)
- dataCollationHours    Int       @default(6)  // How many hours back to search (SEARCH mode)
```

#### 2. Remove from Content Modes
**File:** `lib/content_modes.ts`

Remove NewsAPI section (lines 248-268):
```typescript
// 2. NewsAPI (optional secondary)
const newsApiKey = workspace.newsApiKey || process.env.NEWS_API_KEY;
if (newsApiKey) {
    // ... entire block
}
```

Update sourceAccounts:
```diff
- sourceAccounts: ["Tavily Search API", newsApiKey ? "NewsAPI" : ""].filter(Boolean),
+ sourceAccounts: ["Tavily Search API"],
```

#### 3. Remove from UI
**File:** `app/workspaces/new/page.tsx`
**File:** `app/workspaces/[id]/edit/page.tsx`

Remove:
- `newsApiKey` from form state
- NewsAPI field from SEARCH mode configuration UI
- `dataCollationHours` field (if only used for NewsAPI)

#### 4. Remove from API Routes
**File:** `app/api/workspaces/route.ts`
**File:** `app/api/workspaces/[id]/route.ts`

Remove:
- `newsApiKey` from request body extraction
- `newsApiKey` from workspace creation/update

#### 5. Update Testing Guide
**File:** `TESTING_GUIDE.md`

Remove:
- Test 7.2: NewsAPI Integration
- References to NEWS_API_KEY in prerequisites
- NewsAPI monitoring in post-deployment

#### 6. Database Migration
```bash
npx prisma migrate dev --name remove_newsapi
```

---

## Option 2: Keep as Optional (If Uncertain)

### Keep the code but:
1. Mark as **deprecated** in UI
2. Add warning: "⚠️ NewsAPI is optional and rarely needed. Tavily provides better results."
3. Hide field by default (show only in "Advanced" section)
4. Remove from documentation/testing guide
5. Plan for full removal in next major version

---

## Option 3: Replace with Alternative

If you want a **news-specific** source, consider:

| Alternative | Pros | Cons | Cost |
|-------------|------|------|------|
| **Google News RSS** | Free, simple, no key needed | Limited results, no API | Free |
| **Bing News API** | Good coverage, Microsoft-backed | Requires Azure subscription | Varies |
| **NewsData.io** | Modern API, good free tier | 200 req/day limit | Free-$29/mo |
| **GNews API** | Simple, decent free tier | 100 req/day | Free-$15/mo |

**My take:** None of these are worth it when you have Tavily.

---

## Recommended Action Plan

### Phase 1: Immediate (Today)
1. ✅ Mark NewsAPI as optional in UI (already is)
2. ✅ Update documentation to clarify Tavily is primary
3. ✅ Add UI hint: "Tavily provides better real-time results. NewsAPI is rarely needed."

### Phase 2: Next Update (This Week)
1. Remove NewsAPI UI fields from workspace creation/edit
2. Keep backend code for backward compatibility
3. Deprecation notice in changelog

### Phase 3: Next Major Version (v3.0)
1. Full removal from codebase
2. Database migration to drop columns
3. Update all tests and documentation

---

## Migration for Existing Users

**For workspaces currently using NewsAPI:**

1. **No action needed** - they will continue to work with Tavily only
2. **Optional:** Send notification:
   ```
   📢 NewsAPI support is being phased out in favor of Tavily,
   which provides better real-time search results.

   Your workspaces will automatically use Tavily for all searches.
   No configuration changes needed.
   ```

---

## Testing After Removal

Verify that:
- [ ] SEARCH mode still works without NewsAPI
- [ ] AUTO_DISCOVER mode unaffected
- [ ] No errors in logs about missing NewsAPI key
- [ ] Existing workspaces with newsApiKey value still function
- [ ] Article generation quality is maintained or improved

---

## Estimated Effort

**Option 1 (Complete Removal):**
- Code changes: 1-2 hours
- Testing: 1 hour
- Migration: 30 minutes
- **Total: 3-4 hours**

**Option 2 (Keep as Optional):**
- Documentation updates: 30 minutes
- UI warnings: 30 minutes
- **Total: 1 hour**

**Option 3 (Replace with Alternative):**
- Research: 1 hour
- Implementation: 2-3 hours
- Testing: 1 hour
- **Total: 4-5 hours**

---

## My Final Recommendation

**Go with Option 1 (Complete Removal)**

**Why:**
1. Tavily is objectively better for your use case
2. Simplifies codebase (less maintenance)
3. Reduces attack surface (one less API key)
4. No user impact (NewsAPI was optional anyway)
5. Saves money (no need to ever upgrade to NewsAPI paid tier)

**Timeline:**
- **Today:** Add UI hint that NewsAPI is deprecated
- **Next deployment:** Remove UI fields
- **v3.0 (future):** Clean up database schema

---

## Questions to Consider

1. **Do you have any workspaces actively using NewsAPI?**
   - Check: `SELECT COUNT(*) FROM Workspace WHERE newsApiKey IS NOT NULL;`
   - If 0, safe to remove immediately

2. **Do you have a paid NewsAPI subscription?**
   - If no, definitely remove (free tier is too limited)
   - If yes, evaluate if it's worth $449/month

3. **Are you in a news-heavy niche where NewsAPI adds unique value?**
   - Even then, Tavily searches major news outlets too

**Most likely answer to all: No → Remove NewsAPI**

---

## Implementation PR Checklist

If you decide to remove:

- [ ] Remove schema fields (newsApiKey, dataCollationHours)
- [ ] Remove from lib/content_modes.ts
- [ ] Remove from workspace forms
- [ ] Remove from API routes
- [ ] Create database migration
- [ ] Update TESTING_GUIDE.md
- [ ] Update README.md (if mentioned)
- [ ] Update environment variable docs
- [ ] Test SEARCH mode without NewsAPI
- [ ] Update changelog with deprecation notice

