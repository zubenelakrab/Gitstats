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

    <!-- Extended Analytics Row -->
    <div class="grid">
      ${report.velocity ? `
      <div class="card">
        <h2>🚀 Velocity</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value">${report.velocity.commitsPerDay.toFixed(1)}</div>
            <div class="stat-label">Commits/Day</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.velocity.commitsPerWeek.toFixed(1)}</div>
            <div class="stat-label">Commits/Week</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: ${report.velocity.trend === 'accelerating' ? 'var(--success)' : report.velocity.trend === 'decelerating' ? 'var(--danger)' : 'var(--warning)'}">
              ${report.velocity.trend === 'accelerating' ? '📈' : report.velocity.trend === 'decelerating' ? '📉' : '➡️'}
            </div>
            <div class="stat-label">${report.velocity.trend} (${report.velocity.trendPercentage > 0 ? '+' : ''}${report.velocity.trendPercentage.toFixed(0)}%)</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.velocity.consistencyScore.toFixed(0)}%</div>
            <div class="stat-label">Consistency</div>
          </div>
        </div>
        ${report.velocity.releaseRhythm && report.velocity.releaseRhythm.releases.length > 0 ? `
        <h3 style="margin-top: 1rem;">📦 Release Rhythm</h3>
        <div class="stat-grid" style="margin-top: 0.5rem;">
          <div class="stat">
            <div class="stat-value">${report.velocity.releaseRhythm.releaseFrequency}</div>
            <div class="stat-label">Frequency</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.velocity.releaseRhythm.averageDaysBetweenReleases}</div>
            <div class="stat-label">Avg Days Between</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.velocity.releaseRhythm.daysSinceLastRelease}</div>
            <div class="stat-label">Days Since Last</div>
          </div>
        </div>
        ` : ''}
        ${report.velocity.codebaseEvolution && report.velocity.codebaseEvolution.monthly.length > 0 ? `
        <h3 style="margin-top: 1rem;">📈 Codebase Evolution</h3>
        <div class="stat-grid" style="margin-top: 0.5rem;">
          <div class="stat">
            <div class="stat-value" style="color: ${report.velocity.codebaseEvolution.totalGrowth >= 0 ? 'var(--success)' : 'var(--danger)'}">
              ${report.velocity.codebaseEvolution.totalGrowth >= 0 ? '+' : ''}${report.velocity.codebaseEvolution.totalGrowth.toLocaleString()}
            </div>
            <div class="stat-label">Total LOC Growth</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.velocity.codebaseEvolution.averageMonthlyGrowth >= 0 ? '+' : ''}${report.velocity.codebaseEvolution.averageMonthlyGrowth.toLocaleString()}</div>
            <div class="stat-label">Avg Monthly</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.velocity.codebaseEvolution.fileCountTrend}</div>
            <div class="stat-label">File Trend</div>
          </div>
          ${report.velocity.codebaseEvolution.largestExpansion.month !== 'N/A' ? `
          <div class="stat">
            <div class="stat-value" style="color: var(--success); font-size: 1rem;">${report.velocity.codebaseEvolution.largestExpansion.month}</div>
            <div class="stat-label">Largest Expansion (+${report.velocity.codebaseEvolution.largestExpansion.additions.toLocaleString()})</div>
          </div>
          ` : ''}
          ${report.velocity.codebaseEvolution.largestRefactor.month !== 'N/A' ? `
          <div class="stat">
            <div class="stat-value" style="color: var(--warning); font-size: 1rem;">${report.velocity.codebaseEvolution.largestRefactor.month}</div>
            <div class="stat-label">Largest Refactor (-${report.velocity.codebaseEvolution.largestRefactor.deletions.toLocaleString()})</div>
          </div>
          ` : ''}
        </div>
        <h4 style="margin-top: 1rem; font-size: 0.9rem;">Monthly Evolution (last 12 months)</h4>
        <table style="margin-top: 0.5rem; font-size: 0.85rem;">
          <thead>
            <tr>
              <th>Month</th>
              <th>Net Change</th>
              <th>Added</th>
              <th>Deleted</th>
              <th>Files +/-</th>
            </tr>
          </thead>
          <tbody>
            ${report.velocity.codebaseEvolution.monthly.slice(-12).map(m => `
              <tr>
                <td>${m.month}</td>
                <td style="color: ${m.netChange >= 0 ? 'var(--success)' : 'var(--danger)'}">${m.netChange >= 0 ? '+' : ''}${m.netChange.toLocaleString()}</td>
                <td style="color: var(--success)">+${m.additions.toLocaleString()}</td>
                <td style="color: var(--danger)">-${m.deletions.toLocaleString()}</td>
                <td>+${m.filesAdded}/-${m.filesDeleted}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : ''}
      </div>
      ` : ''}

      ${report.health ? `
      <div class="card">
        <h2>🏥 Health Score</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value" style="color: ${report.health.healthScore >= 80 ? 'var(--success)' : report.health.healthScore >= 60 ? 'var(--warning)' : 'var(--danger)'}">
              ${report.health.healthScore}
            </div>
            <div class="stat-label">Overall Score</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.health.zombieFiles.length}</div>
            <div class="stat-label">Zombie Files</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.health.abandonedDirs.length}</div>
            <div class="stat-label">Abandoned Dirs</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.health.legacyFiles.filter(f => f.risk === 'high').length}</div>
            <div class="stat-label">High Risk Legacy</div>
          </div>
        </div>
        ${report.health.testMetrics ? `
        <h3 style="margin-top: 1rem;">🧪 Test Metrics</h3>
        <div class="stat-grid" style="margin-top: 0.5rem;">
          <div class="stat">
            <div class="stat-value">${report.health.testMetrics.testFiles}</div>
            <div class="stat-label">Test Files</div>
          </div>
          <div class="stat">
            <div class="stat-value">${(report.health.testMetrics.testToCodeRatio * 100).toFixed(0)}%</div>
            <div class="stat-label">Test/Code Ratio</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="font-size: 1rem;">${report.health.testMetrics.testCoverage}</div>
            <div class="stat-label">Est. Coverage</div>
          </div>
        </div>
        ` : ''}
      </div>
      ` : ''}
    </div>

    <div class="grid">
      ${report.workPatterns ? `
      <div class="card">
        <h2>⏰ Work Patterns</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value">${report.workPatterns.peakHour.toString().padStart(2, '0')}:00</div>
            <div class="stat-label">Peak Hour</div>
          </div>
          <div class="stat">
            <div class="stat-value">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][report.workPatterns.peakDay]}</div>
            <div class="stat-label">Peak Day</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.workPatterns.nightOwlPercentage.toFixed(0)}%</div>
            <div class="stat-label">Night Owl</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: ${report.workPatterns.workLifeBalance >= 70 ? 'var(--success)' : report.workPatterns.workLifeBalance >= 40 ? 'var(--warning)' : 'var(--danger)'}">
              ${report.workPatterns.workLifeBalance.toFixed(0)}/100
            </div>
            <div class="stat-label">Work-Life Balance</div>
          </div>
        </div>
      </div>
      ` : ''}

      ${report.commitQuality ? `
      <div class="card">
        <h2>📝 Commit Quality</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value" style="color: ${report.commitQuality.qualityScore >= 80 ? 'var(--success)' : report.commitQuality.qualityScore >= 60 ? 'var(--warning)' : 'var(--danger)'}">
              ${report.commitQuality.qualityScore.toFixed(0)}
            </div>
            <div class="stat-label">Quality Score</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.commitQuality.conventionalPercentage.toFixed(0)}%</div>
            <div class="stat-label">Conventional</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.commitQuality.wipCommits.length}</div>
            <div class="stat-label">WIP Commits</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.commitQuality.largeCommits.length}</div>
            <div class="stat-label">Large Commits</div>
          </div>
        </div>
      </div>
      ` : ''}
    </div>

    <div class="grid">
      ${report.collaboration ? `
      <div class="card">
        <h2>🤝 Collaboration</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value" style="color: ${report.collaboration.collaborationScore >= 70 ? 'var(--success)' : report.collaboration.collaborationScore >= 40 ? 'var(--warning)' : 'var(--danger)'}">
              ${report.collaboration.collaborationScore.toFixed(0)}
            </div>
            <div class="stat-label">Collaboration Score</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.collaboration.collaborationPairs.length}</div>
            <div class="stat-label">Collab Pairs</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.collaboration.sharedFiles.length}</div>
            <div class="stat-label">Shared Files</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.collaboration.loneWolves.length}</div>
            <div class="stat-label">Lone Wolves</div>
          </div>
        </div>
      </div>
      ` : ''}

      ${report.branchAnalysis ? `
      <div class="card">
        <h2>🌿 Branch Health</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value" style="color: ${report.branchAnalysis.branchHealthScore >= 80 ? 'var(--success)' : report.branchAnalysis.branchHealthScore >= 60 ? 'var(--warning)' : 'var(--danger)'}">
              ${report.branchAnalysis.branchHealthScore}
            </div>
            <div class="stat-label">Branch Health</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.branchAnalysis.totalBranches}</div>
            <div class="stat-label">Total Branches</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: var(--warning)">${report.branchAnalysis.staleBranches.length}</div>
            <div class="stat-label">Stale Branches</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: var(--danger)">${report.branchAnalysis.orphanBranches.length}</div>
            <div class="stat-label">Orphan Branches</div>
          </div>
        </div>
        ${report.branchAnalysis.branchLifecycle ? `
        <h3 style="margin-top: 1rem;">📊 Branch Lifecycle</h3>
        <div class="stat-grid" style="margin-top: 0.5rem;">
          <div class="stat">
            <div class="stat-value">${report.branchAnalysis.branchLifecycle.workflowType}</div>
            <div class="stat-label">Workflow</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: var(--success)">${report.branchAnalysis.branchLifecycle.activePercentage}%</div>
            <div class="stat-label">Active</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.branchAnalysis.branchLifecycle.mergeRate}%</div>
            <div class="stat-label">Merge Rate</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.branchAnalysis.branchLifecycle.estimatedAvgLifespan}d</div>
            <div class="stat-label">Avg Lifespan</div>
          </div>
        </div>
        <table style="margin-top: 0.75rem; font-size: 0.85rem;">
          <tbody>
            <tr>
              <td>Active branches (&lt;30 days)</td>
              <td style="text-align: right; color: var(--success)">${report.branchAnalysis.branchLifecycle.activeCount}</td>
            </tr>
            <tr>
              <td>Inactive branches (30-90 days)</td>
              <td style="text-align: right; color: var(--warning)">${report.branchAnalysis.branchLifecycle.inactiveCount}</td>
            </tr>
            <tr>
              <td>Stale branches (&gt;90 days)</td>
              <td style="text-align: right; color: var(--danger)">${report.branchAnalysis.branchLifecycle.staleCount}</td>
            </tr>
            <tr>
              <td>Merged / Unmerged</td>
              <td style="text-align: right;">${report.branchAnalysis.branchLifecycle.mergedBranches} / ${report.branchAnalysis.branchLifecycle.unmergedBranches}</td>
            </tr>
            <tr>
              <td>Short-lived (&lt;7 days)</td>
              <td style="text-align: right;">${report.branchAnalysis.branchLifecycle.shortLivedBranches}</td>
            </tr>
            <tr>
              <td>Long-lived (&gt;30 days)</td>
              <td style="text-align: right;">${report.branchAnalysis.branchLifecycle.longLivedBranches}</td>
            </tr>
            <tr>
              <td>Created last 30 days</td>
              <td style="text-align: right;">${report.branchAnalysis.branchLifecycle.branchesCreatedLast30Days}</td>
            </tr>
            <tr>
              <td>Created last 90 days</td>
              <td style="text-align: right;">${report.branchAnalysis.branchLifecycle.branchesCreatedLast90Days}</td>
            </tr>
          </tbody>
        </table>
        ` : ''}
      </div>
      ` : ''}
    </div>

    <!-- Technical Debt & Complexity -->
    <div class="grid">
      ${report.complexity ? `
      <div class="card">
        <h2>💳 Technical Debt</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value" style="color: ${report.complexity.technicalDebtScore < 30 ? 'var(--success)' : report.complexity.technicalDebtScore < 60 ? 'var(--warning)' : 'var(--danger)'}">
              ${report.complexity.technicalDebtScore || 0}
            </div>
            <div class="stat-label">Debt Score</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.complexity.debtTrend === 'increasing' ? '📈' : report.complexity.debtTrend === 'decreasing' ? '📉' : '➡️'}</div>
            <div class="stat-label">${report.complexity.debtTrend || 'stable'}</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.complexity.godFiles.length}</div>
            <div class="stat-label">God Files</div>
          </div>
          <div class="stat">
            <div class="stat-value">${report.complexity.filesWithHighChurn}</div>
            <div class="stat-label">High Churn</div>
          </div>
        </div>
        ${report.complexity.debtIndicators && report.complexity.debtIndicators.length > 0 ? `
        <h3 style="margin-top: 1rem;">Debt Indicators</h3>
        <table style="margin-top: 0.5rem;">
          <tbody>
            ${report.complexity.debtIndicators.map(ind => `
              <tr>
                <td>${ind.status === 'good' ? '✅' : ind.status === 'warning' ? '⚠️' : '❌'} ${ind.name}</td>
                <td style="text-align: right;">${ind.value}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : ''}
      </div>
      ` : ''}

      ${report.hotspots.directoryHotspots && report.hotspots.directoryHotspots.length > 0 ? `
      <div class="card">
        <h2>📁 Directory Hotspots</h2>
        <table>
          <thead>
            <tr>
              <th>Directory</th>
              <th>Risk</th>
              <th>Commits</th>
              <th>Files</th>
            </tr>
          </thead>
          <tbody>
            ${report.hotspots.directoryHotspots.slice(0, 10).map(dir => `
              <tr>
                <td>${this.escapeHtml(this.truncatePath(dir.path, 25))}</td>
                <td><span class="badge badge-${dir.riskLevel === 'critical' ? 'danger' : dir.riskLevel === 'high' ? 'warning' : 'success'}">${dir.riskLevel.toUpperCase()}</span></td>
                <td>${dir.commits}</td>
                <td>${dir.fileCount}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}
    </div>

    <!-- Critical Hotspots -->
    ${report.complexity && report.complexity.criticalHotspots && report.complexity.criticalHotspots.length > 0 ? `
    <div class="grid">
      <div class="card card-full">
        <h2>🔥 Critical Hotspots (High Churn + High Changes)</h2>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Risk</th>
              <th>Score</th>
              <th>Commits</th>
              <th>Changes</th>
              <th>Risk Factors</th>
            </tr>
          </thead>
          <tbody>
            ${report.complexity.criticalHotspots.slice(0, 10).map(hotspot => `
              <tr>
                <td title="${this.escapeHtml(hotspot.path)}">${this.escapeHtml(this.truncatePath(hotspot.path, 35))}</td>
                <td><span class="badge badge-${hotspot.riskLevel === 'critical' ? 'danger' : hotspot.riskLevel === 'high' ? 'warning' : 'success'}">${hotspot.riskLevel.toUpperCase()}</span></td>
                <td>${hotspot.riskScore}%</td>
                <td>${hotspot.commitCount}</td>
                <td>${hotspot.totalChanges.toLocaleString()}</td>
                <td style="font-size: 0.8rem; color: var(--text-secondary)">${hotspot.riskFactors.slice(0, 2).join(', ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Risk Map & Author Breakdown -->
    <div class="grid">
      ${report.hotspots.riskMap && report.hotspots.riskMap.length > 0 ? `
      <div class="card">
        <h2>🎯 Risk Map</h2>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Risk</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            ${report.hotspots.riskMap.slice(0, 8).map(entry => `
              <tr>
                <td title="${this.escapeHtml(entry.path)}">${this.escapeHtml(this.truncatePath(entry.path, 30))}</td>
                <td><span class="badge badge-${entry.riskLevel === 'critical' ? 'danger' : entry.riskLevel === 'high' ? 'warning' : 'success'}">${entry.riskLevel.toUpperCase()}</span></td>
                <td>${entry.combinedRisk.toFixed(0)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      ${report.commitQuality && report.commitQuality.authorBreakdown && report.commitQuality.authorBreakdown.length > 0 ? `
      <div class="card">
        <h2>👥 Author Contribution Types</h2>
        <table>
          <thead>
            <tr>
              <th>Author</th>
              <th>Primary Type</th>
              <th>Commits</th>
              <th>Diversity</th>
            </tr>
          </thead>
          <tbody>
            ${report.commitQuality.authorBreakdown.slice(0, 8).map(author => `
              <tr>
                <td>${this.escapeHtml(author.author.substring(0, 20))}</td>
                <td><span class="badge badge-success">${author.primaryType}</span></td>
                <td>${author.totalCommits}</td>
                <td>${author.diversityScore}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}
    </div>

    <!-- Type Evolution Chart -->
    ${report.commitQuality && report.commitQuality.typeEvolution && report.commitQuality.typeEvolution.length > 0 ? `
    <div class="grid">
      <div class="card card-full">
        <h2>📈 Commit Type Evolution</h2>
        <div class="chart-container">
          <canvas id="typeEvolutionChart"></canvas>
        </div>
      </div>
    </div>
    ` : ''}

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

    // Type Evolution Chart (if exists)
    ${report.commitQuality && report.commitQuality.typeEvolution && report.commitQuality.typeEvolution.length > 0 ? `
    const typeEvolutionData = ${JSON.stringify(this.getTypeEvolutionData(report))};
    const typeColors = {
      feat: '#10b981', fix: '#ef4444', docs: '#3b82f6', style: '#8b5cf6',
      refactor: '#f59e0b', test: '#06b6d4', chore: '#6b7280', other: '#9ca3af',
      update: '#22c55e', remove: '#f43f5e', merge: '#a855f7', config: '#14b8a6'
    };
    new Chart(document.getElementById('typeEvolutionChart'), {
      type: 'bar',
      data: {
        labels: typeEvolutionData.labels,
        datasets: typeEvolutionData.types.map(t => ({
          label: t.type,
          data: t.data,
          backgroundColor: typeColors[t.type] || '#6b7280',
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true } },
        plugins: { legend: { position: 'bottom' } }
      }
    });
    ` : ''}
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

  private getTypeEvolutionData(report: AnalysisReport): { labels: string[]; types: { type: string; data: number[] }[] } {
    const evolution = report.commitQuality?.typeEvolution || [];
    if (evolution.length === 0) {
      return { labels: [], types: [] };
    }

    // Get all unique types across all months
    const allTypes = new Set<string>();
    for (const entry of evolution) {
      for (const type of Object.keys(entry.types)) {
        allTypes.add(type);
      }
    }

    // Build dataset for each type
    const labels = evolution.map(e => e.month);
    const types = Array.from(allTypes).map(type => ({
      type,
      data: evolution.map(e => e.types[type] || 0),
    }));

    // Sort types by total commits (most common first)
    types.sort((a, b) => {
      const totalA = a.data.reduce((sum, v) => sum + v, 0);
      const totalB = b.data.reduce((sum, v) => sum + v, 0);
      return totalB - totalA;
    });

    return { labels, types: types.slice(0, 8) }; // Limit to top 8 types
  }
}

export function createHtmlRenderer(): HtmlRenderer {
  return new HtmlRenderer();
}
