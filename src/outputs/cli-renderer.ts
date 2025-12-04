import type {
  AnalysisReport,
  OutputConfig,
  OutputRenderer,
  AuthorStats,
} from '../types/index.ts';
import chalk from 'chalk';
import Table from 'cli-table3';
import { formatDate, getRelativeTime } from '../utils/date.ts';

/**
 * CLI output renderer with colored tables
 */
export class CliRenderer implements OutputRenderer {
  async render(report: AnalysisReport, _config: OutputConfig): Promise<string> {
    const sections: string[] = [];

    // Header
    sections.push(this.renderHeader(report));

    // Summary
    sections.push(this.renderSummary(report));

    // Top Authors
    sections.push(this.renderTopAuthors(report.authors.slice(0, 10)));

    // Hotspots
    sections.push(this.renderHotspots(report));

    // Bus Factor
    sections.push(this.renderBusFactor(report));

    // Activity Heatmap
    sections.push(this.renderActivityHeatmap(report));

    return sections.join('\n\n');
  }

  async save(content: string, path: string): Promise<void> {
    const { writeFile } = await import('node:fs/promises');
    // Strip ANSI codes for file output
    const stripped = content.replace(/\x1b\[[0-9;]*m/g, '');
    await writeFile(path, stripped, 'utf-8');
  }

  private renderHeader(report: AnalysisReport): string {
    const lines = [
      chalk.bold.cyan('═══════════════════════════════════════════════════════════'),
      chalk.bold.cyan(`  GitStats Report: ${report.repository.name}`),
      chalk.bold.cyan('═══════════════════════════════════════════════════════════'),
      '',
      chalk.gray(`  Generated: ${formatDate(report.generatedAt)}`),
      chalk.gray(`  Repository: ${report.repository.path}`),
    ];
    return lines.join('\n');
  }

  private renderSummary(report: AnalysisReport): string {
    const { summary } = report;
    const table = new Table({
      head: [chalk.bold('Metric'), chalk.bold('Value')],
      style: { head: [], border: [] },
    });

    table.push(
      ['Total Commits', chalk.green(summary.totalCommits.toLocaleString())],
      ['Total Authors', chalk.blue(summary.totalAuthors.toString())],
      ['Total Files Changed', summary.totalFiles.toLocaleString()],
      ['Lines Added', chalk.green(`+${summary.totalAdditions.toLocaleString()}`)],
      ['Lines Deleted', chalk.red(`-${summary.totalDeletions.toLocaleString()}`)],
      ['Repository Age', `${summary.repositoryAge} days`],
      ['Avg Commits/Day', summary.averageCommitsPerDay.toFixed(2)],
      ['Most Active Author', summary.mostActiveAuthor.name],
      ['Most Changed File', this.truncatePath(summary.mostChangedFile, 40)],
    );

    return chalk.bold('\n📊 Summary\n') + table.toString();
  }

  private renderTopAuthors(authors: AuthorStats[]): string {
    const table = new Table({
      head: [
        chalk.bold('#'),
        chalk.bold('Author'),
        chalk.bold('Commits'),
        chalk.bold('Additions'),
        chalk.bold('Deletions'),
        chalk.bold('Files'),
        chalk.bold('Last Active'),
      ],
      style: { head: [], border: [] },
    });

    authors.forEach((author, index) => {
      table.push([
        (index + 1).toString(),
        this.truncate(author.author.name, 20),
        chalk.yellow(author.commits.toString()),
        chalk.green(`+${author.additions.toLocaleString()}`),
        chalk.red(`-${author.deletions.toLocaleString()}`),
        author.filesChanged.toString(),
        getRelativeTime(author.lastCommit),
      ]);
    });

    return chalk.bold('\n👥 Top Contributors\n') + table.toString();
  }

  private renderHotspots(report: AnalysisReport): string {
    const hotFiles = report.hotspots.files.slice(0, 10);

    const table = new Table({
      head: [
        chalk.bold('#'),
        chalk.bold('File'),
        chalk.bold('Commits'),
        chalk.bold('Churn'),
        chalk.bold('Authors'),
      ],
      style: { head: [], border: [] },
    });

    hotFiles.forEach((file, index) => {
      const churnColor = file.churnScore > 100 ? chalk.red :
                        file.churnScore > 50 ? chalk.yellow : chalk.green;

      table.push([
        (index + 1).toString(),
        this.truncatePath(file.path, 45),
        file.commits.toString(),
        churnColor(file.churnScore.toFixed(1)),
        file.authors.length.toString(),
      ]);
    });

    return chalk.bold('\n🔥 Code Hotspots (High Churn Files)\n') + table.toString();
  }

  private renderBusFactor(report: AnalysisReport): string {
    const { busFactor } = report;
    const lines: string[] = [];

    // Overall bus factor with visual indicator
    const overallColor = busFactor.overall <= 1 ? chalk.red :
                        busFactor.overall <= 2 ? chalk.yellow : chalk.green;
    const riskEmoji = busFactor.overall <= 1 ? '🚨' :
                      busFactor.overall <= 2 ? '⚠️' : '✅';

    lines.push(chalk.bold('\n🚌 Bus Factor Analysis\n'));
    lines.push(`  Overall Bus Factor: ${overallColor.bold(busFactor.overall.toString())} ${riskEmoji}`);
    lines.push('');

    // Critical areas
    if (busFactor.criticalAreas.length > 0) {
      lines.push(chalk.bold('  Critical Areas (High Risk):'));

      const criticalTable = new Table({
        head: [chalk.bold('File'), chalk.bold('Risk'), chalk.bold('Sole Owner')],
        style: { head: [], border: [] },
      });

      const topCritical = busFactor.criticalAreas
        .filter(a => a.risk === 'high')
        .slice(0, 5);

      for (const area of topCritical) {
        const riskBadge = area.risk === 'high' ? chalk.bgRed.white(' HIGH ') :
                          chalk.bgYellow.black(' MED ');
        criticalTable.push([
          this.truncatePath(area.path, 40),
          riskBadge,
          area.soleContributor?.name || '-',
        ]);
      }

      lines.push(criticalTable.toString());
    } else {
      lines.push(chalk.green('  ✅ No critical risk areas detected'));
    }

    return lines.join('\n');
  }

  private renderActivityHeatmap(report: AnalysisReport): string {
    const lines: string[] = [];
    lines.push(chalk.bold('\n📅 Activity by Day of Week\n'));

    // Aggregate commits by day of week across all authors
    const dayTotals = new Array(7).fill(0);
    for (const author of report.authors) {
      for (let i = 0; i < 7; i++) {
        dayTotals[i] += author.commitsByDayOfWeek[i];
      }
    }

    const maxDay = Math.max(...dayTotals);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 0; i < 7; i++) {
      const ratio = maxDay > 0 ? dayTotals[i] / maxDay : 0;
      const barLength = Math.round(ratio * 30);
      const bar = '█'.repeat(barLength) + '░'.repeat(30 - barLength);
      const coloredBar = ratio > 0.7 ? chalk.green(bar) :
                         ratio > 0.3 ? chalk.yellow(bar) : chalk.gray(bar);

      lines.push(`  ${days[i]} ${coloredBar} ${dayTotals[i]}`);
    }

    // Hour distribution
    lines.push(chalk.bold('\n⏰ Activity by Hour\n'));

    const hourTotals = new Array(24).fill(0);
    for (const author of report.authors) {
      for (let i = 0; i < 24; i++) {
        hourTotals[i] += author.commitsByHour[i];
      }
    }

    const maxHour = Math.max(...hourTotals);
    const hourGroups = [
      { label: 'Night (00-06)', hours: [0, 1, 2, 3, 4, 5] },
      { label: 'Morning (06-12)', hours: [6, 7, 8, 9, 10, 11] },
      { label: 'Afternoon (12-18)', hours: [12, 13, 14, 15, 16, 17] },
      { label: 'Evening (18-24)', hours: [18, 19, 20, 21, 22, 23] },
    ];

    for (const group of hourGroups) {
      const total = group.hours.reduce((sum, h) => sum + hourTotals[h], 0);
      const ratio = maxHour > 0 ? (total / group.hours.length) / maxHour : 0;
      const barLength = Math.round(ratio * 25);
      const bar = '█'.repeat(barLength) + '░'.repeat(25 - barLength);

      lines.push(`  ${group.label.padEnd(18)} ${chalk.cyan(bar)} ${total}`);
    }

    return lines.join('\n');
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  private truncatePath(path: string, maxLength: number): string {
    if (path.length <= maxLength) return path;
    const parts = path.split('/');
    if (parts.length <= 2) return this.truncate(path, maxLength);

    // Keep first and last parts, truncate middle
    const first = parts[0];
    const last = parts.slice(-2).join('/');
    return `${first}/.../${last}`.substring(0, maxLength);
  }
}

export function createCliRenderer(): CliRenderer {
  return new CliRenderer();
}
