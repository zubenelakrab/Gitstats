import type {
  Commit,
  AnalysisConfig,
  Analyzer,
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

export class VelocityAnalyzer implements Analyzer<VelocityStats> {
  name = 'velocity-analyzer';
  description = 'Analyzes team velocity and commit trends';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<VelocityStats> {
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
    };
  }
}

export function createVelocityAnalyzer(): VelocityAnalyzer {
  return new VelocityAnalyzer();
}
