// CRS Reports to Wikipedia - Frontend Logic

const state = {
    reports: [],
    selectedReport: null,
    wikiMatches: [],
    selectedWikiArticle: null,
    analysis: null,
    suggestions: [],
    currentStep: 1,
    offset: 0,
    totalReports: 0,
    loading: {},
    lastQuery: '',
};

const PAGE_SIZE = 25;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function updateWorkflowSteps() {
    $$('.workflow-step').forEach((step, i) => {
        const stepNum = i + 1;
        step.classList.remove('active', 'completed');
        if (stepNum < state.currentStep) step.classList.add('completed');
        else if (stepNum === state.currentStep) step.classList.add('active');
    });
}

function setStep(step) {
    state.currentStep = step;
    updateWorkflowSteps();
    $('#panel-search').classList.toggle('panel-hidden', step > 1);
    $('#panel-report-detail').classList.toggle('panel-hidden', step < 2);
    $('#panel-matches').classList.toggle('panel-hidden', step < 2);
    $('#panel-analysis').classList.toggle('panel-hidden', step < 3);
}

// ====== Step 1: Search Reports ======

async function searchReports(newSearch = true) {
    if (newSearch) {
        state.offset = 0;
    }
    const query = $('#search-input').value.trim();
    state.lastQuery = query;
    state.loading.search = true;
    renderReportList();

    try {
        const params = new URLSearchParams({
            q: query,
            limit: PAGE_SIZE,
            offset: state.offset,
        });
        const resp = await fetch(`/api/search-reports?${params}`);
        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        state.reports = data.reports || [];
        state.totalReports = data.pagination?.count || state.reports.length;
    } catch (err) {
        state.reports = [];
        renderError('report-list', err.message);
        return;
    } finally {
        state.loading.search = false;
    }
    renderReportList();
}

function renderReportList() {
    const container = $('#report-list');
    if (state.loading.search) {
        container.innerHTML = `<div class="loading"><div class="spinner"></div>Searching CRS reports...</div>`;
        return;
    }

    if (state.reports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">&#x1F4DC;</div>
                <h3>No reports found</h3>
                <p>Try different keywords, or browse recent reports by clearing the search.</p>
            </div>`;
        return;
    }

    let html = state.reports.map(r => {
        const id = r.id || r.number || '';
        const title = r.title || 'Untitled';
        const date = r.updateDate || r.publishDate || '';
        const type = r.contentType || '';
        const typeClass = type === 'Resources' ? 'data' : 'context';
        return `
            <div class="report-item" onclick="selectReport('${escapeAttr(id)}')">
                <span class="report-title">${escapeHtml(title)}</span>
                <span class="report-meta">
                    ${type ? `<span class="gap-type ${typeClass}" style="font-size:0.65rem">${escapeHtml(type)}</span>` : ''}
                    <span class="report-id">${escapeHtml(id)}</span>
                    ${date ? `<span>${formatDate(date)}</span>` : ''}
                </span>
            </div>`;
    }).join('');

    // Pagination
    const totalPages = Math.ceil(state.totalReports / PAGE_SIZE);
    const currentPage = Math.floor(state.offset / PAGE_SIZE) + 1;
    if (totalPages > 1) {
        html += `<div class="pagination">`;
        if (currentPage > 1) {
            html += `<button class="btn btn-sm btn-outline" onclick="changePage(${currentPage - 1})">Previous</button>`;
        }
        html += `<span class="info-text" style="align-self:center">Page ${currentPage} of ${totalPages} (${state.totalReports.toLocaleString()} reports)</span>`;
        if (currentPage < totalPages) {
            html += `<button class="btn btn-sm btn-outline" onclick="changePage(${currentPage + 1})">Next</button>`;
        }
        html += `</div>`;
    }

    container.innerHTML = html;
}

function changePage(page) {
    state.offset = (page - 1) * PAGE_SIZE;
    searchReports(false);
}

async function selectReport(reportId) {
    state.loading.report = true;
    setStep(2);
    $('#report-detail').innerHTML = `<div class="loading"><div class="spinner"></div>Loading report details...</div>`;
    $('#wiki-matches').innerHTML = `<div class="loading"><div class="spinner"></div>Waiting for report details...</div>`;

    try {
        const resp = await fetch(`/api/report/${encodeURIComponent(reportId)}`);
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        state.selectedReport = data.report;
        renderSelectedReport();
        findWikiMatches();
    } catch (err) {
        $('#report-detail').innerHTML = `<div class="error-message">Error loading report: ${escapeHtml(err.message)}</div>
            <button class="btn btn-sm btn-outline" onclick="goBack()">Back to Search</button>`;
    } finally {
        state.loading.report = false;
    }
}

function renderSelectedReport() {
    const r = state.selectedReport;
    if (!r) return;

    const id = r.id || r.number || '';
    const title = r.title || 'Untitled';
    const summary = r.summary || 'No summary available.';
    const topics = r.topics || [];
    const authors = r.authors || [];
    const date = r.updateDate || r.publishDate || '';
    const status = r.status || '';

    const topicsList = topics.map(t => {
        const name = typeof t === 'string' ? t : t.topic || t.name || '';
        return `<span class="gap-type context">${escapeHtml(name)}</span>`;
    }).join(' ');

    const authorsList = authors.map(a => {
        const name = typeof a === 'string' ? a : a.author || a.name || '';
        return escapeHtml(name);
    }).join(', ');

    $('#report-detail').innerHTML = `
        <div class="selected-report-banner">
            <span class="report-id">${escapeHtml(id)}</span>
            <span class="title">${escapeHtml(title)}</span>
            <button class="btn btn-sm btn-outline" onclick="goBack()">Change Report</button>
        </div>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem">
            ${date ? `<span class="info-text">Updated: ${formatDate(date)}</span>` : ''}
            ${authorsList ? `<span class="info-text">By: ${authorsList}</span>` : ''}
            ${status ? `<span class="info-text">Status: ${status}</span>` : ''}
        </div>
        ${topicsList ? `<div style="margin-bottom: 0.75rem">${topicsList}</div>` : ''}
        <details style="margin-bottom: 0.75rem">
            <summary style="cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--primary)">Report Summary</summary>
            <p style="font-size: 0.85rem; line-height: 1.6; margin-top: 0.5rem; padding: 0.75rem; background: #f8f9fa; border-radius: 6px">${escapeHtml(summary)}</p>
        </details>
        <a href="https://crsreports.congress.gov/product/details?prodId=${encodeURIComponent(id)}" target="_blank" class="btn btn-sm btn-outline">
            View Full Report on Congress.gov &rarr;
        </a>`;
}

function goBack() {
    state.selectedReport = null;
    state.wikiMatches = [];
    state.analysis = null;
    state.suggestions = [];
    state.selectedWikiArticle = null;
    setStep(1);
}

// ====== Step 2: Find Wikipedia Matches ======

async function findWikiMatches() {
    const r = state.selectedReport;
    if (!r) return;

    state.loading.matches = true;
    renderWikiMatches();

    const topics = (r.topics || []).map(t => typeof t === 'string' ? t : t.topic || t.name || '');

    try {
        const resp = await fetch('/api/find-wikipedia-matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: r.title || '',
                summary: r.summary || '',
                topics: topics,
            }),
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        state.wikiMatches = data.matches || [];
    } catch (err) {
        state.wikiMatches = [];
        $('#wiki-matches').innerHTML = `<div class="error-message">Error finding matches: ${escapeHtml(err.message)}</div>`;
        return;
    } finally {
        state.loading.matches = false;
    }
    renderWikiMatches();
}

function renderWikiMatches() {
    const container = $('#wiki-matches');
    if (state.loading.matches) {
        container.innerHTML = `<div class="loading"><div class="spinner"></div>AI is finding relevant Wikipedia articles... (this may take 15-30 seconds)</div>`;
        return;
    }

    if (state.wikiMatches.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">&#x1F50D;</div>
                <h3>No matches found</h3>
                <p>No Wikipedia articles were found matching this report.</p>
            </div>`;
        return;
    }

    // Sort: articles without CRS citations first (more opportunity for improvement)
    const sorted = [...state.wikiMatches].sort((a, b) => a.existing_crs_citations - b.existing_crs_citations);

    container.innerHTML = `
        <p class="info-text">Found ${sorted.length} matching articles. Articles without existing CRS citations have the most opportunity for improvement.</p>
        ${sorted.map((m, i) => {
            const realIdx = state.wikiMatches.indexOf(m);
            const citBadge = m.existing_crs_citations > 0
                ? `<span class="crs-citation-badge has-citations">${m.existing_crs_citations} CRS ref(s)</span>`
                : `<span class="crs-citation-badge no-citations">No CRS refs</span>`;

            return `
                <div class="wiki-match">
                    <div class="wiki-match-header">
                        <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(m.title)}" target="_blank" class="wiki-match-title">${escapeHtml(m.title)}</a>
                        ${citBadge}
                    </div>
                    <div class="wiki-match-snippet">${escapeHtml(m.extract || m.snippet || '')}</div>
                    <div style="display:flex; gap:0.5rem; align-items:center">
                        <button class="btn btn-sm btn-accent" onclick="analyzeMatch(${realIdx})">
                            Analyze &amp; Suggest Edits
                        </button>
                        <span class="info-text" style="margin:0">Matched: "${escapeHtml(m.matched_query || '')}"</span>
                    </div>
                </div>`;
        }).join('')}`;
}

// ====== Step 3: Analyze & Generate Suggestions ======

async function analyzeMatch(matchIndex) {
    const r = state.selectedReport;
    const match = state.wikiMatches[matchIndex];
    if (!r || !match) return;

    state.selectedWikiArticle = match;
    setStep(3);
    state.loading.analysis = true;
    renderAnalysis();

    try {
        const resp = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                report_id: r.id || r.number || '',
                report_title: r.title || '',
                report_summary: r.summary || '',
                report_date: r.publishDate || r.updateDate || '',
                report_authors: r.authors || [],
                wiki_title: match.title,
            }),
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        state.analysis = data.analysis;
        state.suggestions = data.suggestions || [];
    } catch (err) {
        state.analysis = null;
        state.suggestions = [];
        $('#analysis-content').innerHTML = `<div class="error-message">Error during analysis: ${escapeHtml(err.message)}</div>
            <button class="btn btn-outline" onclick="backToMatches()" style="margin-top:1rem">Back to Matches</button>`;
        return;
    } finally {
        state.loading.analysis = false;
    }
    renderAnalysis();
}

function renderAnalysis() {
    const container = $('#analysis-content');

    if (state.loading.analysis) {
        container.innerHTML = `
            <div class="loading" style="flex-direction:column; padding: 3rem">
                <div class="spinner" style="width:32px;height:32px;border-width:4px"></div>
                <div style="text-align:center">
                    <strong>AI is analyzing this report against Wikipedia...</strong><br>
                    <span style="font-size:0.82rem">Reading the CRS report, comparing with the Wikipedia article, identifying gaps, and generating edit suggestions. This typically takes 30-60 seconds.</span>
                </div>
            </div>`;
        return;
    }

    if (!state.analysis) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No analysis yet</h3>
                <p>Click "Analyze & Suggest Edits" on a Wikipedia article to begin.</p>
            </div>`;
        return;
    }

    const a = state.analysis;
    const score = a.relevance_score || 0;
    const scoreColor = score >= 7 ? '#27ae60' : score >= 4 ? '#f39c12' : '#e74c3c';
    const wikiTitle = state.selectedWikiArticle?.title || '';
    const reportId = state.selectedReport?.id || state.selectedReport?.number || '';

    let html = `
        <div style="margin-bottom: 1.25rem">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem">
                <h3 style="margin:0">
                    <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}" target="_blank" style="color: var(--primary)">${escapeHtml(wikiTitle)}</a>
                </h3>
                <div class="relevance-score">
                    ${score}/10
                    <div class="relevance-bar">
                        <div class="relevance-fill" style="width: ${score * 10}%; background: ${scoreColor}"></div>
                    </div>
                </div>
            </div>
            <p class="info-text">${escapeHtml(a.relevance_explanation || '')}</p>
        </div>`;

    // Gaps section
    const gaps = a.gaps || [];
    if (gaps.length > 0) {
        html += `
            <div style="margin-bottom: 1.25rem">
                <h4 style="margin-bottom: 0.5rem">${gaps.length} Information Gap${gaps.length === 1 ? '' : 's'} Identified</h4>
                <div class="scrollable" style="max-height: 280px">
                    ${gaps.map(gap => `
                        <div class="gap-item">
                            <div style="margin-bottom: 0.3rem">
                                <span class="gap-type ${gap.type || ''}">${escapeHtml(gap.type || 'info')}</span>
                                <span class="importance-badge ${gap.importance || ''}">${escapeHtml(gap.importance || '')}</span>
                                <span style="font-size:0.75rem; color:var(--primary); float:right">Section: ${escapeHtml(gap.suggested_section || 'General')}</span>
                            </div>
                            <div style="font-size:0.85rem; font-weight:600; margin-bottom:0.25rem">${escapeHtml(gap.description || '')}</div>
                            <div style="font-size:0.8rem; color:var(--text-light)">${escapeHtml(gap.source_detail || '')}</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    // Suggestions section
    if (state.suggestions.length > 0) {
        html += `
            <div>
                <div class="verification-warning">
                    <strong>Verify before editing Wikipedia:</strong> These suggestions are AI-generated drafts. Before applying any edit, please:
                    (1) Read the relevant section of the <a href="https://crsreports.congress.gov/product/details?prodId=${encodeURIComponent(reportId)}" target="_blank">original CRS report</a> to confirm the information is accurate;
                    (2) Check that the claim is properly attributed to the CRS report, not presented as independent fact;
                    (3) Ensure the edit fits naturally into the existing article structure.
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem">
                    <h4>${state.suggestions.length} Edit Suggestion${state.suggestions.length === 1 ? '' : 's'}</h4>
                    <button class="btn btn-sm btn-accent" onclick="copyAllSuggestions()">Copy All Wikitext</button>
                </div>
                ${state.suggestions.map((s, i) => `
                    <div class="suggestion-card">
                        <div class="suggestion-header">
                            <div>
                                <span class="suggestion-action ${s.action || ''}">${escapeHtml(s.action || 'add')}</span>
                                <span class="suggestion-section" style="margin-left:0.5rem">${escapeHtml(s.target_section || 'General')}</span>
                            </div>
                            <span class="importance-badge ${s.importance || ''}">${escapeHtml(s.importance || '')}</span>
                        </div>
                        <div class="suggestion-body">
                            <div class="suggestion-desc">${escapeHtml(s.description || '')}</div>
                            ${s.placement ? `<div class="placement-note">${escapeHtml(s.placement)}</div>` : ''}
                            <div class="wikitext-block">${escapeHtml(s.wikitext || '')}</div>
                            <div class="copy-btn-wrapper" style="gap:0.5rem">
                                <a href="https://crsreports.congress.gov/product/details?prodId=${encodeURIComponent(reportId)}" target="_blank" class="btn btn-sm btn-outline" style="font-size:0.75rem">Read Source Report</a>
                                <button class="btn btn-sm btn-copy" onclick="copySuggestion(${i}, this)">Copy wikitext</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    } else if (score < 3) {
        html += `<p class="info-text">This CRS report has low relevance to this Wikipedia article. Try a different article.</p>`;
    }

    // Navigation
    html += `
        <div style="display:flex; gap:0.75rem; margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--border)">
            <button class="btn btn-outline" onclick="backToMatches()">Back to Matches</button>
            <a href="https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(wikiTitle)}&action=edit" target="_blank" class="btn btn-primary">
                Edit on Wikipedia &rarr;
            </a>
        </div>`;

    container.innerHTML = html;
}

function backToMatches() {
    state.analysis = null;
    state.suggestions = [];
    state.selectedWikiArticle = null;
    setStep(2);
}

// ====== Copy functionality ======

function copySuggestion(index, buttonEl) {
    const s = state.suggestions[index];
    if (!s) return;
    navigator.clipboard.writeText(s.wikitext || '').then(() => {
        if (buttonEl) {
            buttonEl.textContent = 'Copied!';
            buttonEl.classList.add('copied');
            setTimeout(() => {
                buttonEl.textContent = 'Copy wikitext';
                buttonEl.classList.remove('copied');
            }, 2000);
        }
        showToast('Wikitext copied to clipboard!');
    });
}

function copyAllSuggestions() {
    const reportTitle = state.selectedReport?.title || '';
    const reportId = state.selectedReport?.id || state.selectedReport?.number || '';
    const wikiTitle = state.selectedWikiArticle?.title || '';

    let header = `== Suggested edits for "${wikiTitle}" ==\n`;
    header += `Source: CRS Report ${reportId} - "${reportTitle}"\n`;
    header += `Generated by CRS Reports to Wikipedia tool\n\n`;

    const allText = header + state.suggestions.map((s, i) => {
        return `=== ${i + 1}. ${s.action?.toUpperCase() || 'ADD'} - ${s.target_section || 'General'} ===\n${s.description || ''}\n\n${s.wikitext || ''}`;
    }).join('\n\n' + '='.repeat(40) + '\n\n');

    navigator.clipboard.writeText(allText).then(() => {
        showToast('All suggestions copied to clipboard!');
    });
}

// ====== Lookup by report ID ======
async function lookupReportById() {
    const input = $('#report-id-input').value.trim();
    if (!input) return;
    await selectReport(input);
}

// ====== Topic Discovery ======

async function loadTopics() {
    try {
        const resp = await fetch('/api/topics');
        const data = await resp.json();
        const topics = data.topics || [];
        const grid = $('#topic-grid');
        grid.innerHTML = topics.map(t =>
            `<span class="topic-chip" onclick="discoverTopic(this, '${escapeAttr(t)}')">${escapeHtml(t)}</span>`
        ).join('');
    } catch (err) {
        $('#topic-grid').innerHTML = `<div class="error-message">Error loading topics</div>`;
    }
}

async function discoverTopic(el, topic) {
    // Toggle active state
    $$('.topic-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    const container = $('#discover-results');
    container.innerHTML = `<div class="loading"><div class="spinner"></div>Finding opportunities for "${escapeHtml(topic)}"... (checking Wikipedia for CRS citation gaps)</div>`;

    try {
        const resp = await fetch('/api/discover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, limit: 5 }),
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        const opps = data.opportunities || [];
        if (opps.length === 0) {
            container.innerHTML = `<p class="info-text">No opportunities found for this topic. Try another.</p>`;
            return;
        }

        container.innerHTML = `
            <h4 style="margin: 0.75rem 0 0.5rem">${opps.length} Opportunities Found</h4>
            <p class="info-text">These Wikipedia articles relate to CRS reports on "${escapeHtml(topic)}" and may benefit from additional CRS-sourced content.</p>
            ${opps.map(o => {
                const citBadge = o.existing_crs_citations > 0
                    ? `<span class="crs-citation-badge has-citations">${o.existing_crs_citations} CRS ref(s)</span>`
                    : `<span class="crs-citation-badge no-citations">No CRS refs</span>`;
                return `
                    <div class="opportunity-item">
                        <div class="opp-left">
                            <div class="opp-wiki">
                                <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(o.wiki_title)}" target="_blank" style="color:var(--primary)">${escapeHtml(o.wiki_title)}</a>
                                ${citBadge}
                            </div>
                            <div class="opp-report">CRS: ${escapeHtml(o.report_id)} &mdash; ${escapeHtml(o.report_title)}</div>
                        </div>
                        <button class="btn btn-sm btn-accent" onclick="selectReportAndAnalyze('${escapeAttr(o.report_id)}', '${escapeAttr(o.wiki_title)}')">
                            Analyze
                        </button>
                    </div>`;
            }).join('')}`;
    } catch (err) {
        container.innerHTML = `<div class="error-message">Error: ${escapeHtml(err.message)}</div>`;
    }
}

async function selectReportAndAnalyze(reportId, wikiTitle) {
    // First load the report
    await selectReport(reportId);
    // Then find the wiki article in matches or create a synthetic match
    if (state.selectedReport) {
        const matchIdx = state.wikiMatches.findIndex(m => m.title === wikiTitle);
        if (matchIdx >= 0) {
            await analyzeMatch(matchIdx);
        } else {
            // Add the Wikipedia article as a match and analyze it
            state.wikiMatches.unshift({
                title: wikiTitle,
                extract: '',
                existing_crs_citations: 0,
                matched_query: 'topic discovery',
            });
            await analyzeMatch(0);
        }
    }
}

// ====== Utilities ======

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

function renderError(containerId, message) {
    const container = $(`#${containerId}`);
    if (container) {
        container.innerHTML = `<div class="error-message">Error: ${escapeHtml(message)}</div>`;
    }
}

// ====== Initialization ======

document.addEventListener('DOMContentLoaded', () => {
    $('#search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchReports();
    });
    $('#report-id-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') lookupReportById();
    });
    setStep(1);
    searchReports();
    loadTopics();
});
