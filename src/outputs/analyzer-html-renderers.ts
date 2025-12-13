import type { BurnoutStats } from '../analyzers/burnout-analyzer.js';
import type { LeaderboardStats } from '../analyzers/leaderboard-analyzer.js';
import type { DeadCodeStats } from '../analyzers/deadcode-analyzer.js';
import type { DependencyStats } from '../analyzers/dependency-analyzer.js';
import type { CopyPasteStats } from '../analyzers/copypaste-analyzer.js';
import type { VelocityStats } from '../analyzers/velocity-analyzer.js';
import type { ComplexityStats } from '../analyzers/complexity-analyzer.js';
import type { WorkPatternsStats } from '../analyzers/workpatterns-analyzer.js';
import type { CommitQualityStats } from '../analyzers/commits-analyzer.js';
import type { CollaborationStats } from '../analyzers/collaboration-analyzer.js';
import type { CouplingStats } from '../analyzers/coupling-analyzer.js';
import type { HealthStats } from '../analyzers/health-analyzer.js';
import type { BranchesStats } from '../analyzers/branches-analyzer.js';
import type { BusFactorAnalysis, CriticalArea } from '../types/index.js';

const baseStyles = `
  :root { --bg: #1a1a2e; --card: #16213e; --text: #eaeaea; --text-secondary: #a0a0a0; --accent: #00d9ff; --success: #10b981; --warning: #f59e0b; --danger: #ef4444; --border: #2d3748; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: var(--bg); color: var(--text); padding: 2rem; line-height: 1.6; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { color: var(--accent); margin-bottom: 0.5rem; font-size: 2rem; }
  h2 { color: var(--accent); margin: 1.5rem 0 1rem; font-size: 1.3rem; }
  h3 { color: var(--text); margin: 1rem 0 0.5rem; font-size: 1.1rem; }
  .subtitle { color: var(--text-secondary); margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .card { background: var(--card); border-radius: 12px; padding: 1.5rem; }
  .stat { text-align: center; padding: 1rem; background: var(--card); border-radius: 8px; }
  .stat-value { font-size: 2rem; font-weight: bold; }
  .stat-label { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; }
  .success { color: var(--success); }
  .warning { color: var(--warning); }
  .danger { color: var(--danger); }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
  th { color: var(--text-secondary); font-weight: 500; font-size: 0.85rem; text-transform: uppercase; }
  .badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
  .badge-success { background: var(--success); color: #000; }
  .badge-warning { background: var(--warning); color: #000; }
  .badge-danger { background: var(--danger); color: #fff; }
  .progress-bar { background: var(--border); border-radius: 4px; height: 8px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 4px; }
  .list { list-style: none; }
  .list li { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
  .list li:last-child { border-bottom: none; }
  .footer { margin-top: 3rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding-top: 2rem; border-top: 1px solid var(--border); }
`;

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

export function renderBurnoutHtml(stats: BurnoutStats): string {
  const riskColor = stats.teamRiskLevel === 'critical' || stats.teamRiskLevel === 'high' ? 'danger' :
                    stats.teamRiskLevel === 'medium' ? 'warning' : 'success';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Burnout Risk Analysis - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>🔥 Burnout Risk Analysis</h1>
    <p class="subtitle">Team health and work pattern analysis</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value ${riskColor}">${stats.teamRiskScore}/100</div>
        <div class="stat-label">Risk Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.teamPatterns.avgNightCommitPercentage.toFixed(0)}%</div>
        <div class="stat-label">Night Commits</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.teamPatterns.avgWeekendCommitPercentage.toFixed(0)}%</div>
        <div class="stat-label">Weekend Commits</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.teamPatterns.teamWorkLifeBalance}/100</div>
        <div class="stat-label">Work-Life Balance</div>
      </div>
    </div>

    <h2>Individual Risk Assessment</h2>
    <table>
      <thead>
        <tr>
          <th>Developer</th>
          <th>Risk Level</th>
          <th>Score</th>
          <th>Top Signal</th>
        </tr>
      </thead>
      <tbody>
        ${stats.developerRisks.slice(0, 15).map(dev => `
          <tr>
            <td>${escapeHtml(dev.name)}</td>
            <td><span class="badge badge-${dev.riskLevel === 'critical' || dev.riskLevel === 'high' ? 'danger' : dev.riskLevel === 'medium' ? 'warning' : 'success'}">${dev.riskLevel.toUpperCase()}</span></td>
            <td>${dev.riskScore}/100</td>
            <td>${dev.signals[0]?.description || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${stats.teamPatterns.crunchPeriodsDetected.length > 0 ? `
    <h2>🔥 Crunch Periods Detected</h2>
    <ul class="list">
      ${stats.teamPatterns.crunchPeriodsDetected.slice(0, 5).map(crunch => `
        <li>
          <strong>${crunch.startDate.toISOString().split('T')[0]} - ${crunch.endDate.toISOString().split('T')[0]}</strong>
          <br><span style="color: var(--text-secondary)">${crunch.durationDays} days, ${crunch.developersInvolved.length} developers, ${crunch.intensity} intensity</span>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    ${stats.recommendations.length > 0 ? `
    <h2>📋 Recommendations</h2>
    <ul class="list">
      ${stats.recommendations.slice(0, 5).map(rec => `
        <li>
          <span class="badge badge-${rec.priority === 'critical' || rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'success'}">${rec.priority.toUpperCase()}</span>
          <strong style="margin-left: 0.5rem">${escapeHtml(rec.target)}</strong>
          <br><span style="color: var(--text-secondary)">${escapeHtml(rec.recommendation)}</span>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderLeaderboardHtml(stats: LeaderboardStats): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leaderboards - GitStats</title>
  <style>${baseStyles}
    .leaderboard { margin-bottom: 2rem; }
    .leaderboard-entry { display: flex; align-items: center; padding: 0.75rem; background: var(--card); margin: 0.5rem 0; border-radius: 8px; }
    .rank { font-size: 1.5rem; width: 50px; text-align: center; }
    .name { flex: 1; font-weight: 500; }
    .value { color: var(--accent); font-weight: bold; }
    .achievement { display: inline-block; margin: 0.25rem; font-size: 1.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🏆 GitStats Leaderboards</h1>
    <p class="subtitle">Gamified repository statistics and achievements</p>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem;">
      ${stats.leaderboards.slice(0, 6).map(board => `
        <div class="leaderboard">
          <h2>${board.emoji} ${escapeHtml(board.name)}</h2>
          <p style="color: var(--text-secondary); margin-bottom: 1rem;">${escapeHtml(board.description)}</p>
          ${board.entries.slice(0, 5).map((entry, i) => `
            <div class="leaderboard-entry">
              <div class="rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1)}</div>
              <div class="name">${escapeHtml(entry.name)}</div>
              <div class="value">${escapeHtml(entry.formattedValue)}</div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>

    ${stats.achievements.length > 0 ? `
    <h2>🎖️ Top Achievers</h2>
    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">
      ${stats.achievements.slice(0, 6).map(dev => `
        <div class="card">
          <h3>${escapeHtml(dev.name)}</h3>
          <p style="color: var(--warning); margin-bottom: 0.5rem;">${dev.level} • ${dev.totalPoints} pts</p>
          <div>${dev.achievements.slice(0, 8).map(a => `<span class="achievement" title="${escapeHtml(a.name)}: ${escapeHtml(a.description)}">${a.emoji}</span>`).join('')}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${stats.funStats.length > 0 ? `
    <h2>🎉 Fun Stats</h2>
    <div class="grid">
      ${stats.funStats.map(stat => `
        <div class="card" style="text-align: center;">
          <div style="font-size: 2rem;">${stat.emoji}</div>
          <h3>${escapeHtml(stat.name)}</h3>
          <p class="success">${escapeHtml(stat.winner)}</p>
          <p style="color: var(--text-secondary); font-size: 0.85rem;">${escapeHtml(stat.value)}</p>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderDeadCodeHtml(stats: DeadCodeStats): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dead Code Detection - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>💀 Dead Code Detection</h1>
    <p class="subtitle">Find and remove unused code</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value">${stats.summary.totalFilesAnalyzed}</div>
        <div class="stat-label">Files Analyzed</div>
      </div>
      <div class="stat">
        <div class="stat-value danger">${stats.summary.deadFilesCount}</div>
        <div class="stat-label">Dead Files</div>
      </div>
      <div class="stat">
        <div class="stat-value warning">${stats.summary.zombieFilesCount}</div>
        <div class="stat-label">Zombie Files</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.summary.deadCodePercentage.toFixed(1)}%</div>
        <div class="stat-label">Dead Code %</div>
      </div>
    </div>

    ${stats.deadFiles.length > 0 ? `
    <h2>💀 Dead Files (not imported anywhere)</h2>
    <table>
      <thead>
        <tr><th>File</th><th>Confidence</th><th>Days Since Modified</th></tr>
      </thead>
      <tbody>
        ${stats.deadFiles.slice(0, 15).map(file => `
          <tr>
            <td>${escapeHtml(file.path)}</td>
            <td><span class="${file.confidence >= 80 ? 'danger' : file.confidence >= 60 ? 'warning' : ''}">${file.confidence}%</span></td>
            <td>${file.daysSinceModified}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.zombieFiles.length > 0 ? `
    <h2>🧟 Zombie Files (single commit, old)</h2>
    <table>
      <thead>
        <tr><th>File</th><th>Author</th><th>Days Old</th></tr>
      </thead>
      <tbody>
        ${stats.zombieFiles.slice(0, 10).map(file => `
          <tr>
            <td>${escapeHtml(file.path)}</td>
            <td>${escapeHtml(file.author)}</td>
            <td>${file.daysSinceModified}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.deprecatedPatterns.length > 0 ? `
    <h2>⚠️ Deprecated Naming Patterns</h2>
    <ul class="list">
      ${stats.deprecatedPatterns.slice(0, 10).map(file => `
        <li>
          <strong>${escapeHtml(file.path)}</strong>
          <br><span style="color: var(--text-secondary)">${escapeHtml(file.reason)}</span>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    ${stats.recommendations.length > 0 ? `
    <h2>📋 Recommendations</h2>
    <ul class="list">
      ${stats.recommendations.slice(0, 5).map(rec => `
        <li>
          <span class="badge badge-${rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'success'}">${rec.priority.toUpperCase()}</span>
          <strong style="margin-left: 0.5rem">${escapeHtml(rec.description)}</strong>
          <br><span style="color: var(--text-secondary)">${escapeHtml(rec.action)} • Savings: ${escapeHtml(rec.potentialSavings)}</span>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderDependencyHtml(stats: DependencyStats): string {
  const healthColor = stats.summary.healthScore >= 70 ? 'success' : stats.summary.healthScore >= 40 ? 'warning' : 'danger';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dependency Analysis - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>🕸️ Dependency Analysis</h1>
    <p class="subtitle">File dependencies and architectural insights</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value ${healthColor}">${stats.summary.healthScore}/100</div>
        <div class="stat-label">Health Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.summary.totalFiles}</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat">
        <div class="stat-value danger">${stats.summary.circularCount}</div>
        <div class="stat-label">Circular Deps</div>
      </div>
      <div class="stat">
        <div class="stat-value warning">${stats.summary.hubCount}</div>
        <div class="stat-label">Hub Files</div>
      </div>
    </div>

    ${stats.circularDependencies.length > 0 ? `
    <h2>🔄 Circular Dependencies</h2>
    <ul class="list">
      ${stats.circularDependencies.slice(0, 5).map(cycle => `
        <li>
          <span class="badge badge-${cycle.severity === 'high' ? 'danger' : cycle.severity === 'medium' ? 'warning' : 'success'}">${cycle.severity.toUpperCase()}</span>
          <strong style="margin-left: 0.5rem">Cycle of ${cycle.length} files</strong>
          <br><code style="color: var(--text-secondary); font-size: 0.85rem;">${cycle.cycle.slice(0, 4).map(f => escapeHtml(f.split('/').pop() || f)).join(' → ')}${cycle.cycle.length > 4 ? ' → ...' : ''}</code>
          <br><span style="color: var(--accent); font-size: 0.85rem;">${escapeHtml(cycle.suggestion)}</span>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    ${stats.hubFiles.length > 0 ? `
    <h2>🎯 Hub Files (high connectivity)</h2>
    <table>
      <thead>
        <tr><th>File</th><th>Fan-In</th><th>Fan-Out</th><th>Type</th></tr>
      </thead>
      <tbody>
        ${stats.hubFiles.slice(0, 10).map(hub => `
          <tr>
            <td>${escapeHtml(hub.path)}</td>
            <td>${hub.fanIn}</td>
            <td>${hub.fanOut}</td>
            <td><span class="badge badge-${hub.type === 'hub-both' ? 'danger' : 'warning'}">${hub.type}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.layerViolations.length > 0 ? `
    <h2>🏛️ Layer Violations</h2>
    <table>
      <thead>
        <tr><th>From</th><th>To</th><th>Violation</th></tr>
      </thead>
      <tbody>
        ${stats.layerViolations.slice(0, 10).map(v => `
          <tr>
            <td>${escapeHtml(v.from.split('/').pop() || v.from)}</td>
            <td>${escapeHtml(v.to.split('/').pop() || v.to)}</td>
            <td class="danger">${escapeHtml(v.fromLayer)} → ${escapeHtml(v.toLayer)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.clusters.length > 0 ? `
    <h2>📦 Module Clusters</h2>
    <div class="grid">
      ${stats.clusters.slice(0, 8).map(cluster => `
        <div class="card">
          <h3>${escapeHtml(cluster.name)}</h3>
          <p>${cluster.files.length} files</p>
          <div class="progress-bar">
            <div class="progress-fill ${cluster.cohesion >= 0.7 ? 'success' : cluster.cohesion >= 0.4 ? 'warning' : 'danger'}" style="width: ${cluster.cohesion * 100}%; background: var(--${cluster.cohesion >= 0.7 ? 'success' : cluster.cohesion >= 0.4 ? 'warning' : 'danger'})"></div>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Cohesion: ${(cluster.cohesion * 100).toFixed(0)}%</p>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderDuplicatesHtml(stats: CopyPasteStats): string {
  const dupColor = stats.summary.duplicationPercentage < 10 ? 'success' : stats.summary.duplicationPercentage < 30 ? 'warning' : 'danger';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Duplication - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>📋 Code Duplication Analysis</h1>
    <p class="subtitle">Detect copy-paste code and refactoring opportunities</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value">${stats.summary.totalFilesAnalyzed}</div>
        <div class="stat-label">Files Analyzed</div>
      </div>
      <div class="stat">
        <div class="stat-value ${dupColor}">${stats.summary.duplicationPercentage.toFixed(1)}%</div>
        <div class="stat-label">Duplication</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.summary.cloneGroupCount}</div>
        <div class="stat-label">Clone Groups</div>
      </div>
      <div class="stat">
        <div class="stat-value success">~${stats.summary.estimatedRefactoringSavings}</div>
        <div class="stat-label">LOC Savings</div>
      </div>
    </div>

    ${stats.similarFiles.length > 0 ? `
    <h2>📄 Similar Files</h2>
    <table>
      <thead>
        <tr><th>File 1</th><th>File 2</th><th>Similarity</th></tr>
      </thead>
      <tbody>
        ${stats.similarFiles.slice(0, 10).map(pair => `
          <tr>
            <td>${escapeHtml(pair.file1.split('/').pop() || pair.file1)}</td>
            <td>${escapeHtml(pair.file2.split('/').pop() || pair.file2)}</td>
            <td><span class="${pair.similarity >= 80 ? 'danger' : 'warning'}">${pair.similarity}%</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.cloneGroups.length > 0 ? `
    <h2>🔁 Duplicate Code Blocks</h2>
    <ul class="list">
      ${stats.cloneGroups.slice(0, 8).map(group => `
        <li>
          <strong>Clone Group #${group.id}</strong> - ${group.instances.length} instances, ${group.lines} lines
          <br>
          ${group.instances.slice(0, 3).map(inst => `
            <code style="display: block; color: var(--text-secondary); font-size: 0.85rem; margin: 0.25rem 0;">
              ${escapeHtml(inst.file)}:${inst.startLine}-${inst.endLine}
            </code>
          `).join('')}
          <span style="color: var(--accent); font-size: 0.85rem;">${escapeHtml(group.suggestion)}</span>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    ${stats.recommendations.length > 0 ? `
    <h2>📋 Recommendations</h2>
    <ul class="list">
      ${stats.recommendations.slice(0, 5).map(rec => `
        <li>
          <span class="badge badge-${rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'success'}">${rec.priority.toUpperCase()}</span>
          <strong style="margin-left: 0.5rem">${escapeHtml(rec.description)}</strong>
          <br><span style="color: var(--text-secondary)">${escapeHtml(rec.action)} • Savings: ~${rec.estimatedSavings} LOC</span>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderVelocityHtml(stats: VelocityStats): string {
  const trendColor = stats.trend === 'accelerating' ? 'success' : stats.trend === 'decelerating' ? 'danger' : 'warning';
  const trendEmoji = stats.trend === 'accelerating' ? '📈' : stats.trend === 'decelerating' ? '📉' : '➡️';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Development Velocity - GitStats</title>
  <style>${baseStyles}
    .bar { background: var(--accent); height: 20px; border-radius: 4px; min-width: 2px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Development Velocity</h1>
    <p class="subtitle">Track development pace and trends</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value">${stats.commitsPerDay.toFixed(2)}</div>
        <div class="stat-label">Commits/Day</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.commitsPerWeek.toFixed(1)}</div>
        <div class="stat-label">Commits/Week</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.commitsPerMonth.toFixed(0)}</div>
        <div class="stat-label">Commits/Month</div>
      </div>
      <div class="stat">
        <div class="stat-value ${trendColor}">${trendEmoji}</div>
        <div class="stat-label">${stats.trend} (${stats.trendPercentage > 0 ? '+' : ''}${stats.trendPercentage.toFixed(0)}%)</div>
      </div>
    </div>

    <div class="grid">
      <div class="stat">
        <div class="stat-value">${stats.consistencyScore.toFixed(0)}%</div>
        <div class="stat-label">Consistency</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.averageTimeBetweenCommits.toFixed(1)}h</div>
        <div class="stat-label">Avg Time Between</div>
      </div>
      ${stats.busiestWeek ? `
      <div class="stat">
        <div class="stat-value" style="font-size: 1rem;">${stats.busiestWeek.week}</div>
        <div class="stat-label">Busiest Week (${stats.busiestWeek.commits})</div>
      </div>
      ` : ''}
      ${stats.slowestWeek ? `
      <div class="stat">
        <div class="stat-value" style="font-size: 1rem;">${stats.slowestWeek.week}</div>
        <div class="stat-label">Slowest Week (${stats.slowestWeek.commits})</div>
      </div>
      ` : ''}
    </div>

    ${stats.releaseRhythm && stats.releaseRhythm.releases.length > 0 ? `
    <h2>📦 Release Rhythm</h2>
    <div class="grid">
      <div class="stat">
        <div class="stat-value" style="font-size: 1.2rem;">${stats.releaseRhythm.releaseFrequency}</div>
        <div class="stat-label">Frequency</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.releaseRhythm.averageDaysBetweenReleases}</div>
        <div class="stat-label">Avg Days Between</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.releaseRhythm.daysSinceLastRelease}</div>
        <div class="stat-label">Days Since Last</div>
      </div>
    </div>
    ` : ''}

    ${stats.velocityByDayOfWeek ? `
    <h2>📅 Commits by Day of Week</h2>
    <div class="card">
      ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
        const count = stats.velocityByDayOfWeek![i];
        const max = Math.max(...stats.velocityByDayOfWeek!);
        const width = max > 0 ? (count / max) * 100 : 0;
        return `
          <div style="display: flex; align-items: center; margin: 0.5rem 0;">
            <span style="width: 40px;">${day}</span>
            <div class="bar" style="width: ${width}%; margin: 0 1rem;"></div>
            <span>${count}</span>
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}

    ${stats.codebaseEvolution && stats.codebaseEvolution.monthly.length > 0 ? `
    <h2>📈 Codebase Evolution</h2>
    <div class="grid">
      <div class="stat">
        <div class="stat-value ${stats.codebaseEvolution.totalGrowth >= 0 ? 'success' : 'danger'}">${stats.codebaseEvolution.totalGrowth >= 0 ? '+' : ''}${stats.codebaseEvolution.totalGrowth.toLocaleString()}</div>
        <div class="stat-label">Total LOC Growth</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.codebaseEvolution.averageMonthlyGrowth >= 0 ? '+' : ''}${stats.codebaseEvolution.averageMonthlyGrowth.toLocaleString()}</div>
        <div class="stat-label">Avg Monthly</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="font-size: 1rem;">${stats.codebaseEvolution.fileCountTrend}</div>
        <div class="stat-label">File Trend</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Month</th><th>Net Change</th><th>Added</th><th>Deleted</th><th>Files +/-</th></tr></thead>
      <tbody>
        ${stats.codebaseEvolution.monthly.slice(-12).map(m => `
          <tr>
            <td>${m.month}</td>
            <td class="${m.netChange >= 0 ? 'success' : 'danger'}">${m.netChange >= 0 ? '+' : ''}${m.netChange.toLocaleString()}</td>
            <td class="success">+${m.additions.toLocaleString()}</td>
            <td class="danger">-${m.deletions.toLocaleString()}</td>
            <td>+${m.filesAdded}/-${m.filesDeleted}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderBusFactorHtml(stats: BusFactorAnalysis): string {
  const bfColor = stats.overall <= 1 ? 'danger' : stats.overall <= 2 ? 'warning' : 'success';
  const bfEmoji = stats.overall <= 1 ? '🚨' : stats.overall <= 2 ? '⚠️' : '✅';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bus Factor Analysis - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>🚌 Bus Factor Analysis</h1>
    <p class="subtitle">Knowledge distribution and risk assessment</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value ${bfColor}">${stats.overall} ${bfEmoji}</div>
        <div class="stat-label">Overall Bus Factor</div>
      </div>
      <div class="stat">
        <div class="stat-value danger">${stats.criticalAreas.filter((a: CriticalArea) => a.risk === 'high').length}</div>
        <div class="stat-label">High Risk Areas</div>
      </div>
      <div class="stat">
        <div class="stat-value warning">${stats.criticalAreas.filter((a: CriticalArea) => a.risk === 'medium').length}</div>
        <div class="stat-label">Medium Risk Areas</div>
      </div>
    </div>

    ${stats.criticalAreas.filter((a: CriticalArea) => a.risk === 'high').length > 0 ? `
    <h2>🚨 Critical Files (Single Point of Failure)</h2>
    <table>
      <thead>
        <tr><th>File</th><th>Risk</th><th>Owner</th></tr>
      </thead>
      <tbody>
        ${stats.criticalAreas.filter((a: CriticalArea) => a.risk === 'high').slice(0, 15).map((area: CriticalArea) => `
          <tr>
            <td>${escapeHtml(area.path)}</td>
            <td><span class="badge badge-danger">HIGH</span></td>
            <td>${area.soleContributor ? escapeHtml(area.soleContributor.name) : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : '<div class="card"><p class="success">✅ No critical risk areas detected</p></div>'}

    ${stats.criticalAreas.filter((a: CriticalArea) => a.risk === 'medium').length > 0 ? `
    <h2>⚠️ Medium Risk Files</h2>
    <table>
      <thead>
        <tr><th>File</th><th>Risk</th><th>Owner</th></tr>
      </thead>
      <tbody>
        ${stats.criticalAreas.filter((a: CriticalArea) => a.risk === 'medium').slice(0, 10).map((area: CriticalArea) => `
          <tr>
            <td>${escapeHtml(area.path)}</td>
            <td><span class="badge badge-warning">MEDIUM</span></td>
            <td>${area.soleContributor ? escapeHtml(area.soleContributor.name) : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderWorkPatternsHtml(stats: WorkPatternsStats): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const balanceColor = stats.workLifeBalance >= 70 ? 'success' : stats.workLifeBalance >= 40 ? 'warning' : 'danger';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Work Patterns - GitStats</title>
  <style>${baseStyles}
    .hour-grid { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; margin: 1rem 0; }
    .hour-cell { height: 30px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⏰ Work Patterns Analysis</h1>
    <p class="subtitle">Team work habits and schedule insights</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value">${stats.peakHour.toString().padStart(2, '0')}:00</div>
        <div class="stat-label">Peak Hour</div>
      </div>
      <div class="stat">
        <div class="stat-value">${days[stats.peakDay]}</div>
        <div class="stat-label">Peak Day</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.nightOwlPercentage.toFixed(1)}%</div>
        <div class="stat-label">Night Commits</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.weekendPercentage.toFixed(1)}%</div>
        <div class="stat-label">Weekend Commits</div>
      </div>
      <div class="stat">
        <div class="stat-value ${balanceColor}">${stats.workLifeBalance.toFixed(0)}/100</div>
        <div class="stat-label">Work-Life Balance</div>
      </div>
    </div>

    <h2>📊 Hourly Distribution</h2>
    <div class="card">
      <div class="hour-grid">
        ${stats.hourlyDistribution.map((count, i) => {
          const max = Math.max(...stats.hourlyDistribution);
          const intensity = max > 0 ? count / max : 0;
          const color = `rgba(0, 217, 255, ${intensity})`;
          return `<div class="hour-cell" style="background: ${color};" title="${i}:00 - ${count} commits"></div>`;
        }).join('')}
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary);">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>

    <h2>📅 Daily Distribution</h2>
    <div class="card">
      ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => {
        const count = stats.dailyDistribution[i];
        const max = Math.max(...stats.dailyDistribution);
        const width = max > 0 ? (count / max) * 100 : 0;
        return `
          <div style="display: flex; align-items: center; margin: 0.5rem 0;">
            <span style="width: 100px;">${day}</span>
            <div style="flex: 1; background: var(--border); height: 20px; border-radius: 4px; overflow: hidden;">
              <div style="width: ${width}%; height: 100%; background: var(--accent);"></div>
            </div>
            <span style="width: 60px; text-align: right;">${count}</span>
          </div>
        `;
      }).join('')}
    </div>

    ${stats.crunchPeriods.length > 0 ? `
    <h2>🔥 Crunch Periods Detected</h2>
    <ul class="list">
      ${stats.crunchPeriods.slice(0, 5).map(period => `
        <li>
          <span class="badge badge-${period.severity === 'severe' ? 'danger' : period.severity === 'moderate' ? 'warning' : 'success'}">${period.severity.toUpperCase()}</span>
          <strong style="margin-left: 0.5rem">${period.startDate} to ${period.endDate}</strong>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderComplexityHtml(stats: ComplexityStats): string {
  const debtColor = (stats.technicalDebtScore || 0) < 30 ? 'success' : (stats.technicalDebtScore || 0) < 60 ? 'warning' : 'danger';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Complexity - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>🧩 Code Complexity Analysis</h1>
    <p class="subtitle">Technical debt and complexity metrics</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value ${debtColor}">${stats.technicalDebtScore || 0}/100</div>
        <div class="stat-label">Technical Debt Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.debtTrend === 'increasing' ? '📈' : stats.debtTrend === 'decreasing' ? '📉' : '➡️'}</div>
        <div class="stat-label">${stats.debtTrend || 'stable'}</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.godFiles.length}</div>
        <div class="stat-label">God Files</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.filesWithHighChurn}</div>
        <div class="stat-label">High Churn Files</div>
      </div>
    </div>

    ${stats.debtIndicators && stats.debtIndicators.length > 0 ? `
    <h2>💳 Debt Indicators</h2>
    <table>
      <thead><tr><th>Indicator</th><th>Status</th><th>Value</th><th>Description</th></tr></thead>
      <tbody>
        ${stats.debtIndicators.map(ind => `
          <tr>
            <td>${ind.status === 'good' ? '✅' : ind.status === 'warning' ? '⚠️' : '❌'} ${escapeHtml(ind.name)}</td>
            <td><span class="badge badge-${ind.status === 'good' ? 'success' : ind.status === 'warning' ? 'warning' : 'danger'}">${ind.status.toUpperCase()}</span></td>
            <td>${ind.value}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(ind.description)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.godFiles.length > 0 ? `
    <h2>⚠️ God Files</h2>
    <table>
      <thead><tr><th>File</th><th>Reason</th></tr></thead>
      <tbody>
        ${stats.godFiles.slice(0, 10).map(file => `
          <tr>
            <td>${escapeHtml(file.path)}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(file.reason)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.criticalHotspots && stats.criticalHotspots.length > 0 ? `
    <h2>🔥 Critical Hotspots</h2>
    <table>
      <thead><tr><th>File</th><th>Risk</th><th>Score</th><th>Commits</th><th>Changes</th></tr></thead>
      <tbody>
        ${stats.criticalHotspots.slice(0, 10).map(hotspot => `
          <tr>
            <td>${escapeHtml(hotspot.path)}</td>
            <td><span class="badge badge-${hotspot.riskLevel === 'critical' ? 'danger' : hotspot.riskLevel === 'high' ? 'warning' : 'success'}">${hotspot.riskLevel.toUpperCase()}</span></td>
            <td>${hotspot.riskScore}%</td>
            <td>${hotspot.commitCount}</td>
            <td>${hotspot.totalChanges.toLocaleString()}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.refactoringCandidates.length > 0 ? `
    <h2>🔧 Refactoring Candidates</h2>
    <ul class="list">
      ${stats.refactoringCandidates.slice(0, 8).map(file => `
        <li>
          <strong>${escapeHtml(file.path)}</strong>
          <br><span style="color: var(--accent);">${escapeHtml(file.suggestion)}</span>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderCommitQualityHtml(stats: CommitQualityStats): string {
  const qualityColor = stats.qualityScore >= 80 ? 'success' : stats.qualityScore >= 60 ? 'warning' : 'danger';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commit Quality - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>📝 Commit Quality Analysis</h1>
    <p class="subtitle">Commit patterns and best practices</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value ${qualityColor}">${stats.qualityScore.toFixed(0)}/100</div>
        <div class="stat-label">Quality Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.atomicCommitScore.toFixed(0)}/100</div>
        <div class="stat-label">Atomic Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.conventionalPercentage.toFixed(0)}%</div>
        <div class="stat-label">Conventional</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.fixPercentage.toFixed(1)}%</div>
        <div class="stat-label">Bugfixes</div>
      </div>
    </div>

    <h2>📊 Commit Types</h2>
    <div class="card">
      ${Object.entries(stats.commitTypes).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([type, count]) => {
        const max = Math.max(...Object.values(stats.commitTypes));
        const width = max > 0 ? (count / max) * 100 : 0;
        return `
          <div style="display: flex; align-items: center; margin: 0.5rem 0;">
            <span style="width: 100px;">${type}</span>
            <div style="flex: 1; background: var(--border); height: 20px; border-radius: 4px; overflow: hidden;">
              <div style="width: ${width}%; height: 100%; background: var(--accent);"></div>
            </div>
            <span style="width: 60px; text-align: right;">${count}</span>
          </div>
        `;
      }).join('')}
    </div>

    ${stats.wipCommits.length > 0 ? `
    <h2>⚠️ WIP Commits (${stats.wipCommits.length})</h2>
    <table>
      <thead><tr><th>Hash</th><th>Message</th></tr></thead>
      <tbody>
        ${stats.wipCommits.slice(0, 8).map(commit => `
          <tr>
            <td><code>${commit.hash.slice(0, 7)}</code></td>
            <td>${escapeHtml(commit.message.slice(0, 60))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.largeCommits.length > 0 ? `
    <h2>📦 Large Commits (${stats.largeCommits.length})</h2>
    <table>
      <thead><tr><th>Hash</th><th>Files Changed</th></tr></thead>
      <tbody>
        ${stats.largeCommits.slice(0, 8).map(commit => `
          <tr>
            <td><code>${commit.hash.slice(0, 7)}</code></td>
            <td>${commit.filesChanged}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.authorBreakdown && stats.authorBreakdown.length > 0 ? `
    <h2>👥 Author Contribution Breakdown</h2>
    <table>
      <thead><tr><th>Author</th><th>Commits</th><th>Primary Type</th><th>Diversity</th></tr></thead>
      <tbody>
        ${stats.authorBreakdown.slice(0, 10).map(author => `
          <tr>
            <td>${escapeHtml(author.author)}</td>
            <td>${author.totalCommits}</td>
            <td><span class="badge badge-success">${author.primaryType}</span></td>
            <td>${author.diversityScore}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderCollaborationHtml(stats: CollaborationStats): string {
  const scoreColor = stats.collaborationScore >= 70 ? 'success' : stats.collaborationScore >= 40 ? 'warning' : 'danger';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Collaboration - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>🤝 Collaboration Analysis</h1>
    <p class="subtitle">Team collaboration patterns and dynamics</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value ${scoreColor}">${stats.collaborationScore.toFixed(0)}/100</div>
        <div class="stat-label">Collaboration Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.collaborationPairs.length}</div>
        <div class="stat-label">Collab Pairs</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.sharedFiles.length}</div>
        <div class="stat-label">Shared Files</div>
      </div>
      <div class="stat">
        <div class="stat-value warning">${stats.loneWolves.length}</div>
        <div class="stat-label">Lone Wolves</div>
      </div>
    </div>

    ${stats.collaborationPairs.length > 0 ? `
    <h2>👥 Top Collaboration Pairs</h2>
    <table>
      <thead><tr><th>Developer 1</th><th>Developer 2</th><th>Shared Files</th></tr></thead>
      <tbody>
        ${stats.collaborationPairs.slice(0, 10).map(pair => `
          <tr>
            <td>${escapeHtml(pair.author1)}</td>
            <td>${escapeHtml(pair.author2)}</td>
            <td>${pair.sharedFiles}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.sharedFiles.length > 0 ? `
    <h2>📄 Most Shared Files</h2>
    <table>
      <thead><tr><th>File</th><th>Authors</th></tr></thead>
      <tbody>
        ${stats.sharedFiles.slice(0, 10).map(file => `
          <tr>
            <td>${escapeHtml(file.path)}</td>
            <td>${file.authorCount}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.loneWolves.length > 0 ? `
    <h2>🐺 Lone Wolves</h2>
    <table>
      <thead><tr><th>Developer</th><th>Solo %</th></tr></thead>
      <tbody>
        ${stats.loneWolves.slice(0, 8).map(wolf => `
          <tr>
            <td>${escapeHtml(wolf.name)}</td>
            <td class="warning">${wolf.soloPercentage.toFixed(1)}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderCouplingHtml(stats: CouplingStats): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coupling Analysis - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>🔗 Coupling Analysis</h1>
    <p class="subtitle">File coupling and hidden dependencies</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value">${stats.couplingScore.toFixed(0)}/100</div>
        <div class="stat-label">Coupling Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.temporalCoupling.length}</div>
        <div class="stat-label">Coupled Pairs</div>
      </div>
      <div class="stat">
        <div class="stat-value warning">${stats.highImpactCommits.length}</div>
        <div class="stat-label">High Impact Commits</div>
      </div>
      <div class="stat">
        <div class="stat-value danger">${stats.hiddenDependencies.length}</div>
        <div class="stat-label">Hidden Deps</div>
      </div>
    </div>

    ${stats.temporalCoupling.length > 0 ? `
    <h2>🔄 Temporal Coupling</h2>
    <table>
      <thead><tr><th>File 1</th><th>File 2</th><th>Strength</th></tr></thead>
      <tbody>
        ${stats.temporalCoupling.slice(0, 15).map(pair => {
          const strength = Math.min(100, Math.round(pair.couplingStrength));
          const color = strength > 80 ? 'danger' : strength > 50 ? 'warning' : 'success';
          return `
            <tr>
              <td>${escapeHtml(pair.file1.split('/').pop() || pair.file1)}</td>
              <td>${escapeHtml(pair.file2.split('/').pop() || pair.file2)}</td>
              <td><span class="${color}">${strength}%</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.highImpactCommits.length > 0 ? `
    <h2>⚡ High Impact Commits</h2>
    <table>
      <thead><tr><th>Hash</th><th>Files</th><th>Impact Score</th></tr></thead>
      <tbody>
        ${stats.highImpactCommits.slice(0, 10).map(commit => `
          <tr>
            <td><code>${commit.hash.slice(0, 7)}</code></td>
            <td>${commit.filesChanged}</td>
            <td>${commit.impactScore.toFixed(0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.hiddenDependencies.length > 0 ? `
    <h2>🕵️ Hidden Dependencies</h2>
    <ul class="list">
      ${stats.hiddenDependencies.slice(0, 10).map(dep => `
        <li>
          <strong>${escapeHtml(dep.file1.split('/').pop() || dep.file1)} ↔ ${escapeHtml(dep.file2.split('/').pop() || dep.file2)}</strong>
          <br><span style="color: var(--text-secondary);">${escapeHtml(dep.reason)}</span>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderHealthHtml(stats: HealthStats): string {
  const scoreColor = stats.healthScore >= 80 ? 'success' : stats.healthScore >= 60 ? 'warning' : 'danger';
  const scoreEmoji = stats.healthScore >= 80 ? '💚' : stats.healthScore >= 60 ? '💛' : '❤️';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Repository Health - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>🏥 Repository Health</h1>
    <p class="subtitle">Code freshness and maintenance status</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value ${scoreColor}">${stats.healthScore} ${scoreEmoji}</div>
        <div class="stat-label">Health Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.zombieFiles.length}</div>
        <div class="stat-label">Zombie Files</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.abandonedDirs.length}</div>
        <div class="stat-label">Abandoned Dirs</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.legacyFiles.filter(f => f.risk === 'high').length}</div>
        <div class="stat-label">High Risk Legacy</div>
      </div>
    </div>

    <h2>📊 Health Indicators</h2>
    <table>
      <thead><tr><th>Indicator</th><th>Status</th><th>Value</th><th>Description</th></tr></thead>
      <tbody>
        ${stats.indicators.map(ind => `
          <tr>
            <td>${ind.status === 'good' ? '✅' : ind.status === 'warning' ? '⚠️' : '❌'} ${escapeHtml(ind.name)}</td>
            <td><span class="badge badge-${ind.status === 'good' ? 'success' : ind.status === 'warning' ? 'warning' : 'danger'}">${ind.status.toUpperCase()}</span></td>
            <td>${ind.value}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(ind.description)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>📅 File Age Distribution</h2>
    <div class="card">
      ${[
        { name: 'Fresh (<30d)', value: stats.ageDistribution.fresh, color: 'success' },
        { name: 'Recent (30-90d)', value: stats.ageDistribution.recent, color: 'accent' },
        { name: 'Aging (90-180d)', value: stats.ageDistribution.aging, color: 'warning' },
        { name: 'Old (180-365d)', value: stats.ageDistribution.old, color: 'danger' },
        { name: 'Ancient (>365d)', value: stats.ageDistribution.ancient, color: 'danger' },
      ].map(cat => {
        const total = Object.values(stats.ageDistribution).reduce((a, b) => a + b, 0);
        const pct = total > 0 ? (cat.value / total) * 100 : 0;
        return `
          <div style="display: flex; align-items: center; margin: 0.5rem 0;">
            <span style="width: 140px;">${cat.name}</span>
            <div style="flex: 1; background: var(--border); height: 20px; border-radius: 4px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: var(--${cat.color});"></div>
            </div>
            <span style="width: 80px; text-align: right;">${cat.value} (${pct.toFixed(0)}%)</span>
          </div>
        `;
      }).join('')}
    </div>

    ${stats.zombieFiles.length > 0 ? `
    <h2>🧟 Zombie Files</h2>
    <table>
      <thead><tr><th>File</th><th>Days Since Modified</th></tr></thead>
      <tbody>
        ${stats.zombieFiles.slice(0, 10).map(file => `
          <tr>
            <td>${escapeHtml(file.path)}</td>
            <td>${file.daysSinceModified}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.testMetrics ? `
    <h2>🧪 Test Metrics</h2>
    <div class="grid">
      <div class="stat">
        <div class="stat-value">${stats.testMetrics.testFiles}</div>
        <div class="stat-label">Test Files</div>
      </div>
      <div class="stat">
        <div class="stat-value">${(stats.testMetrics.testToCodeRatio * 100).toFixed(0)}%</div>
        <div class="stat-label">Test/Code Ratio</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="font-size: 1rem;">${stats.testMetrics.testCoverage}</div>
        <div class="stat-label">Est. Coverage</div>
      </div>
    </div>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

export function renderBranchesHtml(stats: BranchesStats): string {
  const scoreColor = stats.branchHealthScore >= 80 ? 'success' : stats.branchHealthScore >= 60 ? 'warning' : 'danger';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Branch Analysis - GitStats</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <h1>🌿 Branch Analysis</h1>
    <p class="subtitle">Branch health and management</p>

    <div class="grid">
      <div class="stat">
        <div class="stat-value ${scoreColor}">${stats.branchHealthScore}/100</div>
        <div class="stat-label">Branch Health</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.totalBranches}</div>
        <div class="stat-label">Total Branches</div>
      </div>
      <div class="stat">
        <div class="stat-value warning">${stats.staleBranches.length}</div>
        <div class="stat-label">Stale Branches</div>
      </div>
      <div class="stat">
        <div class="stat-value danger">${stats.orphanBranches.length}</div>
        <div class="stat-label">Orphan Branches</div>
      </div>
    </div>

    ${stats.branchLifecycle ? `
    <h2>📊 Branch Lifecycle</h2>
    <div class="grid">
      <div class="stat">
        <div class="stat-value" style="font-size: 1rem;">${stats.branchLifecycle.workflowType}</div>
        <div class="stat-label">Workflow Type</div>
      </div>
      <div class="stat">
        <div class="stat-value success">${stats.branchLifecycle.activePercentage}%</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.branchLifecycle.mergeRate}%</div>
        <div class="stat-label">Merge Rate</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.branchLifecycle.estimatedAvgLifespan}d</div>
        <div class="stat-label">Avg Lifespan</div>
      </div>
    </div>
    ` : ''}

    ${stats.namingPatterns.length > 0 ? `
    <h2>📝 Naming Patterns</h2>
    <table>
      <thead><tr><th>Pattern</th><th>Count</th><th>Description</th></tr></thead>
      <tbody>
        ${stats.namingPatterns.map(pattern => `
          <tr>
            <td><code>${escapeHtml(pattern.pattern)}</code></td>
            <td>${pattern.count}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(pattern.description)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.staleBranches.length > 0 ? `
    <h2>⚠️ Stale Branches</h2>
    <table>
      <thead><tr><th>Branch</th><th>Days Since Commit</th><th>Recommendation</th></tr></thead>
      <tbody>
        ${stats.staleBranches.slice(0, 15).map(branch => `
          <tr>
            <td>${escapeHtml(branch.name)}</td>
            <td>${branch.daysSinceCommit}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(branch.recommendation)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${stats.orphanBranches.length > 0 ? `
    <h2>👻 Orphan Branches</h2>
    <table>
      <thead><tr><th>Branch</th><th>Reason</th></tr></thead>
      <tbody>
        ${stats.orphanBranches.slice(0, 10).map(branch => `
          <tr>
            <td>${escapeHtml(branch.name)}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(branch.reason)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <div class="footer">Generated by GitStats • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}
