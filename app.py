import os
import requests
from datetime import datetime, date, timezone
from flask import Flask, jsonify, render_template_string

app = Flask(__name__)

# ── Config ─────────────────────────────────────────────────────────────────
API_KEY = os.getenv("FRESHSERVICE_API_KEY")
DOMAIN = os.getenv("FRESHSERVICE_DOMAIN")

# Custom-field names as they appear in the FreshService API response.
# Override with env vars if your instance uses different slugs.
FIELD_START_DATE = os.getenv("FS_FIELD_START_DATE", "start_date")
FIELD_END_DATE = os.getenv("FS_FIELD_END_DATE", "experiment_end_date")
# ───────────────────────────────────────────────────────────────────────────


def fetch_tickets():
    """Fetch all tickets for the current month from FreshService."""
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    start = f"{year}-{month:02d}-01"
    end = (
        f"{year}-{month + 1:02d}-01"
        if month < 12
        else f"{year + 1}-01-01"
    )

    url = f"https://{DOMAIN}.freshservice.com/api/v2/tickets"
    headers = {
        "Authorization": f"Basic {API_KEY}",
        "Content-Type": "application/json",
    }
    params = {"created_at": f"[{start},{end}]"}

    response = requests.get(url, headers=headers, params=params, timeout=15)
    response.raise_for_status()
    return response.json().get("tickets", [])


def calculate_fields(ticket):
    """Add the three derived date fields to a ticket dict."""
    today = date.today()

    def parse_date(value):
        if not value:
            return None
        for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(value[:19], fmt[:len(value[:19])])
                return dt.date()
            except ValueError:
                continue
        return None

    # created_at is a top-level field; start_date / experiment_end_date live
    # in custom_fields (adjust FIELD_* env vars if your slugs differ).
    created_at = parse_date(ticket.get("created_at", ""))
    custom = ticket.get("custom_fields", {})
    exp_start = parse_date(custom.get(FIELD_START_DATE, ""))
    exp_end = parse_date(custom.get(FIELD_END_DATE, ""))

    ticket["days_since_opened"] = (today - created_at).days if created_at else None
    ticket["days_into_experiment"] = (today - exp_start).days if exp_start else None
    ticket["days_remaining"] = (exp_end - today).days if exp_end else None
    return ticket


# ── HTML template ───────────────────────────────────────────────────────────
HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FreshService Tickets</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f4f6f9; color: #1a1a2e; }

    header {
      background: #1a1a2e; color: #fff; padding: 1rem 2rem;
      display: flex; align-items: center; justify-content: space-between;
    }
    header h1 { font-size: 1.2rem; font-weight: 600; }

    #controls { padding: 1rem 2rem; display: flex; align-items: center; gap: 1rem; }

    button {
      background: #4f6bed; color: #fff; border: none; border-radius: 6px;
      padding: .5rem 1.2rem; font-size: .9rem; cursor: pointer;
      transition: background .15s;
    }
    button:hover { background: #3a55d4; }
    button:disabled { background: #9aa5c4; cursor: default; }

    #status { font-size: .85rem; color: #555; }

    #error-msg {
      display: none; margin: 0 2rem; padding: .75rem 1rem;
      background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px;
      color: #991b1b; font-size: .9rem;
    }

    .table-wrap { overflow-x: auto; padding: 0 2rem 2rem; }

    table {
      width: 100%; border-collapse: collapse; background: #fff;
      border-radius: 8px; overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,.08);
      font-size: .875rem;
    }
    th {
      background: #1a1a2e; color: #fff; text-align: left;
      padding: .65rem 1rem; font-weight: 500; white-space: nowrap;
    }
    td { padding: .6rem 1rem; border-bottom: 1px solid #e8ecf2; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f0f3fa; }

    .badge {
      display: inline-block; padding: .2rem .55rem; border-radius: 4px;
      font-weight: 600; font-size: .8rem;
    }
    .green  { background: #dcfce7; color: #15803d; }
    .yellow { background: #fef9c3; color: #854d0e; }
    .red    { background: #fee2e2; color: #991b1b; }

    #empty-msg { display: none; padding: 1.5rem 2rem; color: #666; }
  </style>
</head>
<body>
  <header>
    <h1>FreshService Experiment Tickets</h1>
  </header>

  <div id="controls">
    <button id="pull-btn" onclick="loadData()">Pull Latest</button>
    <span id="status"></span>
  </div>

  <div id="error-msg"></div>
  <p id="empty-msg">No tickets found for the current month.</p>

  <div class="table-wrap">
    <table id="ticket-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Subject</th>
          <th>Status</th>
          <th>Created At</th>
          <th>Days Since Opened</th>
          <th>Days Into Experiment</th>
          <th>Days Remaining</th>
        </tr>
      </thead>
      <tbody id="table-body"></tbody>
    </table>
  </div>

  <script>
    async function loadData() {
      const btn    = document.getElementById('pull-btn');
      const status = document.getElementById('status');
      const errDiv = document.getElementById('error-msg');
      const empty  = document.getElementById('empty-msg');
      const tbody  = document.getElementById('table-body');

      btn.disabled = true;
      btn.textContent = 'Fetching…';
      status.textContent = '';
      errDiv.style.display = 'none';
      empty.style.display  = 'none';

      try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const { tickets, fetched_at } = await res.json();

        tbody.innerHTML = '';

        if (!tickets.length) {
          empty.style.display = 'block';
        } else {
          tickets.forEach(t => {
            const dr = t.days_remaining;
            let cls = '';
            if (dr === null || dr === undefined) {
              cls = '';
            } else if (dr > 30) {
              cls = 'green';
            } else if (dr >= 0) {
              cls = 'yellow';
            } else {
              cls = 'red';
            }

            const drCell = dr === null || dr === undefined
              ? '—'
              : `<span class="badge ${cls}">${dr}</span>`;

            const row = `<tr>
              <td>${t.id ?? '—'}</td>
              <td>${escHtml(t.subject ?? '')}</td>
              <td>${escHtml(String(t.status ?? '—'))}</td>
              <td>${(t.created_at ?? '—').slice(0, 10)}</td>
              <td>${t.days_since_opened ?? '—'}</td>
              <td>${t.days_into_experiment ?? '—'}</td>
              <td>${drCell}</td>
            </tr>`;
            tbody.insertAdjacentHTML('beforeend', row);
          });
        }

        status.textContent = `Last refreshed: ${fetched_at}`;
      } catch (err) {
        errDiv.textContent = err.message;
        errDiv.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Pull Latest';
      }
    }

    function escHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
               .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
  </script>
</body>
</html>
"""
# ───────────────────────────────────────────────────────────────────────────


@app.route("/")
def index():
    return render_template_string(HTML)


@app.route("/api/data")
def api_data():
    tickets = fetch_tickets()
    enriched = [calculate_fields(t) for t in tickets]
    return jsonify(
        tickets=enriched,
        fetched_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    )


if __name__ == "__main__":
    app.run(debug=True)
