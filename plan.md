# CRS Reports to Wikipedia - Implementation Plan

## Goal
Build a web tool that helps Wikipedia editors incorporate information from Congressional Research Service (CRS) reports into relevant Wikipedia articles, improving the quality of policy-related articles on the internet's #1 source for policy information.

## Architecture

### Core Flow
1. User searches/browses CRS reports via Congress.gov API
2. System automatically finds relevant Wikipedia articles for each report
3. AI analyzes gaps between CRS report content and Wikipedia article content
4. System generates specific, citation-ready edit suggestions in proper wikitext format
5. User reviews suggestions and copies them for use on Wikipedia

### Tech Stack
- **Backend:** Python / Flask
- **CRS Data:** Congress.gov API (v3)
- **Wikipedia Data:** MediaWiki API
- **AI Analysis:** Anthropic Claude API (via Python SDK)
- **Frontend:** HTML/CSS/JS (no framework, clean and professional)

### Key Features
1. **CRS Report Search** - Search by keyword, topic, or report ID
2. **Wikipedia Article Matching** - Automatic matching using report title, topics, and summary
3. **Gap Analysis** - AI identifies what information from the CRS report is missing from Wikipedia
4. **Edit Suggestion Generator** - Produces properly formatted wikitext with citations
5. **Copy & Apply** - One-click copy of suggested edits

### API Details
- Congress.gov API key: `CONGRESS_API_KEY`
- Congress.gov base URL: `https://api.congress.gov/v3/`
- Wikipedia API: `https://en.wikipedia.org/w/api.php`
- Port: 8847 (avoid conflicts with other projects)

## File Structure
```
crs-reports-to-wikipedia/
├── app.py              # Flask application
├── crs_api.py          # Congress.gov API client
├── wikipedia_api.py    # Wikipedia API client
├── analyzer.py         # AI-powered analysis
├── templates/
│   └── index.html      # Main web interface
├── static/
│   ├── style.css       # Styles
│   └── app.js          # Frontend logic
├── plan.md
├── project.md
└── requirements.txt
```

## Implementation Steps
1. Set up project structure and dependencies
2. Build CRS API client
3. Build Wikipedia API client
4. Build AI analyzer
5. Build Flask app with routes
6. Build frontend
7. Test with real reports
8. Polish and iterate with DC agent feedback
9. Write after action report
