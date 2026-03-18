"""Client for the Wikipedia/MediaWiki API."""

import requests
from bs4 import BeautifulSoup

API_URL = "https://en.wikipedia.org/w/api.php"
HEADERS = {
    "User-Agent": "CRSReportsToWikipedia/1.0 (https://github.com/leg-tech; crs-wiki-tool@example.com)"
}


def _get(params):
    """Make a GET request with proper User-Agent header."""
    resp = requests.get(API_URL, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def search_articles(query, limit=10):
    """Search Wikipedia for articles matching a query."""
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srlimit": limit,
        "srprop": "snippet|size|wordcount|timestamp",
    }
    data = _get(params)
    results = data.get("query", {}).get("search", [])
    # Clean HTML from snippets
    for r in results:
        if "snippet" in r:
            r["snippet"] = BeautifulSoup(r["snippet"], "html.parser").get_text()
    return results


def get_article_content(title):
    """Get the full wikitext content of a Wikipedia article."""
    params = {
        "action": "query",
        "format": "json",
        "titles": title,
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "formatversion": "2",
    }
    data = _get(params)
    pages = data.get("query", {}).get("pages", [])
    if pages:
        page = pages[0]
        revisions = page.get("revisions", [])
        if revisions:
            slots = revisions[0].get("slots", {})
            main = slots.get("main", {})
            return main.get("content", "")
    return ""


def get_article_extract(title, sentences=5):
    """Get a plain-text extract (summary) of a Wikipedia article."""
    params = {
        "action": "query",
        "format": "json",
        "titles": title,
        "prop": "extracts",
        "exsentences": sentences,
        "explaintext": True,
        "formatversion": "2",
    }
    data = _get(params)
    pages = data.get("query", {}).get("pages", [])
    if pages:
        return pages[0].get("extract", "")
    return ""


def get_article_sections(title):
    """Get the section structure of a Wikipedia article."""
    params = {
        "action": "parse",
        "format": "json",
        "page": title,
        "prop": "sections",
    }
    data = _get(params)
    return data.get("parse", {}).get("sections", [])


def get_article_references(title):
    """Extract existing references/citations from a Wikipedia article."""
    content = get_article_content(title)
    if not content:
        return []

    refs = []
    # Simple extraction of ref tags
    import re
    ref_pattern = re.compile(r'<ref[^>]*>(.*?)</ref>', re.DOTALL)
    for match in ref_pattern.finditer(content):
        refs.append(match.group(1).strip())
    return refs


def check_crs_citations(title):
    """Check if a Wikipedia article already cites CRS reports."""
    content = get_article_content(title)
    if not content:
        return []

    crs_refs = []
    lower_content = content.lower()
    # Look for CRS-related citations
    markers = [
        "congressional research service",
        "crsreports.congress.gov",
        "everycrsreport.com",
        "crs report",
    ]
    import re
    ref_pattern = re.compile(r'<ref[^>]*>(.*?)</ref>', re.DOTALL)
    for match in ref_pattern.finditer(content):
        ref_text = match.group(1).lower()
        if any(marker in ref_text for marker in markers):
            crs_refs.append(match.group(1).strip())
    return crs_refs


def get_article_info(title):
    """Get metadata about a Wikipedia article."""
    params = {
        "action": "query",
        "format": "json",
        "titles": title,
        "prop": "info|categories|pageprops",
        "inprop": "url|protection",
        "cllimit": 50,
        "formatversion": "2",
    }
    data = _get(params)
    pages = data.get("query", {}).get("pages", [])
    if pages:
        return pages[0]
    return {}
