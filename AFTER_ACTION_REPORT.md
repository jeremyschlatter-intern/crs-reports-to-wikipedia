# After Action Report: CRS Reports to Wikipedia

## Project Summary

**Goal:** Build a tool to help infuse Congressional Research Service (CRS) report content into relevant Wikipedia articles, improving the quality of policy information on the internet's most-visited reference site.

**Result:** A working web application that searches 13,600+ CRS reports, matches them to Wikipedia articles, uses AI to identify information gaps, and generates properly formatted, citation-ready Wikipedia edit suggestions with correct attribution.

**Live at:** `http://localhost:8847` (Flask development server)

---

## What the Tool Does

1. **Search CRS Reports** — Users search by keyword or browse by report ID. The tool queries the Congress.gov API (v3) and maintains a background index of 2,000 recent reports for fast client-side search.

2. **Match Wikipedia Articles** — AI generates targeted Wikipedia search queries based on the report's title, summary, and topics. The tool then searches Wikipedia, checks each result for existing CRS citations, and ranks articles by improvement opportunity.

3. **Analyze Gaps** — AI reads both the CRS report content (fetched from Congress.gov HTML) and the Wikipedia article's full wikitext. It identifies specific information gaps: missing facts, data, context, history, and outdated information. It references the article's existing section structure for precise placement guidance.

4. **Generate Edit Suggestions** — For each gap, the tool produces ready-to-use wikitext with:
   - Proper "According to the Congressional Research Service..." attribution
   - Complete `{{cite web}}` citations with author, date, and Congress.gov URL
   - Specific placement instructions ("Add after the paragraph about X in the Y section")

5. **Discover Opportunities** — A browse-by-topic mode lets users explore 29 CRS policy areas and find Wikipedia articles that lack CRS citations — the highest-value improvement targets.

---

## Process and Obstacles

### 1. API Discovery and Integration

**Challenge:** Understanding the Congress.gov API structure for CRS reports.

**What I did:** Researched the Congress.gov v3 API, tested endpoints, and discovered the response structure. The API doesn't have a direct keyword search for CRS reports — it only supports listing with pagination. I worked around this by building a background index of 2,000 recent reports for client-side search.

**Result:** Full integration with report listing, detail retrieval, and HTML content fetching.

### 2. Wikipedia API Integration

**Obstacle:** Wikipedia's MediaWiki API returned 403 Forbidden on initial requests.

**Diagnosis:** Wikipedia requires a descriptive `User-Agent` header. Without it, requests are blocked.

**Fix:** Added a proper User-Agent header to all Wikipedia API calls. This resolved the issue immediately.

### 3. AI Model Access

**Obstacle:** The Anthropic API key available on this machine didn't work with the model ID `claude-sonnet-4-5-20250514` (the dated version). Several model names returned 404 errors.

**What I tried:** Tested multiple model ID formats: `claude-3-5-sonnet-20241022`, `claude-3-5-sonnet-latest`, `claude-3-opus-20240229`, etc. Most returned 404.

**Resolution:** Discovered that the API key works with the short-form model IDs (`claude-sonnet-4-5`, `claude-haiku-4-5`). Used `claude-sonnet-4-5` for all AI analysis.

### 4. Citation Attribution (Critical Feedback)

**Obstacle:** Initial version presented CRS report analysis as independent fact. A policy expert reviewer pointed out that CRS reports are secondary sources — when they discuss laws, executive orders, or regulations, Wikipedia edits must frame claims as "According to CRS..." rather than stating them as primary fact.

**Impact:** This was the most important fix. Incorrect attribution would get edits reverted by Wikipedia editors and undermine the tool's credibility.

**Fix:** Rewrote the AI prompt to explicitly instruct proper attribution framing. Added detailed instructions about Wikipedia's sourcing policies. Verified the output uses appropriate secondary-source language.

### 5. Article Structure Awareness

**Obstacle:** Initial suggestions generated "floating blocks" of text without specifying where in the existing Wikipedia article they should go. A Wikipedia editor wouldn't know whether to add a new section, append to an existing section, or insert within a paragraph.

**Fix:** Added section structure extraction from Wikipedia article wikitext. The AI now receives the article's section hierarchy and provides specific placement guidance like "Add after the existing paragraph about SWP coordination in the Overview section."

### 6. Date Format in Citations

**Obstacle:** The Congress.gov API returns dates as ISO timestamps (`2026-03-11T04:00:00Z`). These were passed directly into Wikipedia citations, which expect `YYYY-MM-DD` or human-readable dates.

**Fix:** Added date parsing to strip the timestamp portion before building citations.

### 7. Template Rendering Conflict

**Obstacle:** The HTML template included `{{cite web}}` as example text, but Flask's Jinja2 templating engine tried to interpret the double curly braces as template expressions, causing a `TemplateSyntaxError`.

**Fix:** Used Jinja2's string literal syntax: `{{ '{{cite web}}' }}`.

---

## Team and Agent Structure

### DC Policy Reviewer Agent
**Role:** Simulated Daniel Schuman (the project proposer) to provide expert feedback from a DC policy perspective.

**Impact:** This agent identified the two most critical issues in the first review:
- The citation attribution problem (CRS as secondary source)
- The lack of article structure awareness for edit placement

It also recommended the browse-by-topic discovery mode, which transforms the tool from a point solution into a systematic improvement engine. The second review confirmed all critical issues were resolved and identified only minor polish items (date format cleanup).

### Research Agent
**Role:** Investigated available APIs, data sources, and tools for CRS reports and Wikipedia editing.

**Impact:** Provided comprehensive API documentation for both Congress.gov and Wikipedia, including endpoint URLs, parameter names, response structures, and authentication requirements. This eliminated trial-and-error during development.

---

## Technical Architecture

```
User Browser
    |
    v
Flask App (port 8847)
    |
    +--- Congress.gov API (CRS reports)
    |       - List/search reports
    |       - Report detail (summary, topics, authors)
    |       - Report HTML content
    |
    +--- Wikipedia MediaWiki API
    |       - Article search
    |       - Article wikitext content
    |       - Section structure
    |       - CRS citation detection
    |
    +--- Claude AI (Sonnet 4.5)
            - Wikipedia search query generation
            - Gap analysis
            - Edit suggestion generation
```

**Key design decision:** The tool does NOT make edits to Wikipedia directly. It assists human editors by identifying opportunities and generating properly formatted suggestions. This is by design — Wikipedia's community would rightfully reject automated edits, and keeping the human in the loop ensures quality and accountability.

---

## What I Would Do Next

If this project continued:

1. **Batch processing** — Pre-compute analysis for all 13,600 CRS reports against Wikipedia articles, building a database of opportunities ranked by impact.

2. **Wikipedia community engagement** — Reach out to WikiProject Government and WikiProject United States Congress for feedback and buy-in.

3. **Diff preview** — Show a side-by-side view of the Wikipedia article before and after applying the suggested edit.

4. **Export to Wikipedia sandbox** — Allow users to push suggested edits to their Wikipedia user sandbox for review before applying.

5. **Track impact** — Monitor whether suggested edits are actually applied by Wikipedia editors, and use this feedback to improve suggestion quality.

---

## Key Metrics

- **CRS reports accessible:** 13,600+
- **Policy topics covered:** 29 browseable categories
- **API integrations:** 3 (Congress.gov, Wikipedia, Claude AI)
- **Feedback iterations:** 2 rounds with DC policy expert agent
- **Critical issues identified and fixed:** 5
