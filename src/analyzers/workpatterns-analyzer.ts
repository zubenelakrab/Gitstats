import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';
import {
  getDayOfWeek,
  getHourOfDay,
  toDateString,
} from '../utils/date.js';

export interface WorkPatternsStats {
  // Overall patterns
  peakHour: number;
  peakDay: number; // 0 = Sunday
  nightOwlPercentage: number; // commits between 22:00-06:00
  weekendPercentage: number;

  // Crunch time detection
  crunchPeriods: CrunchPeriod[];

  // Author work patterns
  authorPatterns: AuthorWorkPattern[];

  // Hourly distribution
  hourlyDistribution: number[];

  // Daily distribution
  dailyDistribution: number[];

  // Work-life balance score (0-100, higher = better balance)
  workLifeBalance: number;
}

export interface CrunchPeriod {
  startDate: string;
  endDate: string;
  days: number;
  commits: number;
  averageCommitsPerDay: number;
  normalAverage: number;
  severity: 'mild' | 'moderate' | 'severe';
}

export interface AuthorWorkPattern {
  name: string;
  email: string;
  preferredHours: number[]; // top 3 hours
  preferredDays: number[]; // top 3 days
  nightOwlScore: number; // 0-100
  weekendWarriorScore: number; // 0-100
  consistencyScore: number; // 0-100
  workStyle: 'early-bird' | 'night-owl' | 'nine-to-five' | 'flexible';
}

export class WorkPatternsAnalyzer implements Analyzer<WorkPatternsStats> {
  name = 'workpatterns-analyzer';
  description = 'Analyzes work patterns and detects crunch time';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<WorkPatternsStats> {
    if (commits.length === 0) {
      return this.emptyStats();
    }

    // Hourly and daily distributions
    const hourlyDistribution = new Array(24).fill(0);
    const dailyDistribution = new Array(7).fill(0);

    let nightCommits = 0;
    let weekendCommits = 0;

    // Daily commit counts for crunch detection
    const dailyCommits = new Map<string, number>();

    // Author patterns
    const authorData = new Map<string, {
      name: string;
      email: string;
      hours: number[];
      days: number[];
      commits: number;
    }>();

    for (const commit of commits) {
      const hour = getHourOfDay(commit.date);
      const day = getDayOfWeek(commit.date);
      const dateKey = toDateString(commit.date);

      hourlyDistribution[hour]++;
      dailyDistribution[day]++;

      // Night owl (22:00 - 06:00)
      if (hour >= 22 || hour < 6) {
        nightCommits++;
      }

      // Weekend (Saturday = 6, Sunday = 0)
      if (day === 0 || day === 6) {
        weekendCommits++;
      }

      // Daily counts
      dailyCommits.set(dateKey, (dailyCommits.get(dateKey) || 0) + 1);

      // Author data
      const authorKey = commit.author.email.toLowerCase();
      if (!authorData.has(authorKey)) {
        authorData.set(authorKey, {
          name: commit.author.name,
          email: commit.author.email,
          hours: [],
          days: [],
          commits: 0,
        });
      }

      const author = authorData.get(authorKey)!;
      author.hours.push(hour);
      author.days.push(day);
      author.commits++;
    }

    // Find peak hour and day
    const peakHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));
    const peakDay = dailyDistribution.indexOf(Math.max(...dailyDistribution));

    // Calculate percentages
    const nightOwlPercentage = (nightCommits / commits.length) * 100;
    const weekendPercentage = (weekendCommits / commits.length) * 100;

    // Detect crunch periods
    const crunchPeriods = this.detectCrunchPeriods(dailyCommits);

    // Calculate author patterns
    const authorPatterns = this.calculateAuthorPatterns(authorData);

    // Work-life balance score
    const workLifeBalance = this.calculateWorkLifeBalance(
      nightOwlPercentage,
      weekendPercentage,
      crunchPeriods
    );

    return {
      peakHour,
      peakDay,
      nightOwlPercentage,
      weekendPercentage,
      crunchPeriods,
      authorPatterns,
      hourlyDistribution,
      dailyDistribution,
      workLifeBalance,
    };
  }

  private detectCrunchPeriods(dailyCommits: Map<string, number>): CrunchPeriod[] {
    const periods: CrunchPeriod[] = [];
    const entries = Array.from(dailyCommits.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    if (entries.length < 7) return periods;

    // Calculate normal average
    const allCounts = entries.map(([, count]) => count);
    const normalAverage = allCounts.reduce((a, b) => a + b, 0) / allCounts.length;
    const threshold = normalAverage * 2; // 2x normal is considered crunch

    let crunchStart: string | null = null;
    let crunchCommits = 0;
    let crunchDays = 0;

    for (let i = 0; i < entries.length; i++) {
      const [date, count] = entries[i];

      if (count >= threshold) {
        if (!crunchStart) {
          crunchStart = date;
          crunchCommits = 0;
          crunchDays = 0;
        }
        crunchCommits += count;
        crunchDays++;
      } else if (crunchStart) {
        // End of crunch period
        if (crunchDays >= 3) { // At least 3 days to be considered crunch
          const avgPerDay = crunchCommits / crunchDays;
          let severity: 'mild' | 'moderate' | 'severe';

          if (avgPerDay > normalAverage * 4) {
            severity = 'severe';
          } else if (avgPerDay > normalAverage * 3) {
            severity = 'moderate';
          } else {
            severity = 'mild';
          }

          periods.push({
            startDate: crunchStart,
            endDate: entries[i - 1][0],
            days: crunchDays,
            commits: crunchCommits,
            averageCommitsPerDay: avgPerDay,
            normalAverage,
            severity,
          });
        }
        crunchStart = null;
      }
    }

    return periods.slice(0, 10);
  }

  private calculateAuthorPatterns(
    authorData: Map<string, { name: string; email: string; hours: number[]; days: number[]; commits: number }>
  ): AuthorWorkPattern[] {
    const patterns: AuthorWorkPattern[] = [];

    for (const [, data] of authorData) {
      if (data.commits < 5) continue;

      // Count hours and days
      const hourCounts = new Array(24).fill(0);
      const dayCounts = new Array(7).fill(0);
      let nightCommits = 0;
      let weekendCommits = 0;

      for (const hour of data.hours) {
        hourCounts[hour]++;
        if (hour >= 22 || hour < 6) nightCommits++;
      }

      for (const day of data.days) {
        dayCounts[day]++;
        if (day === 0 || day === 6) weekendCommits++;
      }

      // Get top 3 hours and days
      const preferredHours = hourCounts
        .map((count, hour) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(h => h.hour);

      const preferredDays = dayCounts
        .map((count, day) => ({ day, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(d => d.day);

      // Calculate scores
      const nightOwlScore = (nightCommits / data.commits) * 100;
      const weekendWarriorScore = (weekendCommits / data.commits) * 100;

      // Consistency (how spread out are the commits)
      const hourVariance = this.calculateVariance(hourCounts.filter(c => c > 0));
      const consistencyScore = Math.min(100, hourVariance * 10);

      // Determine work style
      const avgHour = data.hours.reduce((a, b) => a + b, 0) / data.hours.length;
      let workStyle: 'early-bird' | 'night-owl' | 'nine-to-five' | 'flexible';

      if (nightOwlScore > 30) {
        workStyle = 'night-owl';
      } else if (avgHour < 10) {
        workStyle = 'early-bird';
      } else if (avgHour >= 9 && avgHour <= 17 && weekendWarriorScore < 10) {
        workStyle = 'nine-to-five';
      } else {
        workStyle = 'flexible';
      }

      patterns.push({
        name: data.name,
        email: data.email,
        preferredHours,
        preferredDays,
        nightOwlScore,
        weekendWarriorScore,
        consistencyScore,
        workStyle,
      });
    }

    return patterns.sort((a, b) => b.nightOwlScore - a.nightOwlScore);
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateWorkLifeBalance(
    nightOwlPercentage: number,
    weekendPercentage: number,
    crunchPeriods: CrunchPeriod[]
  ): number {
    let score = 100;

    // Deduct for night work
    score -= nightOwlPercentage * 1.5;

    // Deduct for weekend work
    score -= weekendPercentage * 2;

    // Deduct for crunch periods
    for (const period of crunchPeriods) {
      if (period.severity === 'severe') score -= 10;
      else if (period.severity === 'moderate') score -= 5;
      else score -= 2;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private emptyStats(): WorkPatternsStats {
    return {
      peakHour: 0,
      peakDay: 0,
      nightOwlPercentage: 0,
      weekendPercentage: 0,
      crunchPeriods: [],
      authorPatterns: [],
      hourlyDistribution: new Array(24).fill(0),
      dailyDistribution: new Array(7).fill(0),
      workLifeBalance: 100,
    };
  }
}

export function createWorkPatternsAnalyzer(): WorkPatternsAnalyzer {
  return new WorkPatternsAnalyzer();
}
