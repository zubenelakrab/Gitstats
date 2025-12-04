import type {
  AnalysisReport,
  OutputConfig,
  OutputRenderer,
} from '../types/index.ts';
import { writeFile } from 'node:fs/promises';
import { formatDate } from '../utils/date.ts';

/**
 * HTML output renderer with interactive charts
 */
export class HtmlRenderer implements OutputRenderer {
  async render(report: AnalysisReport, config: OutputConfig): Promise<string> {
    const theme = config.options?.theme || 'light';
    const title = config.options?.title || `GitStats: ${report.repository.name}`;

    return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-primary: ${theme === 'dark' ? '#1a1a2e' : '#ffffff'};
      --bg-secondary: ${theme === 'dark' ? '#16213e' : '#f5f5f5'};
      --text-primary: ${theme === 'dark' ? '#eaeaea' : '#333333'};
      --text-secondary: ${theme === 'dark' ? '#b0b0b0' : '#666666'};
      --accent: #4f46e5;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --border: ${theme === 'dark' ? '#2d3748' : '#e2e8f0'};
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 2rem;
    }

    .container { max-width: 1400px; margin: 0 auto; }

    header {
      text-align: center;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border);
    }

    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin-bottom: 1rem; color: var(--accent); }
    h3 { font-size: 1.1rem; margin-bottom: 0.5rem; }

    .meta { color: var(--text-secondary); font-size: 0.9rem; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .card {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .card-full { grid-column: 1 / -1; }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }

    .stat {
      text-align: center;
      padding: 1rem;
      background: var(--bg-primary);
      border-radius: 8px;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: var(--accent);
    }

    .stat-label {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th { font-weight: 600; color: var(--text-secondary); }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-danger { background: var(--danger); color: white; }
    .badge-warning { background: var(--warning); color: black; }
    .badge-success { background: var(--success); color: white; }

    .chart-container {
      position: relative;
      height: 300px;
    }

    .progress-bar {
      height: 8px;
      background: var(--border);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 4px;
    }

    footer {
      text-align: center;
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📊 ${this.escapeHtml(report.repository.name)}</h1>
      <p class="meta">
        Generated on ${formatDate(report.generatedAt)} •
        Repository age: ${report.summary.repositoryAge} days
      </p>
    </header>

    <!-- Summary Stats -->
    <div class="grid">
      <div class="card card-full">
        <h2>📈 Overview</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value">${report.summary.totalCommits.toLocaleString()}</div>
            <div class="stat-label">Total Commits</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.summary.totalAuthors}</div>
            <div class="stat-label">Contributors</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: var(--success)">+${report.summary.totalAdditions.toLocaleString()}</div>
            <div class="stat-label">Lines Added</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: var(--danger)">-${report.summary.totalDeletions.toLocaleString()}</div>
            <div class="stat-label">Lines Deleted</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.summary.averageCommitsPerDay.toFixed(1)}</div>
            <div class="stat-label">Commits/Day</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.busFactor.overall}</div>
            <div class="stat-label">Bus Factor</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid">
      <div class="card">
        <h2>👥 Top Contributors</h2>
        <div class="chart-container">
          <canvas id="authorsChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h2>📅 Activity by Day</h2>
        <div class="chart-container">
          <canvas id="dayChart"></canvas>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>⏰ Activity by Hour</h2>
        <div class="chart-container">
          <canvas id="hourChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h2>📆 Monthly Activity</h2>
        <div class="chart-container">
          <canvas id="monthlyChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Tables -->
    <div class="grid">
      <div class="card">
        <h2>🔥 Code Hotspots</h2>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Commits</th>
              <th>Churn</th>
            </tr>
          </thead>
          <tbody>
            ${report.hotspots.files.slice(0, 10).map(file => `
              <tr>
                <td title="${this.escapeHtml(file.path)}">${this.escapeHtml(this.truncatePath(file.path, 35))}</td>
                <td>${file.commits}</td>
                <td>${file.churnScore.toFixed(1)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>🚌 Bus Factor Risks</h2>
        ${report.busFactor.criticalAreas.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Risk</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              ${report.busFactor.criticalAreas.slice(0, 10).map(area => `
                <tr>
                  <td title="${this.escapeHtml(area.path)}">${this.escapeHtml(this.truncatePath(area.path, 30))}</td>
                  <td><span class="badge badge-${area.risk === 'high' ? 'danger' : 'warning'}">${area.risk.toUpperCase()}</span></td>
                  <td>${area.soleContributor ? this.escapeHtml(area.soleContributor.name) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p>✅ No critical risk areas detected</p>'}
      </div>
    </div>

    <!-- Contributors Table -->
    <div class="grid">
      <div class="card card-full">
        <h2>👥 All Contributors</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Email</th>
              <th>Commits</th>
              <th>Additions</th>
              <th>Deletions</th>
              <th>Files</th>
              <th>Contribution</th>
            </tr>
          </thead>
          <tbody>
            ${report.authors.map((author, i) => {
              const percentage = (author.commits / report.summary.totalCommits * 100);
              return `
                <tr>
                  <td>${i + 1}</td>
                  <td>${this.escapeHtml(author.author.name)}</td>
                  <td>${this.escapeHtml(author.author.email)}</td>
                  <td>${author.commits}</td>
                  <td style="color: var(--success)">+${author.additions.toLocaleString()}</td>
                  <td style="color: var(--danger)">-${author.deletions.toLocaleString()}</td>
                  <td>${author.filesChanged}</td>
                  <td>
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: ${percentage}%"></div>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <footer>
      <p>Generated by <strong>GitStats</strong> • ${formatDate(report.generatedAt)}</p>
    </footer>
  </div>

  <script>
    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#eaeaea' : '#333333';
    const gridColor = isDark ? '#2d3748' : '#e2e8f0';

    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = gridColor;

    // Authors Chart
    new Chart(document.getElementById('authorsChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(report.authors.slice(0, 10).map(a => a.author.name))},
        datasets: [{
          label: 'Commits',
          data: ${JSON.stringify(report.authors.slice(0, 10).map(a => a.commits))},
          backgroundColor: '#4f46e5',
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    // Day of Week Chart
    const dayTotals = [${this.getDayTotals(report).join(',')}];
    new Chart(document.getElementById('dayChart'), {
      type: 'bar',
      data: {
        labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        datasets: [{
          label: 'Commits',
          data: dayTotals,
          backgroundColor: '#10b981',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    // Hour Chart
    const hourTotals = [${this.getHourTotals(report).join(',')}];
    new Chart(document.getElementById('hourChart'), {
      type: 'line',
      data: {
        labels: Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0') + ':00'),
        datasets: [{
          label: 'Commits',
          data: hourTotals,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    // Monthly Chart
    const monthlyData = ${JSON.stringify(this.getMonthlyData(report))};
    new Chart(document.getElementById('monthlyChart'), {
      type: 'line',
      data: {
        labels: monthlyData.labels,
        datasets: [{
          label: 'Commits',
          data: monthlyData.values,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  </script>
</body>
</html>`;
  }

  async save(content: string, path: string): Promise<void> {
    await writeFile(path, content, 'utf-8');
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private truncatePath(path: string, maxLength: number): string {
    if (path.length <= maxLength) return path;
    const parts = path.split('/');
    if (parts.length <= 2) return path.substring(0, maxLength - 3) + '...';
    return parts[0] + '/.../' + parts.slice(-1)[0];
  }

  private getDayTotals(report: AnalysisReport): number[] {
    const totals = new Array(7).fill(0);
    for (const author of report.authors) {
      for (let i = 0; i < 7; i++) {
        totals[i] += author.commitsByDayOfWeek[i];
      }
    }
    return totals;
  }

  private getHourTotals(report: AnalysisReport): number[] {
    const totals = new Array(24).fill(0);
    for (const author of report.authors) {
      for (let i = 0; i < 24; i++) {
        totals[i] += author.commitsByHour[i];
      }
    }
    return totals;
  }

  private getMonthlyData(report: AnalysisReport): { labels: string[]; values: number[] } {
    const months = Object.entries(report.timeline.monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);

    return {
      labels: months.map(([key]) => key),
      values: months.map(([, stats]) => stats.commits),
    };
  }
}

export function createHtmlRenderer(): HtmlRenderer {
  return new HtmlRenderer();
}
