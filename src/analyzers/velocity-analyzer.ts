import type {
  Commit,
  AnalysisConfig,
  Analyzer,
  Tag,
} from '../types/index.ts';
import {
  toWeekKey,
  getWeekNumber,
  getYearNumber,
  daysDifference,
} from '../utils/date.ts';

export interface VelocityStats {
  // Overall velocity
  commitsPerDay: number;
  commitsPerWeek: number;
  commitsPerMonth: number;

  // Trend analysis
  trend: 'accelerating' | 'stable' | 'decelerating';
  trendPercentage: number; // positive = accelerating

  // Weekly breakdown
  weeklyVelocity: WeeklyVelocity[];

  // Author velocity
  authorVelocity: AuthorVelocity[];

  // Peak periods
  busiestWeek: { week: string; commits: number };
  slowestWeek: { week: string; commits: number };

  // Consistency
  consistencyScore: number; // 0-100, higher = more consistent
  averageTimeBetweenCommits: number; // in hours

  // Mean Time Between Large Commits (NEW)
  mtblc: number; // in hours - time between commits with > 500 LOC changes
  largeCommitFrequency: string; // human readable

  // Release rhythm (NEW)
  releaseRhythm: ReleaseRhythm;

  // Velocity by day of week (NEW)
  velocityByDayOfWeek: number[];

  // Sprint/iteration detection (NEW)
  sprintCycles: SprintCycle[];

  // Codebase evolution (NEW)
  codebaseEvolution: CodebaseEvolution;
}

// Monthly evolution of the codebase
export interface CodebaseEvolution {
  monthly: MonthlyEvolution[];
  totalGrowth: number; // net LOC change over entire history
  averageMonthlyGrowth: number;
  largestExpansion: { month: string; additions: number };
  largestRefactor: { month: string; deletions: number };
  fileCountTrend: 'growing' | 'stable' | 'shrinking';
}

export interface MonthlyEvolution {
  month: string;
  additions: number;
  deletions: number;
  netChange: number;
  filesAdded: number;
  filesDeleted: number;
  filesModified: number;
  cumulativeLOC: number; // running total
  cumulativeFiles: number; // running total of unique files
}

export interface WeeklyVelocity {
  week: string;
  year: number;
  weekNumber: number;
  commits: number;
  additions: number;
  deletions: number;
  authors: number;
}

export interface AuthorVelocity {
  name: string;
  email: string;
  commitsPerDay: number;
  averageTimeBetweenCommits: number; // in hours
  activeDays: number;
  totalDays: number; // days since first commit
}

export interface ReleaseRhythm {
  averageDaysBetweenReleases: number;
  releases: ReleaseInfo[];
  releaseFrequency: string; // human readable
  lastRelease: Date | null;
  daysSinceLastRelease: number;
}

export interface ReleaseInfo {
  tag: string;
  date: Date;
  commitsSinceLastRelease: number;
  daysSinceLastRelease: number;
}

export interface SprintCycle {
  startDate: string;
  endDate: string;
  commits: number;
  authors: number;
  intensity: 'high' | 'medium' | 'low';
}

export class VelocityAnalyzer implements Analyzer<VelocityStats> {
  name = 'velocity-analyzer';
  description = 'Analyzes team velocity and commit trends';

  async analyze(commits: Commit[], _config: AnalysisConfig, tags?: Tag[]): Promise<VelocityStats> {
    if (commits.length === 0) {
      return this.emptyStats();
    }

    // Sort commits by date
    const sorted = [...commits].sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstDate = sorted[0].date;
    const lastDate = sorted[sorted.length - 1].date;
    const totalDays = daysDifference(firstDate, lastDate) || 1;

    // Weekly breakdown
    const weeklyMap = new Map<string, {
      commits: number;
      additions: number;
      deletions: number;
      authors: Set<string>;
      year: number;
      weekNumber: number;
    }>();

    for (const commit of sorted) {
      const weekKey = toWeekKey(commit.date);

      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          commits: 0,
          additions: 0,
          deletions: 0,
          authors: new Set(),
          year: getYearNumber(commit.date),
          weekNumber: getWeekNumber(commit.date),
        });
      }

      const week = weeklyMap.get(weekKey)!;
      week.commits++;
      week.authors.add(commit.author.email);

      for (const file of commit.files) {
        week.additions += file.additions;
        week.deletions += file.deletions;
      }
    }

    const weeklyVelocity: WeeklyVelocity[] = Array.from(weeklyMap.entries())
      .map(([week, data]) => ({
        week,
        year: data.year,
        weekNumber: data.weekNumber,
        commits: data.commits,
        additions: data.additions,
        deletions: data.deletions,
        authors: data.authors.size,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Calculate trend (compare first half vs second half)
    const midpoint = Math.floor(weeklyVelocity.length / 2);
    const firstHalf = weeklyVelocity.slice(0, midpoint);
    const secondHalf = weeklyVelocity.slice(midpoint);

    const firstHalfAvg = firstHalf.length > 0
      ? firstHalf.reduce((sum, w) => sum + w.commits, 0) / firstHalf.length
      : 0;
    const secondHalfAvg = secondHalf.length > 0
      ? secondHalf.reduce((sum, w) => sum + w.commits, 0) / secondHalf.length
      : 0;

    const trendPercentage = firstHalfAvg > 0
      ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
      : 0;

    let trend: 'accelerating' | 'stable' | 'decelerating';
    if (trendPercentage > 10) {
      trend = 'accelerating';
    } else if (trendPercentage < -10) {
      trend = 'decelerating';
    } else {
      trend = 'stable';
    }

    // Find busiest and slowest weeks
    const sortedByCommits = [...weeklyVelocity].sort((a, b) => b.commits - a.commits);
    const busiestWeek = sortedByCommits[0] || { week: 'N/A', commits: 0 };
    const slowestWeek = sortedByCommits[sortedByCommits.length - 1] || { week: 'N/A', commits: 0 };

    // Author velocity
    const authorMap = new Map<string, {
      name: string;
      email: string;
      commits: Date[];
      firstCommit: Date;
      lastCommit: Date;
      activeDays: Set<string>;
    }>();

    for (const commit of sorted) {
      const key = commit.author.email.toLowerCase();

      if (!authorMap.has(key)) {
        authorMap.set(key, {
          name: commit.author.name,
          email: commit.author.email,
          commits: [],
          firstCommit: commit.date,
          lastCommit: commit.date,
          activeDays: new Set(),
        });
      }

      const author = authorMap.get(key)!;
      author.commits.push(commit.date);
      author.lastCommit = commit.date;
      author.activeDays.add(commit.date.toISOString().split('T')[0]);
    }

    const authorVelocity: AuthorVelocity[] = Array.from(authorMap.values()).map(author => {
      const authorDays = daysDifference(author.firstCommit, author.lastCommit) || 1;
      const timeBetweenCommits = author.commits.length > 1
        ? this.calculateAverageTimeBetween(author.commits)
        : 0;

      return {
        name: author.name,
        email: author.email,
        commitsPerDay: author.commits.length / authorDays,
        averageTimeBetweenCommits: timeBetweenCommits,
        activeDays: author.activeDays.size,
        totalDays: authorDays,
      };
    }).sort((a, b) => b.commitsPerDay - a.commitsPerDay);

    // Consistency score (based on standard deviation of weekly commits)
    const weeklyCommits = weeklyVelocity.map(w => w.commits);
    const consistencyScore = this.calculateConsistencyScore(weeklyCommits);

    // Average time between commits
    const averageTimeBetweenCommits = this.calculateAverageTimeBetween(sorted.map(c => c.date));

    // Calculate MTBLC (Mean Time Between Large Commits)
    const largeCommits = sorted.filter(c => {
      let totalChanges = 0;
      for (const file of c.files) {
        totalChanges += file.additions + file.deletions;
      }
      return totalChanges > 500;
    });
    const mtblc = this.calculateAverageTimeBetween(largeCommits.map(c => c.date));
    const largeCommitFrequency = this.formatTimeDuration(mtblc);

    // Velocity by day of week
    const velocityByDayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    for (const commit of sorted) {
      velocityByDayOfWeek[commit.date.getDay()]++;
    }

    // Calculate release rhythm from tags
    const releaseRhythm = this.calculateReleaseRhythm(sorted, tags || []);

    // Detect sprint cycles (2-week periods with high activity)
    const sprintCycles = this.detectSprintCycles(weeklyVelocity);

    // Calculate codebase evolution
    const codebaseEvolution = this.calculateCodebaseEvolution(sorted);

    return {
      commitsPerDay: commits.length / totalDays,
      commitsPerWeek: (commits.length / totalDays) * 7,
      commitsPerMonth: (commits.length / totalDays) * 30,
      trend,
      trendPercentage,
      weeklyVelocity,
      authorVelocity,
      busiestWeek: { week: busiestWeek.week, commits: busiestWeek.commits },
      slowestWeek: { week: slowestWeek.week, commits: slowestWeek.commits },
      consistencyScore,
      averageTimeBetweenCommits,
      mtblc,
      largeCommitFrequency,
      releaseRhythm,
      velocityByDayOfWeek,
      sprintCycles,
      codebaseEvolution,
    };
  }

  private calculateAverageTimeBetween(dates: Date[]): number {
    if (dates.length < 2) return 0;

    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    let totalHours = 0;

    for (let i = 1; i < sorted.length; i++) {
      const diff = sorted[i].getTime() - sorted[i - 1].getTime();
      totalHours += diff / (1000 * 60 * 60);
    }

    return totalHours / (sorted.length - 1);
  }

  private calculateConsistencyScore(values: number[]): number {
    if (values.length < 2) return 100;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;

    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;

    // Convert to 0-100 score (lower CV = higher consistency)
    const score = Math.max(0, 100 - (coefficientOfVariation * 100));
    return Math.round(score);
  }

  private formatTimeDuration(hours: number): string {
    if (hours === 0) return 'N/A';
    if (hours < 24) return `${Math.round(hours)} hours`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} days`;
    const weeks = Math.round(days / 7);
    if (weeks < 4) return `${weeks} weeks`;
    const months = Math.round(days / 30);
    return `${months} months`;
  }

  private calculateReleaseRhythm(commits: Commit[], tags: Tag[]): ReleaseRhythm {
    const now = new Date();

    // Filter version-like tags and sort by date
    const versionTags = tags
      .filter(t => /^v?\d+\.\d+/.test(t.name))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (versionTags.length === 0) {
      return {
        averageDaysBetweenReleases: 0,
        releases: [],
        releaseFrequency: 'No releases detected',
        lastRelease: null,
        daysSinceLastRelease: 0,
      };
    }

    const releases: ReleaseInfo[] = [];
    let previousDate: Date | null = null;
    let previousCommitIndex = 0;

    for (const tag of versionTags) {
      const daysSinceLastRelease = previousDate
        ? daysDifference(previousDate, tag.date)
        : 0;

      // Count commits since last release
      let commitsSinceLastRelease = 0;
      for (let i = previousCommitIndex; i < commits.length; i++) {
        if (commits[i].date <= tag.date) {
          commitsSinceLastRelease++;
        } else {
          previousCommitIndex = i;
          break;
        }
      }

      releases.push({
        tag: tag.name,
        date: tag.date,
        commitsSinceLastRelease,
        daysSinceLastRelease,
      });

      previousDate = tag.date;
    }

    // Calculate average days between releases
    const intervals = releases.slice(1).map(r => r.daysSinceLastRelease);
    const averageDaysBetweenReleases = intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 0;

    const lastRelease = versionTags[versionTags.length - 1].date;
    const daysSinceLastRelease = daysDifference(lastRelease, now);

    let releaseFrequency: string;
    if (averageDaysBetweenReleases === 0) {
      releaseFrequency = 'Single release';
    } else if (averageDaysBetweenReleases < 7) {
      releaseFrequency = 'Weekly';
    } else if (averageDaysBetweenReleases < 14) {
      releaseFrequency = 'Bi-weekly';
    } else if (averageDaysBetweenReleases < 35) {
      releaseFrequency = 'Monthly';
    } else if (averageDaysBetweenReleases < 100) {
      releaseFrequency = 'Quarterly';
    } else {
      releaseFrequency = 'Infrequent';
    }

    return {
      averageDaysBetweenReleases: Math.round(averageDaysBetweenReleases),
      releases: releases.slice(-10), // Last 10 releases
      releaseFrequency,
      lastRelease,
      daysSinceLastRelease,
    };
  }

  private detectSprintCycles(weeklyVelocity: WeeklyVelocity[]): SprintCycle[] {
    if (weeklyVelocity.length < 4) return [];

    const cycles: SprintCycle[] = [];
    const avgCommits = weeklyVelocity.reduce((sum, w) => sum + w.commits, 0) / weeklyVelocity.length;

    // Look at 2-week windows
    for (let i = 0; i < weeklyVelocity.length - 1; i += 2) {
      const week1 = weeklyVelocity[i];
      const week2 = weeklyVelocity[i + 1];

      if (!week1 || !week2) continue;

      const totalCommits = week1.commits + week2.commits;
      const totalAuthors = new Set([...Array(week1.authors).keys(), ...Array(week2.authors).keys()]).size;

      let intensity: 'high' | 'medium' | 'low';
      if (totalCommits > avgCommits * 3) intensity = 'high';
      else if (totalCommits > avgCommits * 1.5) intensity = 'medium';
      else intensity = 'low';

      if (intensity !== 'low') {
        cycles.push({
          startDate: week1.week,
          endDate: week2.week,
          commits: totalCommits,
          authors: Math.max(week1.authors, week2.authors),
          intensity,
        });
      }
    }

    return cycles.slice(0, 10);
  }

  private calculateCodebaseEvolution(commits: Commit[]): CodebaseEvolution {
    if (commits.length === 0) {
      return {
        monthly: [],
        totalGrowth: 0,
        averageMonthlyGrowth: 0,
        largestExpansion: { month: 'N/A', additions: 0 },
        largestRefactor: { month: 'N/A', deletions: 0 },
        fileCountTrend: 'stable',
      };
    }

    // Group commits by month
    const monthlyMap = new Map<string, {
      additions: number;
      deletions: number;
      filesAdded: Set<string>;
      filesDeleted: Set<string>;
      filesModified: Set<string>;
    }>();

    // Track all files ever seen
    const allFilesEver = new Set<string>();
    const deletedFiles = new Set<string>();

    for (const commit of commits) {
      const monthKey = commit.date.toISOString().slice(0, 7); // YYYY-MM

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          additions: 0,
          deletions: 0,
          filesAdded: new Set(),
          filesDeleted: new Set(),
          filesModified: new Set(),
        });
      }

      const month = monthlyMap.get(monthKey)!;

      for (const file of commit.files) {
        month.additions += file.additions;
        month.deletions += file.deletions;

        // Detect file status based on additions/deletions
        if (file.additions > 0 && file.deletions === 0 && !allFilesEver.has(file.path)) {
          // New file (only additions, never seen before)
          month.filesAdded.add(file.path);
          allFilesEver.add(file.path);
        } else if (file.deletions > 0 && file.additions === 0) {
          // Potentially deleted file (only deletions)
          month.filesDeleted.add(file.path);
          deletedFiles.add(file.path);
        } else {
          // Modified file
          month.filesModified.add(file.path);
          allFilesEver.add(file.path);
        }
      }
    }

    // Build monthly evolution array with cumulative totals
    const sortedMonths = Array.from(monthlyMap.keys()).sort();
    const monthly: MonthlyEvolution[] = [];
    let cumulativeLOC = 0;
    let cumulativeFiles = 0;

    let largestExpansion = { month: 'N/A', additions: 0 };
    let largestRefactor = { month: 'N/A', deletions: 0 };

    for (const monthKey of sortedMonths) {
      const data = monthlyMap.get(monthKey)!;
      const netChange = data.additions - data.deletions;
      cumulativeLOC += netChange;

      // Track unique files (approximation based on new files seen)
      cumulativeFiles += data.filesAdded.size;
      cumulativeFiles -= data.filesDeleted.size;
      cumulativeFiles = Math.max(0, cumulativeFiles);

      monthly.push({
        month: monthKey,
        additions: data.additions,
        deletions: data.deletions,
        netChange,
        filesAdded: data.filesAdded.size,
        filesDeleted: data.filesDeleted.size,
        filesModified: data.filesModified.size,
        cumulativeLOC,
        cumulativeFiles,
      });

      // Track largest expansion
      if (data.additions > largestExpansion.additions) {
        largestExpansion = { month: monthKey, additions: data.additions };
      }

      // Track largest refactor (most deletions)
      if (data.deletions > largestRefactor.deletions) {
        largestRefactor = { month: monthKey, deletions: data.deletions };
      }
    }

    // Calculate totals and trends
    const totalGrowth = cumulativeLOC;
    const averageMonthlyGrowth = monthly.length > 0
      ? totalGrowth / monthly.length
      : 0;

    // Determine file count trend (compare first third to last third)
    let fileCountTrend: 'growing' | 'stable' | 'shrinking' = 'stable';
    if (monthly.length >= 3) {
      const thirdLength = Math.floor(monthly.length / 3);
      const firstThird = monthly.slice(0, thirdLength);
      const lastThird = monthly.slice(-thirdLength);

      const firstAvgFiles = firstThird.reduce((sum, m) => sum + m.filesAdded.valueOf(), 0) / thirdLength;
      const lastAvgFiles = lastThird.reduce((sum, m) => sum + m.filesAdded.valueOf(), 0) / thirdLength;

      if (lastAvgFiles > firstAvgFiles * 1.2) {
        fileCountTrend = 'growing';
      } else if (lastAvgFiles < firstAvgFiles * 0.8) {
        fileCountTrend = 'shrinking';
      }
    }

    return {
      monthly,
      totalGrowth,
      averageMonthlyGrowth: Math.round(averageMonthlyGrowth),
      largestExpansion,
      largestRefactor,
      fileCountTrend,
    };
  }

  private emptyStats(): VelocityStats {
    return {
      commitsPerDay: 0,
      commitsPerWeek: 0,
      commitsPerMonth: 0,
      trend: 'stable',
      trendPercentage: 0,
      weeklyVelocity: [],
      authorVelocity: [],
      busiestWeek: { week: 'N/A', commits: 0 },
      slowestWeek: { week: 'N/A', commits: 0 },
      consistencyScore: 0,
      averageTimeBetweenCommits: 0,
      mtblc: 0,
      largeCommitFrequency: 'N/A',
      releaseRhythm: {
        averageDaysBetweenReleases: 0,
        releases: [],
        releaseFrequency: 'No releases detected',
        lastRelease: null,
        daysSinceLastRelease: 0,
      },
      velocityByDayOfWeek: [0, 0, 0, 0, 0, 0, 0],
      sprintCycles: [],
      codebaseEvolution: {
        monthly: [],
        totalGrowth: 0,
        averageMonthlyGrowth: 0,
        largestExpansion: { month: 'N/A', additions: 0 },
        largestRefactor: { month: 'N/A', deletions: 0 },
        fileCountTrend: 'stable',
      },
    };
  }
}

export function createVelocityAnalyzer(): VelocityAnalyzer {
  return new VelocityAnalyzer();
}
