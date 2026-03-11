# 🧪 Testing Guide: Enhanced Content Modes & Post Formats

## Overview
This guide will help you systematically test all new features introduced in the latest release. Follow each section in order to ensure everything works correctly.

---

## ✅ Pre-Testing Checklist

- [ ] Application is running (development or production)
- [ ] Database is accessible
- [ ] Redis is running (for background jobs)
- [ ] At least one user account exists
- [ ] Environment variables are set:
  - `TAVILY_API_KEY` (for AUTO_DISCOVER mode)
  - `NEWS_API_KEY` (optional, for SEARCH mode)
  - AI provider keys (GROQ, OpenAI, etc.)

---

## 📋 Test Plan

### **Section 1: Post Format Expansion (18 Formats)**

#### Test 1.1: Verify All Formats are Available

**Steps:**
1. Navigate to Create New Workspace page
2. Select any content mode **except SCRAPE**
3. Scroll to "Preferred Post Formats" section
4. Click to expand format selector

**Expected Results:**
- [ ] Total of **18 formats** are displayed
- [ ] Badge shows "18 formats available"
- [ ] All new formats are present:
  - [ ] THREAD_STORM
  - [ ] CASE_STUDY
  - [ ] COMPARISON
  - [ ] TUTORIAL
  - [ ] DATA_STORY
  - [ ] PREDICTION
  - [ ] MYTH_BUSTER
  - [ ] RESOURCE_PACK
  - [ ] BEHIND_SCENES
  - [ ] ASK_ME_ANYTHING
  - [ ] TIMELINE
  - [ ] INFOGRAPHIC_TEXT

**Bugs to Watch For:**
- Missing formats
- Duplicate format IDs
- Format cards not rendering

---

#### Test 1.2: Format Metadata Display

**Steps:**
1. Click on any format card
2. Check the format preview

**Expected Results:**
- [ ] Format name is displayed clearly
- [ ] Description is visible
- [ ] Visual example preview is shown (emoji/ASCII template)
- [ ] "💡 Best for..." tag is present and clickable
- [ ] "🎭 Tone" tag displays the tone

**Test with these specific formats:**
- [ ] **NEWS_FLASH**: Should show urgent/energetic tone
- [ ] **TUTORIAL**: Should show instructional tone
- [ ] **HOT_TAKE**: Should show bold/opinionated tone

**Bugs to Watch For:**
- Missing metadata fields
- Broken visual examples
- Tags not rendering

---

#### Test 1.3: Format Expandable Details

**Steps:**
1. Click on a format card's "💡 Best for..." tag
2. Verify expanded details section

**Expected Results:**
- [ ] Card expands smoothly (animation works)
- [ ] "Best For" section is displayed
- [ ] "Structure" section shows format structure
- [ ] "Example" section shows sample content
- [ ] "Trigger" section explains when to use
- [ ] "↑ Collapse" button works

**Bugs to Watch For:**
- Expansion not working
- Content overflow/cut off
- Collapse button missing

---

### **Section 2: FormatPreview Component**

#### Test 2.1: Format Selection

**Steps:**
1. Select various format cards
2. Observe selection state

**Expected Results:**
- [ ] Selected cards show accent border + ring
- [ ] Checkmark badge (✓) appears on selected cards
- [ ] Selection count updates in badge
- [ ] Multiple selections work
- [ ] Deselection works by clicking again

**Bugs to Watch For:**
- Selection state not persisting
- Multiple selections interfering with each other
- Visual feedback missing

---

#### Test 2.2: Search Functionality

**Steps:**
1. Type in the search box: "news"
2. Type: "tutorial"
3. Type: "data"
4. Clear search

**Expected Results:**
- [ ] "news" shows NEWS_FLASH format
- [ ] "tutorial" shows TUTORIAL format
- [ ] "data" shows DATA_STORY format
- [ ] Search is case-insensitive
- [ ] Clearing search shows all formats again
- [ ] Empty search shows "No formats match" message

**Bugs to Watch For:**
- Search not filtering
- Case sensitivity issues
- Empty state not showing

---

#### Test 2.3: Tone Filter

**Steps:**
1. Select "Urgent" from tone filter
2. Select "Educational" from tone filter
3. Select "Bold" from tone filter
4. Select "All Tones"

**Expected Results:**
- [ ] "Urgent" shows NEWS_FLASH
- [ ] "Educational" shows TUTORIAL, EXPLAINER, etc.
- [ ] "Bold" shows HOT_TAKE
- [ ] "All Tones" shows everything
- [ ] Filter works with search simultaneously

**Bugs to Watch For:**
- Filter not working
- Combined search + filter breaking
- Wrong formats showing

---

#### Test 2.4: Quick Action Buttons

**Steps:**
1. Click "⭐ Recommended (6)"
2. Verify selection
3. Click "Select All (18)"
4. Click "Clear Selection"

**Expected Results:**
- [ ] Recommended selects exactly 6 formats: LISTICLE, NEWS_FLASH, EXPLAINER, THREAD_STORM, RESOURCE_PACK, HOT_TAKE
- [ ] Select All selects all 18 formats
- [ ] Selection count badge updates correctly
- [ ] Clear Selection deselects everything
- [ ] Count badge shows "0 selected"

**Bugs to Watch For:**
- Wrong formats selected for "Recommended"
- Select All not working
- Clear not deselecting all

---

### **Section 3: PromptBuilder Component**

#### Test 3.1: Template Selection

**Steps:**
1. Find synthesis prompt field
2. Click "🎨 Prompt Builder Assistant"
3. Try each category filter:
   - All
   - News
   - Education
   - Product
   - Community

**Expected Results:**
- [ ] Builder opens with animation
- [ ] 8 templates are visible when "All" is selected
- [ ] Category filters show relevant templates
- [ ] Templates are organized in 2-column grid

**Templates to verify:**
- [ ] Tech News Curator (news)
- [ ] AI Educator (education)
- [ ] Product Announcer (product)
- [ ] Community Builder (community)
- [ ] Data Analyst (news)
- [ ] Thought Leader (community)
- [ ] Tutorial Creator (education)
- [ ] Startup Insider (news)

**Bugs to Watch For:**
- Builder not opening
- Templates not filtering by category
- Missing templates

---

#### Test 3.2: Template Application

**Steps:**
1. Click on "Tech News Curator" template
2. Verify it's selected (accent border)
3. Check synthesis prompt field below

**Expected Results:**
- [ ] Template card shows selected state
- [ ] Prompt appears in "Current Prompt" preview
- [ ] Full prompt is visible and scrollable
- [ ] Prompt matches template description

**Bugs to Watch For:**
- Prompt not populating
- Wrong prompt content
- Preview not updating

---

#### Test 3.3: Tone Customization

**Steps:**
1. Select a template
2. Move tone slider to "Casual" (left)
3. Click "✨ Apply Customization"
4. Check prompt
5. Move tone slider to "Professional" (right)
6. Apply again

**Expected Results:**
- [ ] Casual adds: "Use casual language, emojis occasionally..."
- [ ] Professional adds: "Use professional language, avoid emojis..."
- [ ] Slider label updates: "Casual" / "Balanced" / "Professional"
- [ ] Original prompt is modified, not replaced

**Bugs to Watch For:**
- Customization not applying
- Prompt being replaced instead of modified
- Slider not responding

---

#### Test 3.4: Length Customization

**Steps:**
1. Select a template
2. Move length slider to "Concise" (left)
3. Apply customization
4. Move length slider to "Detailed" (right)
5. Apply again

**Expected Results:**
- [ ] Concise adds: "Keep it ultra-concise. 2-3 sentences max..."
- [ ] Detailed adds: "Provide comprehensive coverage..."
- [ ] Slider label updates: "Concise" / "Medium" / "Detailed"
- [ ] Both tone and length can be customized together

**Bugs to Watch For:**
- Length customization not working
- Conflicting with tone customization
- Reset not working

---

#### Test 3.5: Copy to Clipboard

**Steps:**
1. Generate a customized prompt
2. Click "📋 Copy to Clipboard"
3. Paste into a text editor

**Expected Results:**
- [ ] Full prompt is copied
- [ ] No UI elements are copied
- [ ] Formatting is preserved
- [ ] Browser shows clipboard permission prompt (if needed)

**Bugs to Watch For:**
- Copy not working
- Partial content copied
- Formatting lost

---

### **Section 4: Enhanced AUTO_DISCOVER Mode**

#### Test 4.1: Auto-Discover Configuration

**Steps:**
1. Create a new workspace
2. Select **AUTO_DISCOVER** mode
3. Fill in "Niche Description"

**Test Cases:**
- [ ] "AI developer tools and code generation"
- [ ] "Hong Kong startup ecosystem"
- [ ] "Web3 DeFi protocols"
- [ ] Very specific: "GPT-4 vs Claude 3 performance benchmarks"

**Expected Results:**
- [ ] Niche description field accepts input
- [ ] Character limit is reasonable (no hard limit)
- [ ] Placeholder text is helpful
- [ ] Field is marked as required

**Bugs to Watch For:**
- Field not accepting input
- Validation errors incorrectly triggering
- Placeholder text missing

---

#### Test 4.2: Topic Discovery via Tavily

**Prerequisites:**
- Ensure `TAVILY_API_KEY` is set in environment

**Steps:**
1. Create AUTO_DISCOVER workspace with niche: "Latest AI model releases"
2. Trigger article generation (via API or UI)
3. Monitor logs for: `[ContentModes/AUTO_DISCOVER]`

**Expected Results:**
- [ ] Log shows: "Discovered X topics, generating up to 5 articles"
- [ ] Topics are relevant to the niche
- [ ] At least 3-5 articles are generated
- [ ] Articles have different topics (not duplicates)

**Check logs for:**
```
[ContentModes/AUTO_DISCOVER] Discovered 8 topics, generating up to 5 articles
[ContentModes/AUTO_DISCOVER] Generating article for: "OpenAI GPT-4.5 Turbo Release"
[ContentModes/AUTO_DISCOVER] Successfully generated 5 articles
```

**Bugs to Watch For:**
- Tavily API not being called
- No topics discovered
- Generic/off-topic results
- API errors not handled gracefully

---

#### Test 4.3: Fallback to AI Query Generation

**Steps:**
1. Temporarily disable Tavily (remove API key or block network)
2. Trigger AUTO_DISCOVER generation

**Expected Results:**
- [ ] Log shows warning: "Tavily discovery failed"
- [ ] System falls back to AI-generated queries
- [ ] Queries are specific and date-aware
- [ ] Articles are still generated

**Check logs for:**
```
[ContentModes/AUTO_DISCOVER] Tavily discovery failed: [error]
[ContentModes/AUTO_DISCOVER] Discovered 5 topics, generating up to 5 articles
```

**Bugs to Watch For:**
- Complete failure when Tavily unavailable
- Generic fallback queries
- No articles generated

---

#### Test 4.4: Article Quality (AUTO_DISCOVER)

**Steps:**
1. Generate 5 articles with AUTO_DISCOVER
2. Review each article in the UI

**Verify for each article:**
- [ ] Topic is relevant to niche
- [ ] Content is comprehensive (not just a sentence)
- [ ] External URLs are included (from Tavily/NewsAPI)
- [ ] Format is applied (check `formatUsed` field)
- [ ] No duplicate articles
- [ ] Source shows "Tavily Search API" or "NewsAPI"

**Bugs to Watch For:**
- Empty content
- Off-topic articles
- Missing sources
- Format not applied

---

### **Section 5: Format Rotation Logic**

#### Test 5.1: First Article (No History)

**Steps:**
1. Create a brand new workspace (no articles yet)
2. Generate 1 article in SEARCH mode
3. Note the format used

**Expected Results:**
- [ ] Article is created successfully
- [ ] Format is randomly selected from preferred formats
- [ ] If no preferred formats, any format is used
- [ ] `formatUsed` field is populated

**Bugs to Watch For:**
- Format selection failing
- `formatUsed` field is null
- Error in format picker

---

#### Test 5.2: Format Variety (Sequential Generation)

**Steps:**
1. Generate 10 articles in the same workspace
2. Check `formatUsed` for each article

**Expected Results:**
- [ ] At least 5 different formats are used across 10 articles
- [ ] Recently used formats appear less frequently
- [ ] No single format dominates (e.g., not 8/10 LISTICLE)
- [ ] Rotation feels natural

**Query to check format distribution:**
```sql
SELECT formatUsed, COUNT(*) as count
FROM SynthesizedArticle
WHERE workspaceId = 'YOUR_WORKSPACE_ID'
GROUP BY formatUsed;
```

**Expected Distribution (10 articles):**
- Most formats: 1-2 uses
- Some formats: 2-3 uses
- No format: >4 uses

**Bugs to Watch For:**
- Same format repeated 5+ times
- Format rotation not working
- Errors in weighted selection

---

#### Test 5.3: Preferred Formats Respect

**Steps:**
1. Create workspace with ONLY these preferred formats:
   - NEWS_FLASH
   - TUTORIAL
   - HOT_TAKE
2. Generate 10 articles
3. Check formats used

**Expected Results:**
- [ ] ALL articles use one of the 3 preferred formats
- [ ] Distribution is roughly balanced (3-4 each)
- [ ] No other formats are used

**Bugs to Watch For:**
- Non-preferred formats appearing
- Ignoring user preferences
- Error when limited format selection

---

### **Section 6: VARIATIONS Mode with Angle Diversity**

#### Test 6.1: Angle Configuration

**Steps:**
1. Create workspace in VARIATIONS mode
2. Add base topics: "AI coding assistants", "Web3 security"
3. Set variation count to 3
4. Generate articles

**Expected Results:**
- [ ] 3 articles generated per topic (6 total)
- [ ] Each article has an angle label in topic name: `[Optimistic]`, `[Cautious]`, `[Educational]`, etc.
- [ ] Angles are distinct across variations

**Bugs to Watch For:**
- Wrong number of variations
- Missing angle labels
- All variations using same angle

---

#### Test 6.2: Angle Perspective Verification

**Steps:**
1. Generate 3 variations for: "GPT-5 vs Claude 4"
2. Read the article content for each

**Verify angles are distinct:**

| Angle | Expected Content |
|-------|------------------|
| **Optimistic** | Focuses on benefits, opportunities, exciting developments |
| **Cautious** | Highlights risks, challenges, trade-offs, concerns |
| **Educational** | Explains concepts clearly, provides context, teaches |
| **Actionable** | Gives steps, practical advice, "how to" guidance |
| **Analytical** | Uses data, comparisons, logical breakdown |
| **Storytelling** | Uses narrative, examples, case studies |

**Expected Results:**
- [ ] Each variation has a clearly different perspective
- [ ] Content matches the assigned angle
- [ ] Tone is appropriate for angle
- [ ] Not just reworded copies

**Bugs to Watch For:**
- All variations sound identical
- Angle not reflected in content
- Generic/bland content

---

#### Test 6.3: Format Diversity in Variations

**Steps:**
1. Generate 5 variations for a single topic
2. Check `formatUsed` for each

**Expected Results:**
- [ ] At least 3 different formats used across 5 variations
- [ ] Formats match the angle (e.g., Tutorial for Educational)
- [ ] No format used more than twice

**Bugs to Watch For:**
- All variations using same format
- Format doesn't match angle
- Format field empty

---

#### Test 6.4: Multiple Topics

**Steps:**
1. Add 3 base topics to workspace
2. Set variation count to 4
3. Generate all variations

**Expected Results:**
- [ ] 12 articles total (3 topics × 4 variations)
- [ ] Articles grouped by base topic
- [ ] Source accounts show: `variation:TopicName (AngleName)`
- [ ] Generation completes successfully

**Bugs to Watch For:**
- Generation stopping mid-way
- Wrong total count
- Topics getting mixed up

---

### **Section 7: SEARCH Mode Enhancement**

#### Test 7.1: Tavily Search Results

**Steps:**
1. Create SEARCH mode workspace
2. Generate article with topic: "OpenAI Sora video model"
3. Check generated article

**Expected Results:**
- [ ] Article contains recent information (from last 48h if available)
- [ ] External URLs are included in `externalUrls` field
- [ ] Content cites sources naturally
- [ ] Information is factual and up-to-date

**Bugs to Watch For:**
- Old/outdated information
- No external URLs
- Made-up facts
- Search failing silently

---

#### Test 7.2: NewsAPI Integration (Optional)

**Prerequisites:**
- Set `NEWS_API_KEY` in workspace or environment

**Steps:**
1. Generate article on a recent news topic
2. Check logs for: `--- NEWS API RESULTS ---`

**Expected Results:**
- [ ] NewsAPI results appear in search context
- [ ] Articles from last X hours (per `dataCollationHours`)
- [ ] Sources include news outlets
- [ ] Combined with Tavily results

**Bugs to Watch For:**
- NewsAPI not being called
- API key not working
- Date filtering not working

---

#### Test 7.3: Format Guidelines in Prompts

**Steps:**
1. Generate 3 articles with different formats:
   - DATA_STORY
   - NEWS_FLASH
   - EXPLAINER
2. Review article structure

**Verify format adherence:**

| Format | Expected Structure |
|--------|-------------------|
| **DATA_STORY** | Starts with eye-catching statistic, includes multiple data points |
| **NEWS_FLASH** | Punchy, urgent tone, clear hook → fact → implication |
| **EXPLAINER** | Starts with confusion/question, simple explanation, "so what?" |

**Expected Results:**
- [ ] Each format follows its specified structure
- [ ] Visual template is reflected in layout
- [ ] Tone matches format requirements
- [ ] Guidelines are being followed

**Bugs to Watch For:**
- Generic structure regardless of format
- Guidelines ignored
- Format mismatch

---

### **Section 8: REFERENCE Mode**

#### Test 8.1: Reference Workspace Selection

**Steps:**
1. Create 2 workspaces (A and B)
2. Generate 5 articles in workspace A
3. Approve and publish at least 3 articles in A
4. Create workspace C in REFERENCE mode
5. Set reference workspace ID to A's ID

**Expected Results:**
- [ ] Configuration saves successfully
- [ ] No errors about workspace not found
- [ ] Reference ID is validated

**Bugs to Watch For:**
- Invalid workspace ID accepted
- Self-reference allowed (should be prevented)
- Configuration not saving

---

#### Test 8.2: Reference Content Generation

**Steps:**
1. Generate article in workspace C (REFERENCE mode)
2. Check generated content

**Expected Results:**
- [ ] Article is NEW and original (not copied)
- [ ] Style/tone is similar to reference articles
- [ ] Topic area matches reference workspace
- [ ] Source shows: `ref:REFERENCE_WORKSPACE_ID`
- [ ] Format is applied

**Bugs to Watch For:**
- Copied content from reference
- Completely off-topic
- Error when reference workspace has no articles
- No format applied

---

#### Test 8.3: No Published Articles Scenario

**Steps:**
1. Create workspace D with no published articles
2. Create workspace E in REFERENCE mode pointing to D
3. Try to generate article

**Expected Results:**
- [ ] Error message: "Reference workspace has no published articles to draw inspiration from."
- [ ] Generation does not proceed
- [ ] No partial/broken articles created

**Bugs to Watch For:**
- Generation proceeding despite no reference
- Cryptic error message
- Application crash

---

### **Section 9: Sample Prompts Library**

#### Test 9.1: Template Availability

**Steps:**
1. Check if templates are accessible in code
2. Import: `import { WORKSPACE_TEMPLATES, getTemplate } from '@/lib/samplePrompts'`

**Verify 10 templates exist:**
- [ ] tech-news-hk
- [ ] ai-tools-curator
- [ ] crypto-daily
- [ ] startup-insider
- [ ] dev-educator
- [ ] product-launches
- [ ] web3-builder
- [ ] design-trends
- [ ] ai-research-digest
- [ ] indie-maker

**Expected Results:**
- [ ] All 10 templates are defined
- [ ] Each has required fields: id, name, description, category, contentMode, synthesisPrompt
- [ ] Helper functions work: `getTemplate('tech-news-hk')` returns template

**Bugs to Watch For:**
- Missing templates
- Undefined fields
- Helper functions not working

---

#### Test 9.2: Template Content Quality

**Review each template:**
1. Check if `synthesisPrompt` is detailed and useful
2. Check if `preferredFormats` are appropriate
3. Check if sample sources are relevant (if provided)

**Expected Results:**
- [ ] Prompts are >50 characters
- [ ] Prompts match the template's purpose
- [ ] Formats align with content type
- [ ] Sources are valid account names (for SCRAPE mode)

**Bugs to Watch For:**
- Generic/empty prompts
- Wrong formats for content type
- Invalid source accounts

---

### **Section 10: Integration Testing**

#### Test 10.1: End-to-End Workspace Creation

**Steps:**
1. Navigate to "Create New Workspace"
2. Fill in all fields:
   - Name: "Test Workspace E2E"
   - Content Mode: **AUTO_DISCOVER**
   - Niche: "AI developer productivity tools"
   - Preferred Formats: Select 5 formats using new selector
   - Synthesis Prompt: Use Prompt Builder → "AI Educator" template
   - AI Provider: GROQ
   - Language: English
3. Save workspace
4. Generate 3 articles
5. Review articles in UI

**Expected Results:**
- [ ] Workspace created successfully
- [ ] All settings saved correctly
- [ ] Articles generated with varied formats
- [ ] Articles are relevant to niche
- [ ] Prompt template is applied
- [ ] Format selector choices are respected

**Bugs to Watch For:**
- Settings not saving
- Generation failing
- UI errors
- Data loss

---

#### Test 10.2: Workspace Edit Flow

**Steps:**
1. Edit an existing workspace
2. Change content mode from SCRAPE to SEARCH
3. Add preferred formats using new selector
4. Update synthesis prompt using Prompt Builder
5. Save changes
6. Generate new article

**Expected Results:**
- [ ] All changes saved
- [ ] New content mode is active
- [ ] Format preferences are applied
- [ ] Prompt changes are reflected in generation
- [ ] No data corruption

**Bugs to Watch For:**
- Changes not persisting
- Content mode switch causing errors
- Previous settings lost
- Generation using old settings

---

#### Test 10.3: Multiple Workspaces with Different Modes

**Steps:**
1. Create 5 workspaces, each with a different content mode:
   - Workspace 1: SCRAPE
   - Workspace 2: REFERENCE
   - Workspace 3: SEARCH
   - Workspace 4: VARIATIONS
   - Workspace 5: AUTO_DISCOVER
2. Generate 2 articles in each workspace
3. Verify all work independently

**Expected Results:**
- [ ] All 5 workspaces function correctly
- [ ] No cross-contamination of settings
- [ ] Each mode behaves as expected
- [ ] Total of 10 articles generated (2 × 5)
- [ ] Format rotation works across all workspaces

**Bugs to Watch For:**
- One mode breaking another
- Shared state causing issues
- Generation failing for specific modes
- Format rotation shared across workspaces (should be per-workspace)

---

### **Section 11: Performance & Edge Cases**

#### Test 11.1: Large Format Selection

**Steps:**
1. Select all 18 formats in workspace
2. Generate 20 articles
3. Monitor format distribution

**Expected Results:**
- [ ] All formats are eventually used
- [ ] Distribution is relatively even
- [ ] Performance is acceptable (no significant slowdown)
- [ ] No memory issues

**Bugs to Watch For:**
- Some formats never used
- Performance degradation
- Memory leaks

---

#### Test 11.2: Empty/Invalid Inputs

**Test Cases:**

| Test | Input | Expected Result |
|------|-------|-----------------|
| No preferred formats | Empty selection | System uses all formats |
| Empty niche (AUTO_DISCOVER) | "" | Error: "No niche description configured" |
| Invalid reference workspace | Non-existent ID | Error: "Reference workspace has no published articles" |
| No base topics (VARIATIONS) | Empty array | Error: "No base topics configured" |
| Variation count = 0 | 0 | Defaults to 3 |
| Very long niche description | 1000+ characters | Accepts but may truncate in prompts |

**Bugs to Watch For:**
- Application crashes
- Cryptic error messages
- Silent failures
- Data corruption

---

#### Test 11.3: Concurrent Generation

**Steps:**
1. Open workspace in 2 browser tabs
2. Trigger article generation in both tabs simultaneously
3. Monitor database and logs

**Expected Results:**
- [ ] Both generations complete
- [ ] No race conditions
- [ ] Articles are not duplicated
- [ ] Format rotation still works correctly

**Bugs to Watch For:**
- Duplicate articles
- One generation canceling the other
- Database locks/deadlocks
- Corrupted data

---

#### Test 11.4: API Rate Limits

**Steps:**
1. Generate 10+ articles rapidly in AUTO_DISCOVER mode
2. Monitor for rate limit errors

**Expected Results:**
- [ ] Small delay (500ms) between generations works
- [ ] Tavily rate limits are handled gracefully
- [ ] If rate limited, error is logged and retry occurs
- [ ] User sees helpful error message

**Bugs to Watch For:**
- Unhandled rate limit errors
- Complete failure after rate limit
- No retry logic
- User sees raw API errors

---

### **Section 12: UI/UX Testing**

#### Test 12.1: Responsive Design

**Test on:**
- [ ] Desktop (1920×1080)
- [ ] Tablet (768×1024)
- [ ] Mobile (375×667)

**Check for each:**
- [ ] Format selector grid adapts (3 cols → 2 cols → 1 col)
- [ ] Prompt Builder is usable
- [ ] Search/filter controls are accessible
- [ ] No horizontal scrolling
- [ ] Touch targets are adequate (mobile)

**Bugs to Watch For:**
- Layout breaking on small screens
- Overlapping elements
- Unclickable buttons
- Horizontal scroll

---

#### Test 12.2: Dark Mode / Theme Support

**Steps:**
1. Check if application has dark mode
2. If yes, toggle dark mode
3. Verify all new components

**Expected Results:**
- [ ] Format cards are readable in both modes
- [ ] Prompt Builder contrasts are good
- [ ] Visual examples are visible
- [ ] No white/black flashing

**Bugs to Watch For:**
- Unreadable text
- Missing backgrounds
- Hard-coded colors not respecting theme

---

#### Test 12.3: Loading States

**Steps:**
1. Slow down network (Chrome DevTools → Network → Slow 3G)
2. Load workspace creation page
3. Open format selector
4. Open Prompt Builder

**Expected Results:**
- [ ] Loading indicators appear
- [ ] No blank/broken UI during load
- [ ] Skeleton screens or spinners are shown
- [ ] Timeout handling works

**Bugs to Watch For:**
- Blank screens
- UI jumping/shifting
- Infinite loading
- No feedback to user

---

#### Test 12.4: Error Messages

**Trigger various errors and check messaging:**

| Error Scenario | Expected Message |
|---------------|------------------|
| AUTO_DISCOVER with no niche | "No niche description configured for AUTO_DISCOVER mode." |
| REFERENCE with no reference ID | "No reference workspace configured." |
| VARIATIONS with no topics | "No base topics configured for VARIATIONS mode." |
| Format selection with 0 formats available | Should not be possible, fallback to all formats |
| API key missing | "AI provider key not configured" |

**Bugs to Watch For:**
- Generic "Error" messages
- Stack traces shown to user
- No error message at all
- Misleading messages

---

### **Section 13: Database Validation**

#### Test 13.1: Schema Compliance

**Run this query:**
```sql
SELECT * FROM SynthesizedArticle LIMIT 5;
```

**Verify fields:**
- [ ] `formatUsed` is populated (not null for new articles)
- [ ] `formatUsed` matches a format ID from POST_FORMATS
- [ ] `sourceAccounts` contains appropriate values:
  - `variation:TopicName (Angle)` for VARIATIONS
  - `ref:WorkspaceId` for REFERENCE
  - `Tavily Search API` for SEARCH/AUTO_DISCOVER
- [ ] `topicName` includes angle label for VARIATIONS: `[Optimistic]`

**Bugs to Watch For:**
- Null `formatUsed` values
- Invalid format IDs
- Wrong source account format
- Missing angle labels

---

#### Test 13.2: Workspace Configuration Persistence

**Query:**
```sql
SELECT contentMode, preferredFormats, autoDiscoverNiche, variationBaseTopics
FROM Workspace
WHERE id = 'YOUR_WORKSPACE_ID';
```

**Verify:**
- [ ] `contentMode` enum is valid: SCRAPE, REFERENCE, SEARCH, VARIATIONS, AUTO_DISCOVER
- [ ] `preferredFormats` is an array of format IDs
- [ ] Mode-specific fields are populated appropriately
- [ ] Default values are correct (e.g., `preferredFormats: []`)

**Bugs to Watch For:**
- Enum values not matching
- Array fields storing strings instead of arrays
- NULL values where defaults should exist

---

### **Section 14: Backward Compatibility**

#### Test 14.1: Existing Workspaces

**Steps:**
1. Open workspaces created BEFORE this update
2. View workspace details
3. Edit workspace settings

**Expected Results:**
- [ ] Old workspaces still work
- [ ] `contentMode` defaults to SCRAPE if not set
- [ ] `preferredFormats` defaults to empty array
- [ ] No migration errors
- [ ] Can edit and save without issues

**Bugs to Watch For:**
- Old workspaces breaking
- Required fields causing errors
- UI showing validation errors

---

#### Test 14.2: Existing Articles

**Steps:**
1. View articles created before update
2. Check if they display correctly

**Expected Results:**
- [ ] Articles without `formatUsed` still display
- [ ] No errors loading old articles
- [ ] Old articles can be edited/republished
- [ ] Analytics still work

**Bugs to Watch For:**
- Errors when `formatUsed` is null
- UI breaking on old data
- Filtering/sorting issues

---

### **Section 15: Documentation & Logs**

#### Test 15.1: Console Logging

**Check browser console for:**
- [ ] No errors during normal operation
- [ ] No warnings (except expected ones)
- [ ] Debug logs are helpful (if any)
- [ ] No sensitive data logged (API keys, tokens)

**Bugs to Watch For:**
- Console filled with errors
- Leaked secrets
- Unhelpful error messages

---

#### Test 15.2: Server Logs

**Check server logs for:**
```
[ContentModes/AUTO_DISCOVER] ...
[ContentModes/VARIATIONS] ...
[ContentModes/REFERENCE] ...
[ContentModes/SEARCH] ...
```

**Verify:**
- [ ] Logs provide useful context
- [ ] Errors include stack traces
- [ ] Success messages confirm operations
- [ ] No excessive logging

**Bugs to Watch For:**
- Missing logs
- Logs not indicating failure clearly
- Too verbose (performance impact)

---

## 🎯 Summary Testing Checklist

### Critical Path (Must Test)
- [ ] **All 18 formats are available and selectable**
- [ ] **FormatPreview component works (search, filter, selection)**
- [ ] **PromptBuilder component works (templates, customization)**
- [ ] **AUTO_DISCOVER generates relevant articles with Tavily**
- [ ] **Format rotation produces variety (no format >40% of articles)**
- [ ] **VARIATIONS mode generates distinct angles**
- [ ] **SEARCH mode includes format guidelines in prompts**
- [ ] **REFERENCE mode works with published articles**
- [ ] **Existing workspaces/articles still work (backward compatibility)**

### High Priority (Should Test)
- [ ] Format expandable details
- [ ] Quick action buttons (Select All, Recommended, Clear)
- [ ] Tone and length customization sliders
- [ ] Copy to clipboard
- [ ] Tavily fallback to AI queries
- [ ] Multiple workspaces with different modes
- [ ] Responsive design on mobile

### Medium Priority (Nice to Test)
- [ ] Empty/invalid input handling
- [ ] Concurrent generation
- [ ] API rate limit handling
- [ ] Loading states
- [ ] Error messages
- [ ] Database schema validation

### Low Priority (Optional)
- [ ] Performance with 18 formats
- [ ] Dark mode support
- [ ] Console/server logs
- [ ] Sample prompts library integration

---

## 📝 Bug Reporting Template

When you find a bug, report it using this format:

```markdown
### Bug: [Brief Description]

**Severity:** Critical / High / Medium / Low

**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Screenshots/Logs:**
[Attach if applicable]

**Environment:**
- Browser: [e.g., Chrome 120]
- OS: [e.g., macOS 14]
- Production/Development: [Which environment]

**Related Test Section:**
[e.g., Section 2.3: Tone Filter]
```

---

## ✅ Sign-Off Checklist

Before considering this feature "production-ready":

- [ ] All Critical Path tests passed
- [ ] At least 80% of High Priority tests passed
- [ ] No Critical or High severity bugs remaining
- [ ] Performance is acceptable (<3s for article generation)
- [ ] Mobile experience is usable
- [ ] Backward compatibility confirmed
- [ ] Production deployment successful
- [ ] Monitoring shows no errors in 24h post-deployment

---

## 📊 Test Results Summary

**Date:** ___________
**Tester:** ___________
**Version:** v2.0.0 (Enhanced Content Modes)

| Category | Total Tests | Passed | Failed | Skipped |
|----------|-------------|--------|--------|---------|
| Format Expansion | | | | |
| FormatPreview Component | | | | |
| PromptBuilder Component | | | | |
| AUTO_DISCOVER Mode | | | | |
| Format Rotation | | | | |
| VARIATIONS Mode | | | | |
| SEARCH Mode | | | | |
| REFERENCE Mode | | | | |
| Integration Testing | | | | |
| Performance & Edge Cases | | | | |
| UI/UX Testing | | | | |
| Database Validation | | | | |
| Backward Compatibility | | | | |
| **TOTAL** | | | | |

**Overall Status:** ✅ PASS / ❌ FAIL / ⚠️ CONDITIONAL PASS

**Notes:**
```
[Add any important observations, known issues, or recommendations]
```

---

## 🚀 Next Steps After Testing

1. **If all tests pass:**
   - Mark feature as production-ready
   - Update changelog
   - Announce to users
   - Monitor analytics

2. **If tests fail:**
   - Log all bugs with severity
   - Prioritize critical/high bugs
   - Fix and retest
   - Consider rollback if critical bugs found

3. **Post-deployment monitoring:**
   - Watch error rates (24-48 hours)
   - Check format distribution in production
   - Monitor API costs (Tavily, NewsAPI)
   - Gather user feedback

---

**Good luck with testing! 🎉**
