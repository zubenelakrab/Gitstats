import type {
  Commit,
  TimelineStats,
  DayStats,
  WeekStats,
  MonthStats,
  YearStats,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';
import {
  toDateString,
  toWeekKey,
  toMonthKey,
  toYearKey,
  getWeekNumber,
  getMonthNumber,
  getYearNumber,
} from '../utils/date.js';

/**
 * Analyzer for timeline-based statistics
 */
export class TimelineAnalyzer implements Analyzer<TimelineStats> {
  name = 'timeline-analyzer';
  description = 'Analyzes commit activity over time';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<TimelineStats> {
    const daily = new Map<string, DayStats>();
    const weekly = new Map<string, WeekStats>();
    const monthly = new Map<string, MonthStats>();
    const yearly = new Map<string, YearStats>();

    // Track first commits per author for "new contributors" calculation
    const authorFirstCommit = new Map<string, number>(); // email -> year

    for (const commit of commits) {
      const authorKey = commit.author.email.toLowerCase();
      const year = getYearNumber(commit.date);

      // Track first commit year per author
      if (!authorFirstCommit.has(authorKey) || authorFirstCommit.get(authorKey)! > year) {
        authorFirstCommit.set(authorKey, year);
      }

      // Calculate additions/deletions
      let additions = 0;
      let deletions = 0;
      for (const file of commit.files) {
        additions += file.additions;
        deletions += file.deletions;
      }

      // Daily stats
      const dayKey = toDateString(commit.date);
      if (!daily.has(dayKey)) {
        daily.set(dayKey, {
          date: dayKey,
          commits: 0,
          additions: 0,
          deletions: 0,
          authors: new Set(),
        });
      }
      const dayStats = daily.get(dayKey)!;
      dayStats.commits++;
      dayStats.additions += additions;
      dayStats.deletions += deletions;
      dayStats.authors.add(authorKey);

      // Weekly stats
      const weekKey = toWeekKey(commit.date);
      if (!weekly.has(weekKey)) {
        weekly.set(weekKey, {
          date: weekKey,
          weekNumber: getWeekNumber(commit.date),
          year: year,
          commits: 0,
          additions: 0,
          deletions: 0,
          authors: new Set(),
        });
      }
      const weekStats = weekly.get(weekKey)!;
      weekStats.commits++;
      weekStats.additions += additions;
      weekStats.deletions += deletions;
      weekStats.authors.add(authorKey);

      // Monthly stats
      const monthKey = toMonthKey(commit.date);
      if (!monthly.has(monthKey)) {
        monthly.set(monthKey, {
          date: monthKey,
          month: getMonthNumber(commit.date),
          year: year,
          commits: 0,
          additions: 0,
          deletions: 0,
          authors: new Set(),
        });
      }
      const monthStats = monthly.get(monthKey)!;
      monthStats.commits++;
      monthStats.additions += additions;
      monthStats.deletions += deletions;
      monthStats.authors.add(authorKey);

      // Yearly stats
      const yearKey = toYearKey(commit.date);
      if (!yearly.has(yearKey)) {
        yearly.set(yearKey, {
          year: year,
          commits: 0,
          additions: 0,
          deletions: 0,
          authors: new Set(),
          newContributors: 0,
        });
      }
      const yearStats = yearly.get(yearKey)!;
      yearStats.commits++;
      yearStats.additions += additions;
      yearStats.deletions += deletions;
      yearStats.authors.add(authorKey);
    }

    // Calculate new contributors per year
    for (const [email, firstYear] of authorFirstCommit) {
      const yearKey = firstYear.toString();
      if (yearly.has(yearKey)) {
        yearly.get(yearKey)!.newContributors++;
      }
    }

    // Convert Maps to Records
    const dailyRecord: Record<string, DayStats> = {};
    for (const [key, value] of daily) {
      dailyRecord[key] = value;
    }

    const weeklyRecord: Record<string, WeekStats> = {};
    for (const [key, value] of weekly) {
      weeklyRecord[key] = value;
    }

    const monthlyRecord: Record<string, MonthStats> = {};
    for (const [key, value] of monthly) {
      monthlyRecord[key] = value;
    }

    const yearlyRecord: Record<string, YearStats> = {};
    for (const [key, value] of yearly) {
      yearlyRecord[key] = value;
    }

    return {
      daily: dailyRecord,
      weekly: weeklyRecord,
      monthly: monthlyRecord,
      yearly: yearlyRecord,
    };
  }
}

export function createTimelineAnalyzer(): TimelineAnalyzer {
  return new TimelineAnalyzer();
}
