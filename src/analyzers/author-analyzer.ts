import type {
  Commit,
  Author,
  AuthorStats,
  FileStats,
  AnalysisConfig,
  Analyzer,
} from '../types/index.ts';
import {
  toDateString,
  toMonthKey,
  getDayOfWeek,
  getHourOfDay,
  daysDifference,
} from '../utils/date.ts';

/**
 * Normalize author key for grouping (by email)
 */
function getAuthorKey(author: Author): string {
  return author.email.toLowerCase();
}

/**
 * Analyzer for author statistics
 */
export class AuthorAnalyzer implements Analyzer<AuthorStats[]> {
  name = 'author-analyzer';
  description = 'Analyzes commit activity by author';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<AuthorStats[]> {
    const authorMap = new Map<string, {
      author: Author;
      commits: Commit[];
      additions: number;
      deletions: number;
      filesChanged: Set<string>;
      activeDays: Set<string>;
      commitsByMonth: Map<string, number>;
      commitsByDayOfWeek: number[];
      commitsByHour: number[];
      fileCommits: Map<string, number>;
    }>();

    // Process all commits
    for (const commit of commits) {
      const key = getAuthorKey(commit.author);

      if (!authorMap.has(key)) {
        authorMap.set(key, {
          author: commit.author,
          commits: [],
          additions: 0,
          deletions: 0,
          filesChanged: new Set(),
          activeDays: new Set(),
          commitsByMonth: new Map(),
          commitsByDayOfWeek: new Array(7).fill(0),
          commitsByHour: new Array(24).fill(0),
          fileCommits: new Map(),
        });
      }

      const stats = authorMap.get(key)!;
      stats.commits.push(commit);

      // Accumulate line changes
      for (const file of commit.files) {
        stats.additions += file.additions;
        stats.deletions += file.deletions;
        stats.filesChanged.add(file.path);

        // Track file commits
        const fileCount = stats.fileCommits.get(file.path) || 0;
        stats.fileCommits.set(file.path, fileCount + 1);
      }

      // Track active days
      stats.activeDays.add(toDateString(commit.date));

      // Track by month
      const monthKey = toMonthKey(commit.date);
      const monthCount = stats.commitsByMonth.get(monthKey) || 0;
      stats.commitsByMonth.set(monthKey, monthCount + 1);

      // Track by day of week
      const dayOfWeek = getDayOfWeek(commit.date);
      stats.commitsByDayOfWeek[dayOfWeek]++;

      // Track by hour
      const hour = getHourOfDay(commit.date);
      stats.commitsByHour[hour]++;
    }

    // Convert to AuthorStats array
    const result: AuthorStats[] = [];

    for (const [, data] of authorMap) {
      // Sort commits by date
      data.commits.sort((a, b) => a.date.getTime() - b.date.getTime());

      const firstCommit = data.commits[0].date;
      const lastCommit = data.commits[data.commits.length - 1].date;
      const activeDays = data.activeDays.size;
      const totalDays = daysDifference(firstCommit, lastCommit) || 1;

      // Get top files
      const topFiles: FileStats[] = Array.from(data.fileCommits.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, commitCount]) => ({
          path,
          commits: commitCount,
          additions: 0, // Would need per-file tracking
          deletions: 0,
          authors: [data.author.email],
          lastModified: lastCommit,
          createdAt: firstCommit,
          churnScore: 0,
        }));

      // Convert commitsByMonth map to record
      const commitsByMonth: Record<string, number> = {};
      for (const [month, count] of data.commitsByMonth) {
        commitsByMonth[month] = count;
      }

      result.push({
        author: data.author,
        commits: data.commits.length,
        additions: data.additions,
        deletions: data.deletions,
        filesChanged: data.filesChanged.size,
        firstCommit,
        lastCommit,
        activeDays,
        averageCommitsPerDay: data.commits.length / totalDays,
        topFiles,
        commitsByMonth,
        commitsByDayOfWeek: data.commitsByDayOfWeek,
        commitsByHour: data.commitsByHour,
      });
    }

    // Sort by commit count descending
    result.sort((a, b) => b.commits - a.commits);

    return result;
  }
}

export function createAuthorAnalyzer(): AuthorAnalyzer {
  return new AuthorAnalyzer();
}
