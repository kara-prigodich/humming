import os
import sys
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, date, timezone
from flask import Flask, jsonify, render_template_string
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

load_dotenv()

app = Flask(__name__)

# ── Config ──────────────────────────────────────────────────────────────────
API_KEY = os.getenv("FRESHSERVICE_API_KEY")
DOMAIN  = os.getenv("FRESHSERVICE_DOMAIN")

# Custom-field slugs as they appear in the FreshService API response.
# Find yours via GET /api/debug, then override with env vars.
FIELD_START_DATE = os.getenv("FS_FIELD_START_DATE", "start_date")
FIELD_END_DATE   = os.getenv("FS_FIELD_END_DATE",   "experiment_end_date")

# Ticket filters — only these tickets are shown in the dashboard.
TICKET_TYPE           = os.getenv("FS_TICKET_TYPE",    "Service Request")
TICKET_SUBJECT_FILTER = os.getenv("FS_SUBJECT_FILTER", "Request SaaS Application for Experimentation")

# Daily auto-refresh time (24-hour HH:MM, server local time). Default: 08:00.
REFRESH_TIME = os.getenv("REFRESH_TIME", "08:00")

# Manual application name overrides for tickets submitted before the field existed.
# Key = requester name as it appears in the subject ("Request for <Name> : ...").
# Remove an entry once the requester updates their ticket in FreshService.
_APP_NAME_OVERRIDES = {
    "Trent Joseph":              "No tool listed",
    "Erin Gunderson":            "Yoturi",
    "Katie Freeman":             "Uplimit",
    "Adrienne Moore - Cornwell": "Uncertain",
    "Aaron Bohler":              "Not real",
    "Brittany Frazier":          "Claude",
    "Tami Burge":                "1st Dragon",
    "Charlie Bauer":             "NotebookLM",
    "Katie Dasso":               "Gamma",
}
# ────────────────────────────────────────────────────────────────────────────

_MISSING = [v for v in ("FRESHSERVICE_API_KEY", "FRESHSERVICE_DOMAIN") if not os.getenv(v)]
if _MISSING:
    sys.exit(f"ERROR: Missing required environment variables: {', '.join(_MISSING)}\n"
             "Copy .env.example to .env and fill in the values.")


# ── FreshService helpers ─────────────────────────────────────────────────────

def _fs_auth():
    """requests auth tuple — handles Base64 encoding automatically."""
    return (API_KEY, "X")


def _matches_filter(ticket):
    """Return True if a ticket matches the configured type and subject filter."""
    type_ok    = not TICKET_TYPE           or ticket.get("type", "") == TICKET_TYPE
    subject_ok = not TICKET_SUBJECT_FILTER or TICKET_SUBJECT_FILTER.lower() in (ticket.get("subject") or "").lower()
    return type_ok and subject_ok


def fetch_tickets():
    """Fetch matching tickets updated since the start of the current month."""
    now   = datetime.now(timezone.utc)
    since = f"{now.year}-{now.month:02d}-01T00:00:00Z"

    url    = f"https://{DOMAIN}.freshservice.com/api/v2/tickets"
    params = {"updated_since": since, "per_page": 100, "page": 1}

    all_tickets = []
    while True:
        resp = requests.get(url, auth=_fs_auth(), params=params, timeout=15)
        resp.raise_for_status()
        page_tickets = resp.json().get("tickets", [])
        all_tickets.extend(t for t in page_tickets if _matches_filter(t))
        if len(page_tickets) < params["per_page"]:
            break
        params["page"] += 1

    # Enrich all tickets in parallel (one API call per ticket → thread pool)
    with ThreadPoolExecutor(max_workers=min(len(all_tickets), 10)) as pool:
        list(pool.map(_merge_requested_item_fields, all_tickets))

    return all_tickets


def _merge_requested_item_fields(ticket):
    """Fetch the first requested item for a ticket and merge its custom_fields in."""
    try:
        url  = f"https://{DOMAIN}.freshservice.com/api/v2/tickets/{ticket['id']}/requested_items"
        resp = requests.get(url, auth=_fs_auth(), timeout=15)
        if not resp.ok:
            return
        items = resp.json().get("requested_items", [])
        if items:
            ticket.setdefault("custom_fields", {}).update(items[0].get("custom_fields") or {})
    except requests.RequestException:
        pass  # best-effort; calculated fields will show None if missing


def fetch_one_ticket():
    """Find one matching ticket for /api/debug (searches up to 10 pages)."""
    url    = f"https://{DOMAIN}.freshservice.com/api/v2/tickets"
    params = {"per_page": 100, "page": 1}

    for _ in range(10):
        resp = requests.get(url, auth=_fs_auth(), params=params, timeout=15)
        resp.raise_for_status()
        page_tickets = resp.json().get("tickets", [])
        for t in page_tickets:
            if _matches_filter(t):
                return t
        if len(page_tickets) < params["per_page"]:
            break
        params["page"] += 1

    return {}


def _parse_date(value):
    """Parse an ISO-8601 date/datetime string to a date object, or None."""
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value[:19], fmt).date()
        except ValueError:
            continue
    return None


def calculate_fields(ticket):
    """Enrich a ticket dict with derived date fields and experiment status."""
    today  = date.today()
    custom = ticket.get("custom_fields") or {}

    created_at = _parse_date(ticket.get("created_at", ""))
    exp_start  = _parse_date(custom.get(FIELD_START_DATE, ""))
    exp_end    = _parse_date(custom.get(FIELD_END_DATE,   ""))
    fs_status  = ticket.get("status")

    ticket["days_since_opened"]    = (today - created_at).days if created_at else None
    ticket["days_into_experiment"] = (today - exp_start).days  if exp_start  else None
    ticket["days_remaining"]       = (exp_end - today).days    if exp_end    else None

    # Expose formatted date strings for display columns
    ticket["start_date_display"] = str(exp_start) if exp_start else None
    ticket["end_date_display"]   = str(exp_end)   if exp_end   else None
    app_name = custom.get("application_name") or None
    if not app_name:
        # Subject format: "Request for <Name> : Request SaaS Application..."
        subject = ticket.get("subject", "")
        try:
            requester_name = subject.split("Request for ", 1)[1].split(" : ", 1)[0].strip()
            app_name = _APP_NAME_OVERRIDES.get(requester_name)
        except IndexError:
            pass
    ticket["application_name"] = app_name

    # Experiment status
    # On Hold = 3, Resolved = 4, Closed = 5  (adjust if FS uses different codes)
    if fs_status in (4, 5):
        ticket["experiment_status"] = "Denied"
    elif fs_status == 3:
        ticket["experiment_status"] = "On Hold"
    elif exp_start and exp_start > today:
        ticket["experiment_status"] = "Approved"
    elif exp_start and exp_end and exp_start <= today <= exp_end:
        ticket["experiment_status"] = "In Progress"
    else:
        ticket["experiment_status"] = None

    return ticket


# ── HTML ─────────────────────────────────────────────────────────────────────
HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SaaS Experiment Tracker</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f4f6f9; color: #1a1a2e; }

    header {
      background: #fff; border-bottom: 1px solid #e2e6ef;
      padding: .75rem 2rem; display: flex; align-items: center; gap: 1.25rem;
    }
    header img { height: 48px; width: auto; }
    header .divider { width: 1px; height: 36px; background: #e2e6ef; }
    header .title h1 { font-size: 1.1rem; font-weight: 600; color: #1a1a2e; }
    header .title p  { font-size: .78rem; color: #888; margin-top: .1rem; }

    #controls {
      padding: 1rem 2rem; display: flex; align-items: center; gap: 1rem;
      border-bottom: 1px solid #e2e6ef; background: #f4f6f9;
    }

    button {
      background: #4f6bed; color: #fff; border: none; border-radius: 6px;
      padding: .5rem 1.2rem; font-size: .875rem; cursor: pointer;
      transition: background .15s;
    }
    button:hover    { background: #3a55d4; }
    button:disabled { background: #9aa5c4; cursor: default; }

    #spinner {
      display: none; width: 16px; height: 16px; border: 2px solid #c7cfe8;
      border-top-color: #4f6bed; border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    #status { font-size: .82rem; color: #666; margin-left: auto; }

    #error-msg {
      display: none; margin: 1rem 2rem; padding: .75rem 1rem;
      background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px;
      color: #991b1b; font-size: .875rem;
    }

    #summary {
      display: none; padding: .6rem 2rem; font-size: .82rem; color: #555;
      background: #eef1f8; border-bottom: 1px solid #e2e6ef;
    }

    .table-wrap { overflow-x: auto; padding: 1.5rem 2rem 2rem; }

    table {
      width: 100%; border-collapse: collapse; background: #fff;
      border-radius: 8px; overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,.08); font-size: .875rem;
    }
    th {
      background: #1a1a2e; color: #fff; text-align: left;
      padding: .65rem 1rem; font-weight: 500; white-space: nowrap;
      cursor: pointer; user-select: none;
    }
    th:hover { background: #2c2c4a; }
    th .sort-icon { margin-left: .3rem; opacity: .5; font-size: .7rem; }
    th.asc  .sort-icon::after { content: "▲"; opacity: 1; }
    th.desc .sort-icon::after { content: "▼"; opacity: 1; }
    th:not(.asc):not(.desc) .sort-icon::after { content: "⇅"; }

    td { padding: .6rem 1rem; border-bottom: 1px solid #e8ecf2; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f0f3fa; }

    .badge {
      display: inline-block; padding: .2rem .6rem; border-radius: 4px;
      font-weight: 600; font-size: .78rem; white-space: nowrap;
    }
    /* days_remaining colors */
    .green  { background: #dcfce7; color: #15803d; }
    .yellow { background: #fef9c3; color: #854d0e; }
    .red    { background: #fee2e2; color: #991b1b; }
    /* experiment status colors */
    .status-approved    { background: #dcfce7; color: #15803d; }
    .status-inprogress  { background: #dbeafe; color: #1d4ed8; }
    .status-onhold      { background: #fef3c7; color: #92400e; }
    .status-denied      { background: #fee2e2; color: #991b1b; }

    #empty-msg { display: none; padding: 2rem; color: #888; text-align: center; }
  </style>
</head>
<body>
  <header>
    <img src="/static/logo.png" alt="Hummingbird Healthcare">
    <div class="divider"></div>
    <div class="title">
      <h1>SaaS Experiment Tracker</h1>
      <p>FreshService &bull; Service Requests</p>
    </div>
  </header>

  <div id="controls">
    <button id="pull-btn" onclick="loadData('/api/refresh')">Pull Latest</button>
    <div id="spinner"></div>
    <span id="status"></span>
  </div>

  <div id="summary"></div>
  <div id="error-msg"></div>

  <div class="table-wrap">
    <p id="empty-msg">No matching tickets found.</p>
    <table id="ticket-table" style="display:none">
      <thead>
        <tr>
          <th onclick="sortBy('id')"                   data-col="id">                   ID                    <span class="sort-icon"></span></th>
          <th onclick="sortBy('subject')"               data-col="subject">              Subject               <span class="sort-icon"></span></th>
          <th onclick="sortBy('application_name')"      data-col="application_name">     Application           <span class="sort-icon"></span></th>
          <th onclick="sortBy('experiment_status')"     data-col="experiment_status">    Experiment Status     <span class="sort-icon"></span></th>
          <th onclick="sortBy('start_date_display')"    data-col="start_date_display">   Start Date            <span class="sort-icon"></span></th>
          <th onclick="sortBy('end_date_display')"      data-col="end_date_display">     End Date              <span class="sort-icon"></span></th>
          <th onclick="sortBy('days_remaining')"        data-col="days_remaining">       Days Remaining        <span class="sort-icon"></span></th>
          <th onclick="sortBy('days_since_opened')"     data-col="days_since_opened">    Days Since Opened     <span class="sort-icon"></span></th>
          <th onclick="sortBy('days_into_experiment')"  data-col="days_into_experiment"> Days Into Experiment  <span class="sort-icon"></span></th>
          <th onclick="sortBy('status')"                data-col="status">               FS Status             <span class="sort-icon"></span></th>
        </tr>
      </thead>
      <tbody id="table-body"></tbody>
    </table>
  </div>

  <script>
    const FS_STATUS = {2:'Open', 3:'On Hold', 4:'Resolved', 5:'Closed'};

    let _tickets = [];
    let _sortCol = null;
    let _sortDir = 'asc';

    async function loadData(endpoint) {
      const btn     = document.getElementById('pull-btn');
      const spinner = document.getElementById('spinner');
      const status  = document.getElementById('status');
      const errDiv  = document.getElementById('error-msg');
      const summary = document.getElementById('summary');
      const empty   = document.getElementById('empty-msg');
      const table   = document.getElementById('ticket-table');

      btn.disabled = true;
      spinner.style.display = 'block';
      status.textContent = '';
      errDiv.style.display  = 'none';
      empty.style.display   = 'none';
      if (endpoint === '/api/refresh') {
        table.style.display = 'none';
        summary.style.display = 'none';
      }

      try {
        const res = await fetch(endpoint);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Server error ${res.status}`);
        }
        const { tickets, fetched_at, cached } = await res.json();
        _tickets = tickets;
        _sortCol = null;
        _sortDir = 'asc';
        renderTable();

        if (tickets.length) {
          const overdue = tickets.filter(t => t.days_remaining !== null && t.days_remaining < 0).length;
          const overdueText = overdue ? ` &bull; <span style="color:#991b1b;font-weight:600">${overdue} overdue</span>` : '';
          summary.innerHTML = `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} loaded${overdueText}`;
          summary.style.display = 'block';
          table.style.display = '';
        } else {
          empty.style.display = 'block';
        }

        const cacheNote = cached ? ' (cached — click Pull Latest for live data)' : '';
        status.textContent = `Last refreshed: ${fetched_at}${cacheNote}`;
      } catch (err) {
        errDiv.textContent = err.message;
        errDiv.style.display = 'block';
      } finally {
        btn.disabled = false;
        spinner.style.display = 'none';
      }
    }

    function sortBy(col) {
      _sortDir = (_sortCol === col && _sortDir === 'asc') ? 'desc' : 'asc';
      _sortCol = col;
      renderTable();
    }

    function renderTable() {
      const tbody = document.getElementById('table-body');
      const rows  = [..._tickets];

      if (_sortCol) {
        rows.sort((a, b) => {
          let av = a[_sortCol] ?? '';
          let bv = b[_sortCol] ?? '';
          if (typeof av === 'string') av = av.toLowerCase();
          if (typeof bv === 'string') bv = bv.toLowerCase();
          if (av < bv) return _sortDir === 'asc' ? -1 :  1;
          if (av > bv) return _sortDir === 'asc' ?  1 : -1;
          return 0;
        });
      }

      document.querySelectorAll('th[data-col]').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.col === _sortCol) th.classList.add(_sortDir);
      });

      tbody.innerHTML = '';
      rows.forEach(t => {
        // Days remaining badge
        const dr  = t.days_remaining;
        const drCls = dr === null || dr === undefined ? ''
                    : dr > 30 ? 'green' : dr >= 0 ? 'yellow' : 'red';
        const drCell = dr === null || dr === undefined
          ? '—' : `<span class="badge ${drCls}">${dr}</span>`;

        // Experiment status badge
        const es = t.experiment_status;
        const esCls = es === 'Approved'    ? 'status-approved'
                    : es === 'In Progress' ? 'status-inprogress'
                    : es === 'On Hold'     ? 'status-onhold'
                    : es === 'Denied'      ? 'status-denied'
                    : '';
        const esCell = es ? `<span class="badge ${esCls}">${es}</span>` : '—';

        // FS status label
        const fsLabel = FS_STATUS[t.status] ?? `Status ${t.status ?? '—'}`;

        tbody.insertAdjacentHTML('beforeend', `<tr>
          <td>${t.id ?? '—'}</td>
          <td>${escHtml(t.subject ?? '')}</td>
          <td>${escHtml(t.application_name ?? '—')}</td>
          <td>${esCell}</td>
          <td>${t.start_date_display ?? '—'}</td>
          <td>${t.end_date_display ?? '—'}</td>
          <td>${drCell}</td>
          <td>${t.days_since_opened ?? '—'}</td>
          <td>${t.days_into_experiment ?? '—'}</td>
          <td>${escHtml(fsLabel)}</td>
        </tr>`);
      });
    }

    // Auto-load from cache on page open; Pull Latest forces a fresh fetch
    document.addEventListener('DOMContentLoaded', () => loadData('/api/data'));

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
  </script>
</body>
</html>
"""
# ─────────────────────────────────────────────────────────────────────────────


_cache: dict = {"tickets": None, "fetched_at": None}


def _refresh_cache():
    """Fetch fresh data from FreshService and update the in-memory cache."""
    try:
        tickets = fetch_tickets()
    except requests.RequestException as exc:
        print(f"[scheduler] Cache refresh failed: {exc}")
        return
    enriched = [calculate_fields(t) for t in tickets]
    _cache["tickets"]    = enriched
    _cache["fetched_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[scheduler] Cache refreshed — {len(enriched)} tickets at {_cache['fetched_at']}")


def _build_response(force: bool):
    """Return cached data, or fetch fresh if force=True or cache is empty."""
    if not force and _cache["tickets"] is not None:
        return jsonify(
            tickets=_cache["tickets"],
            fetched_at=_cache["fetched_at"],
            count=len(_cache["tickets"]),
            cached=True,
        )
    try:
        tickets = fetch_tickets()
    except requests.HTTPError as exc:
        return jsonify(error=f"FreshService API error: {exc.response.status_code} {exc.response.text}"), 502
    except requests.RequestException as exc:
        return jsonify(error=f"Could not reach FreshService: {exc}"), 502

    enriched = [calculate_fields(t) for t in tickets]
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    _cache["tickets"]    = enriched
    _cache["fetched_at"] = fetched_at
    return jsonify(tickets=enriched, fetched_at=fetched_at, count=len(enriched), cached=False)


# ── Scheduler ────────────────────────────────────────────────────────────────
_hour, _minute = (int(x) for x in REFRESH_TIME.split(":"))
_scheduler = BackgroundScheduler()
_scheduler.add_job(_refresh_cache, CronTrigger(hour=_hour, minute=_minute))
_scheduler.start()
print(f"[scheduler] Daily cache refresh scheduled at {REFRESH_TIME} (server local time)")


@app.route("/")
def index():
    return render_template_string(HTML)


@app.route("/api/data")
def api_data():
    """Return cached ticket data (instant). Used for auto-load on page open."""
    return _build_response(force=False)


@app.route("/api/refresh")
def api_refresh():
    """Force a fresh fetch from FreshService and update the cache."""
    return _build_response(force=True)


@app.route("/api/debug")
def api_debug():
    """Return a sample ticket + its requested_items so field slugs can be identified."""
    try:
        sample = fetch_one_ticket()
        requested_items = []
        if sample.get("id"):
            ri_url  = f"https://{DOMAIN}.freshservice.com/api/v2/tickets/{sample['id']}/requested_items"
            ri_resp = requests.get(ri_url, auth=_fs_auth(), timeout=15)
            if ri_resp.ok:
                requested_items = ri_resp.json().get("requested_items", [])
    except requests.RequestException as exc:
        return jsonify(error=str(exc)), 502
    return jsonify(
        field_config=dict(
            FIELD_START_DATE=FIELD_START_DATE,
            FIELD_END_DATE=FIELD_END_DATE,
        ),
        sample_ticket=sample,
        requested_items=requested_items,
        note="Check requested_items[*].custom_fields for your date field slugs.",
    )


if __name__ == "__main__":
    app.run(debug=True)
