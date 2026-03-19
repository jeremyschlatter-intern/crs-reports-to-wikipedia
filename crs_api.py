"""Client for the Congress.gov API to fetch CRS reports."""

import os
import requests
import time
import threading

API_KEY = os.environ.get("CONGRESS_API_KEY", "DEMO_KEY")
BASE_URL = "https://api.congress.gov/v3"

# Simple in-memory cache
_cache = {}
_cache_ttl = 600  # 10 minutes

# Local index of all report titles for fast search
_report_index = []
_index_lock = threading.Lock()
_index_built = False


def _get(url, params=None):
    """Make a GET request to the Congress.gov API with caching."""
    if params is None:
        params = {}
    params["api_key"] = API_KEY
    params["format"] = "json"

    cache_key = f"{url}?{'&'.join(f'{k}={v}' for k, v in sorted(params.items()))}"
    now = time.time()
    if cache_key in _cache and now - _cache[cache_key]["time"] < _cache_ttl:
        return _cache[cache_key]["data"]

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    _cache[cache_key] = {"data": data, "time": now}
    return data


def _build_index():
    """Build a local index of report titles for fast search.
    Fetches the first 2000 reports (sorted by most recently updated)."""
    global _report_index, _index_built
    all_reports = []
    offset = 0
    batch_size = 250
    max_reports = 2000

    while offset < max_reports:
        try:
            url = f"{BASE_URL}/crsreport"
            data = _get(url, {"limit": batch_size, "offset": offset})
            reports = data.get("CRSReports", data.get("crsReports", []))
            if not reports:
                break
            all_reports.extend(reports)
            offset += batch_size
        except Exception:
            break

    with _index_lock:
        _report_index = all_reports
        _index_built = True


def ensure_index():
    """Ensure the report index is built (starts building in background on first call)."""
    global _index_built
    if not _index_built:
        # Build in background
        t = threading.Thread(target=_build_index, daemon=True)
        t.start()


def search_reports(query, limit=20, offset=0):
    """Search CRS reports by keyword.

    Uses the local index if available, otherwise fetches from API.
    Searches report titles for matching keywords.
    """
    query = query.strip()
    if not query:
        return list_reports(limit=limit, offset=offset)

    # Try local index first
    with _index_lock:
        if _index_built and _report_index:
            query_words = query.lower().split()
            results = []
            for r in _report_index:
                title = r.get("title", "").lower()
                if all(word in title for word in query_words):
                    results.append(r)
            total = len(results)
            return results[offset:offset + limit], {"count": total}

    # Fallback: fetch a larger batch and filter
    url = f"{BASE_URL}/crsreport"
    all_results = []
    for batch_offset in range(0, 500, 250):
        try:
            data = _get(url, {"limit": 250, "offset": batch_offset})
            reports = data.get("CRSReports", data.get("crsReports", []))
            if not reports:
                break
            all_results.extend(reports)
        except Exception:
            break

    query_words = query.lower().split()
    filtered = [r for r in all_results
                if all(word in r.get("title", "").lower() for word in query_words)]
    total = len(filtered)
    return filtered[offset:offset + limit], {"count": total}


def list_reports(limit=20, offset=0):
    """List CRS reports with pagination."""
    url = f"{BASE_URL}/crsreport"
    params = {"limit": min(limit, 250), "offset": offset}
    data = _get(url, params)
    reports = data.get("CRSReports", data.get("crsReports", []))
    pagination = data.get("pagination", {})
    return reports, pagination


def get_report(report_id):
    """Get detailed information about a specific CRS report."""
    url = f"{BASE_URL}/crsreport/{report_id}"
    data = _get(url)
    report = data.get("CRSReport", data.get("crsReport", data))
    return report


def get_report_html_content(report_id):
    """Try to fetch the HTML content of a CRS report."""
    try:
        report = get_report(report_id)
        formats = report.get("formats", [])
        html_url = None
        for fmt in formats:
            if fmt.get("format", "").upper() == "HTML":
                html_url = fmt.get("url")

        if html_url:
            resp = requests.get(html_url, timeout=30)
            if resp.status_code == 200:
                return resp.text

        # Try EveryCRSReport as fallback
        ever_url = f"https://www.everycrsreport.com/reports/{report_id}.html"
        resp = requests.get(ever_url, timeout=30)
        if resp.status_code == 200:
            return resp.text

    except Exception:
        pass
    return None
