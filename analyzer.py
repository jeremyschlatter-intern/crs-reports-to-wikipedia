"""AI-powered analysis of CRS reports and Wikipedia articles."""

import anthropic
import json
import os
import re

# Load API key from env file if not already set
if not os.environ.get("ANTHROPIC_API_KEY"):
    env_path = os.path.expanduser("~/demos/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("export "):
                    line = line[7:]
                if "=" in line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    os.environ[key] = val

client = anthropic.Anthropic()
MODEL = "claude-sonnet-4-5"


def _extract_sections(wiki_content):
    """Extract section headers from wikitext to understand article structure."""
    sections = []
    for match in re.finditer(r'^(={2,})\s*(.+?)\s*\1\s*$', wiki_content, re.MULTILINE):
        level = len(match.group(1))
        name = match.group(2)
        sections.append({"level": level, "name": name})
    return sections


def find_matching_wikipedia_topics(report_title, report_summary, report_topics):
    """Use AI to suggest Wikipedia search queries for a CRS report."""
    prompt = f"""Given this Congressional Research Service (CRS) report, suggest 5-8 specific Wikipedia search queries that would find the most relevant Wikipedia articles where information from this report could be added.

Report Title: {report_title}
Report Summary: {report_summary[:2000] if report_summary else 'Not available'}
Report Topics: {', '.join(report_topics) if report_topics else 'Not available'}

Return a JSON array of search query strings. Focus on:
- The specific policy/law/program the report covers
- Key institutions, agencies, or committees involved
- Broader policy areas that would benefit from this information
- Related legislation or programs

Return ONLY the JSON array, no other text. Example: ["query1", "query2", "query3"]"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    try:
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(text)
    except json.JSONDecodeError:
        return [report_title]


def analyze_gap(report_title, report_summary, report_content_snippet,
                wiki_title, wiki_content, existing_crs_refs):
    """Analyze what information from a CRS report could improve a Wikipedia article."""

    # Extract article structure for placement guidance
    sections = _extract_sections(wiki_content)
    section_list = "\n".join(f"  {'#' * s['level']} {s['name']}" for s in sections) if sections else "  (no section headers found)"

    crs_ref_note = ""
    if existing_crs_refs:
        crs_ref_note = f"\n\nIMPORTANT: This Wikipedia article already cites {len(existing_crs_refs)} CRS report(s). Your suggestions should add NEW information not already covered by existing CRS citations."

    prompt = f"""You are helping improve Wikipedia by incorporating information from Congressional Research Service (CRS) reports.

## CRS Report
Title: {report_title}
Summary: {report_summary[:3000] if report_summary else 'Not available'}
Content excerpt: {report_content_snippet[:4000] if report_content_snippet else 'Not available'}

## Wikipedia Article: {wiki_title}
### Existing section structure:
{section_list}

### Article content (partial):
{wiki_content[:6000]}{crs_ref_note}

## Task
Analyze what valuable information from the CRS report could improve this Wikipedia article. Consider:
1. Facts, statistics, or data points that are in the CRS report but missing from Wikipedia
2. Context or background information that would enrich the article
3. Historical information or legislative history
4. Updates to outdated information

IMPORTANT GUIDELINES:
- Only identify gaps where the CRS report itself contains the information (not information the CRS report merely references)
- Be specific about which EXISTING section of the Wikipedia article each gap belongs in
- If no existing section is appropriate, suggest a specific new section name and where it should be placed relative to existing sections

Return your analysis as JSON with this structure:
{{
    "relevance_score": <1-10, how relevant is this CRS report to this Wikipedia article>,
    "relevance_explanation": "<brief explanation of relevance>",
    "gaps": [
        {{
            "type": "<fact|context|history|data|update>",
            "description": "<what information is missing>",
            "importance": "<high|medium|low>",
            "source_detail": "<specific detail from the CRS report - quote or closely paraphrase the actual text>",
            "suggested_section": "<name of an EXISTING section in the article, or 'New section: [Name] (after [Existing Section])'>",
            "placement_note": "<specific guidance on where within the section this should go>"
        }}
    ]
}}

Return ONLY the JSON, no other text. Identify 3-8 specific gaps."""

    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    try:
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(text)
    except json.JSONDecodeError:
        return {"relevance_score": 0, "gaps": [], "error": "Failed to parse analysis"}


def generate_edit_suggestions(report_title, report_id, report_summary,
                               report_content_snippet, report_date,
                               wiki_title, wiki_content, gaps, authors=None):
    """Generate specific, citation-ready Wikipedia edit suggestions."""

    gaps_text = json.dumps(gaps, indent=2)

    # Build proper citation template with date and authors
    author_fields = ""
    if authors:
        for i, author in enumerate(authors[:3]):
            name = author if isinstance(author, str) else author.get("author", "")
            parts = name.rsplit(" ", 1)
            if len(parts) == 2:
                author_fields += f" |last{i+1}={parts[1]} |first{i+1}={parts[0]}"
            else:
                author_fields += f" |author{i+1}={name}"

    # Format date for Wikipedia (YYYY-MM-DD, not ISO timestamp)
    formatted_date = ""
    if report_date:
        # Convert "2026-03-11T04:00:00Z" to "2026-03-11"
        formatted_date = report_date.split("T")[0] if "T" in report_date else report_date
    date_field = f" |date={formatted_date}" if formatted_date else ""

    citation_template = f"""{{{{cite web{author_fields} |title={report_title} |url=https://crsreports.congress.gov/product/details?prodId={report_id} |publisher=Congressional Research Service{date_field} |access-date=2026-03-18}}}}"""

    # Extract section structure
    sections = _extract_sections(wiki_content)
    section_list = "\n".join(f"  {'#' * s['level']} {s['name']}" for s in sections) if sections else "  (no section headers found)"

    prompt = f"""You are generating specific Wikipedia edit suggestions to incorporate information from a CRS report.

## CRS Report
Title: {report_title}
Report ID: {report_id}
Published: {report_date or 'Unknown'}
Summary: {report_summary[:2000] if report_summary else 'Not available'}
Content excerpt: {report_content_snippet[:4000] if report_content_snippet else 'Not available'}

## Wikipedia Article: {wiki_title}
### Existing section structure:
{section_list}

### Current content (partial):
{wiki_content[:5000]}

## Identified Gaps
{gaps_text}

## CRITICAL RULES FOR GENERATING SUGGESTIONS

1. **Attribution**: The CRS report is a SECONDARY source. When it discusses laws, executive orders, regulations, or other primary documents, frame claims as "According to a Congressional Research Service report..." or "The Congressional Research Service notes that...". Do NOT present CRS analysis as if it were primary fact.

2. **NPOV**: Write in Wikipedia's neutral point of view. No advocacy, no editorializing.

3. **Placement**: Specify the EXACT existing section where the edit should go. Reference the section structure above. If creating a new subsection, specify which existing section it should be placed under or after.

4. **Only include information that is ACTUALLY in the CRS report content provided above.** Do not infer, extrapolate, or add information not present in the excerpt. If you're unsure whether something is in the report, don't include it.

5. **Citation format**: Use this exact citation:
<ref>{citation_template}</ref>

6. **Style**: Match the existing article's tone and level of detail.

Return as JSON:
{{
    "suggestions": [
        {{
            "target_section": "<exact name of existing section, or 'New subsection under [Section]'>",
            "action": "<add|expand|update>",
            "description": "<what this edit does, in plain English>",
            "importance": "<high|medium|low>",
            "placement": "<specific guidance: 'Add after the paragraph about X' or 'Insert before the sentence about Y' or 'New paragraph at end of section'>",
            "wikitext": "<the actual wikitext to add, including the <ref> citation>"
        }}
    ]
}}

Return ONLY valid JSON. Generate 3-6 high-quality suggestions."""

    response = client.messages.create(
        model=MODEL,
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    try:
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(text)
    except json.JSONDecodeError:
        return {"suggestions": [], "error": "Failed to parse suggestions"}
