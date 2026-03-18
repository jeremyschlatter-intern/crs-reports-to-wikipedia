"""Flask web application for CRS Reports to Wikipedia."""

from flask import Flask, render_template, request, jsonify
import crs_api
import wikipedia_api
import analyzer
import traceback

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/search-reports")
def api_search_reports():
    """Search CRS reports by keyword or list recent."""
    query = request.args.get("q", "").strip()
    limit = int(request.args.get("limit", 25))
    offset = int(request.args.get("offset", 0))
    try:
        if query:
            reports, pagination = crs_api.search_reports(query, limit=limit, offset=offset)
        else:
            reports, pagination = crs_api.list_reports(limit=limit, offset=offset)
        return jsonify({"reports": reports, "pagination": pagination})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/report/<path:report_id>")
def api_get_report(report_id):
    """Get detailed information about a CRS report."""
    try:
        report = crs_api.get_report(report_id)
        return jsonify({"report": report})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/find-wikipedia-matches", methods=["POST"])
def api_find_wikipedia_matches():
    """Find Wikipedia articles that match a CRS report."""
    data = request.get_json()
    report_title = data.get("title", "")
    report_summary = data.get("summary", "")
    report_topics = data.get("topics", [])

    try:
        # Use AI to generate search queries
        queries = analyzer.find_matching_wikipedia_topics(
            report_title, report_summary, report_topics
        )

        # Search Wikipedia for each query, dedup results
        all_results = []
        seen_titles = set()
        for query in queries[:6]:
            results = wikipedia_api.search_articles(query, limit=5)
            for r in results:
                if r["title"] not in seen_titles:
                    seen_titles.add(r["title"])
                    r["matched_query"] = query
                    r["extract"] = wikipedia_api.get_article_extract(
                        r["title"], sentences=2
                    )
                    crs_refs = wikipedia_api.check_crs_citations(r["title"])
                    r["existing_crs_citations"] = len(crs_refs)
                    all_results.append(r)

        return jsonify({"matches": all_results, "queries_used": queries})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """Analyze gaps between a CRS report and a Wikipedia article."""
    data = request.get_json()
    report_id = data.get("report_id", "")
    report_title = data.get("report_title", "")
    report_summary = data.get("report_summary", "")
    report_date = data.get("report_date", "")
    report_authors = data.get("report_authors", [])
    wiki_title = data.get("wiki_title", "")

    try:
        # Get CRS report content
        report_content = crs_api.get_report_html_content(report_id)
        if report_content:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(report_content, "html.parser")
            report_text = soup.get_text(separator="\n", strip=True)[:8000]
        else:
            report_text = report_summary

        # Get Wikipedia article content
        wiki_content = wikipedia_api.get_article_content(wiki_title)
        existing_crs_refs = wikipedia_api.check_crs_citations(wiki_title)

        # Analyze gaps
        gap_analysis = analyzer.analyze_gap(
            report_title, report_summary, report_text,
            wiki_title, wiki_content, existing_crs_refs
        )

        # Generate edit suggestions for relevant matches
        suggestions = {"suggestions": []}
        if gap_analysis.get("relevance_score", 0) >= 3:
            high_gaps = [g for g in gap_analysis.get("gaps", [])
                         if g.get("importance") in ("high", "medium")]
            if high_gaps:
                suggestions = analyzer.generate_edit_suggestions(
                    report_title, report_id, report_summary, report_text,
                    report_date, wiki_title, wiki_content, high_gaps,
                    authors=report_authors
                )

        return jsonify({
            "analysis": gap_analysis,
            "suggestions": suggestions.get("suggestions", []),
            "existing_crs_citations": len(existing_crs_refs),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/topics")
def api_topics():
    """Get the list of CRS topic areas for browsing."""
    # These are the standard CRS topic areas from Congress.gov
    topics = [
        "Agriculture & Food",
        "Armed Forces & National Security",
        "Civil Rights & Liberties",
        "Commerce",
        "Congress",
        "Crime & Law Enforcement",
        "Economics & Public Finance",
        "Education",
        "Emergency Management",
        "Energy",
        "Environmental Protection",
        "Families",
        "Finance & Financial Sector",
        "Foreign Trade & International Finance",
        "Government Operations & Politics",
        "Health",
        "Housing & Community Development",
        "Immigration",
        "International Affairs",
        "Labor & Employment",
        "Latin America, Caribbean & Canada",
        "Law",
        "Native Americans",
        "Public Lands & Natural Resources",
        "Science, Technology & Communications",
        "Social Welfare",
        "Taxation",
        "Transportation & Public Works",
        "Water Resources Development",
    ]
    return jsonify({"topics": topics})


@app.route("/api/discover", methods=["POST"])
def api_discover():
    """Discover Wikipedia articles that could benefit from CRS reports on a topic.

    Finds recent CRS reports on the topic, then checks which Wikipedia articles
    on the same subject lack CRS citations.
    """
    data = request.get_json()
    topic = data.get("topic", "")
    limit = int(data.get("limit", 5))

    try:
        # Search for reports on this topic
        reports, _ = crs_api.search_reports(topic, limit=limit)
        if not reports:
            # Try with just the first word
            reports, _ = crs_api.list_reports(limit=10)
            topic_lower = topic.lower()
            reports = [r for r in reports
                       if any(topic_lower in (t.get("topic", "") if isinstance(t, dict) else t).lower()
                              for t in (r.get("topics", []) or []))][:limit]

        opportunities = []
        for report in reports[:limit]:
            rid = report.get("id", report.get("number", ""))
            title = report.get("title", "")

            # Search Wikipedia for this topic
            wiki_results = wikipedia_api.search_articles(title, limit=3)
            for wr in wiki_results[:2]:
                crs_refs = wikipedia_api.check_crs_citations(wr["title"])
                extract = wikipedia_api.get_article_extract(wr["title"], sentences=2)
                opportunities.append({
                    "report_id": rid,
                    "report_title": title,
                    "report_date": report.get("publishDate", ""),
                    "wiki_title": wr["title"],
                    "wiki_extract": extract,
                    "existing_crs_citations": len(crs_refs),
                    "wiki_wordcount": wr.get("wordcount", 0),
                })

        # Sort by opportunity: no CRS citations first, then by article size
        opportunities.sort(key=lambda x: (x["existing_crs_citations"], -x["wiki_wordcount"]))

        return jsonify({"opportunities": opportunities, "topic": topic})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Start building the report index in background
    crs_api.ensure_index()
    app.run(host="0.0.0.0", port=8847, debug=True)
