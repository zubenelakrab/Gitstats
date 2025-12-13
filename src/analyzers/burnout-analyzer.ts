import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';

export interface BurnoutStats {
  // Overall team burnout risk
  teamRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  teamRiskScore: number; // 0-100

  // Individual developer analysis
  developerRisks: DeveloperBurnoutRisk[];

  // Team-wide patterns
  teamPatterns: TeamBurnoutPatterns;

  // Recommendations
  recommendations: BurnoutRecommendation[];

  // Historical trends
  monthlyTrends: MonthlyBurnoutTrend[];
}

export interface DeveloperBurnoutRisk {
  name: string;
  email: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number; // 0-100

  // Individual signals
  signals: BurnoutSignal[];

  // Metrics
  metrics: {
    nightCommitPercentage: number; // commits after 10pm
    weekendCommitPercentage: number;
    avgCommitHour: number;
    avgMessageLength: number;
    fixCommitRatio: number; // fix commits / total commits
    crunchPeriods: number; // number of intense periods detected
    longestStreak: number; // days without break
    avgTimeBetweenCommits: number; // hours
    recentActivityChange: number; // % change in last 30 days vs previous
  };

  // Work schedule analysis
  workSchedule: {
    preferredHours: number[]; // top 3 hours
    preferredDays: number[]; // top 3 days
    workLifeBalanceScore: number; // 0-100
  };
}

export interface BurnoutSignal {
  type: 'night_commits' | 'weekend_work' | 'crunch_period' | 'message_quality' |
        'fix_ratio' | 'no_breaks' | 'activity_spike' | 'activity_drop';
  severity: 'low' | 'medium' | 'high';
  description: string;
  value: string;
  recommendation: string;
}

export interface TeamBurnoutPatterns {
  // Overall patterns
  avgNightCommitPercentage: number;
  avgWeekendCommitPercentage: number;
  teamWorkLifeBalance: number;

  // Crunch detection
  crunchPeriodsDetected: CrunchPeriodDetail[];

  // Concerning patterns
  developersAtRisk: number;
  developersHealthy: number;

  // Time distribution
  hourlyDistribution: number[]; // 24 hours
  dailyDistribution: number[]; // 7 days
}

export interface CrunchPeriodDetail {
  startDate: Date;
  endDate: Date;
  durationDays: number;
  developersInvolved: string[];
  avgCommitsPerDay: number;
  normalAvgCommitsPerDay: number;
  intensity: 'moderate' | 'high' | 'extreme';
}

export interface BurnoutRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  target: string; // 'team' or developer name
  issue: string;
  recommendation: string;
  impact: string;
}

export interface MonthlyBurnoutTrend {
  month: string;
  teamRiskScore: number;
  nightCommitPercentage: number;
  weekendCommitPercentage: number;
  avgMessageLength: number;
  crunchDays: number;
}

export class BurnoutAnalyzer implements Analyzer<BurnoutStats> {
  name = 'burnout-analyzer';
  description = 'Analyzes work patterns to detect burnout risk';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<BurnoutStats> {
    if (commits.length === 0) {
      return this.emptyStats();
    }

    // Group commits by author
    const commitsByAuthor = this.groupByAuthor(commits);

    // Analyze each developer
    const developerRisks: DeveloperBurnoutRisk[] = [];
    for (const [email, authorCommits] of commitsByAuthor.entries()) {
      const risk = this.analyzeDeveloper(email, authorCommits, commits);
      developerRisks.push(risk);
    }

    // Sort by risk score descending
    developerRisks.sort((a, b) => b.riskScore - a.riskScore);

    // Analyze team patterns
    const teamPatterns = this.analyzeTeamPatterns(commits, developerRisks);

    // Calculate team risk
    const teamRiskScore = this.calculateTeamRiskScore(developerRisks, teamPatterns);
    const teamRiskLevel = this.scoreToLevel(teamRiskScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations(developerRisks, teamPatterns);

    // Calculate monthly trends
    const monthlyTrends = this.calculateMonthlyTrends(commits);

    return {
      teamRiskLevel,
      teamRiskScore,
      developerRisks,
      teamPatterns,
      recommendations,
      monthlyTrends,
    };
  }

  private groupByAuthor(commits: Commit[]): Map<string, Commit[]> {
    const map = new Map<string, Commit[]>();
    for (const commit of commits) {
      const email = commit.author.email;
      if (!map.has(email)) {
        map.set(email, []);
      }
      map.get(email)!.push(commit);
    }
    return map;
  }

  private analyzeDeveloper(email: string, commits: Commit[], allCommits: Commit[]): DeveloperBurnoutRisk {
    const sorted = [...commits].sort((a, b) => a.date.getTime() - b.date.getTime());
    const name = commits[0]?.author.name || email;

    // Calculate metrics
    const nightCommits = commits.filter(c => {
      const hour = c.date.getHours();
      return hour >= 22 || hour < 6;
    });
    const nightCommitPercentage = (nightCommits.length / commits.length) * 100;

    const weekendCommits = commits.filter(c => {
      const day = c.date.getDay();
      return day === 0 || day === 6;
    });
    const weekendCommitPercentage = (weekendCommits.length / commits.length) * 100;

    // Average commit hour
    const hours = commits.map(c => c.date.getHours());
    const avgCommitHour = hours.reduce((a, b) => a + b, 0) / hours.length;

    // Message quality
    const messageLengths = commits.map(c => c.message.length);
    const avgMessageLength = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;

    // Fix commit ratio
    const fixCommits = commits.filter(c =>
      /^fix/i.test(c.message) || /bug\s*fix/i.test(c.message) || /hot\s*fix/i.test(c.message)
    );
    const fixCommitRatio = (fixCommits.length / commits.length) * 100;

    // Crunch periods detection
    const crunchPeriods = this.detectCrunchPeriods(sorted);

    // Longest streak without break
    const longestStreak = this.calculateLongestStreak(sorted);

    // Average time between commits
    const avgTimeBetweenCommits = this.calculateAvgTimeBetweenCommits(sorted);

    // Recent activity change
    const recentActivityChange = this.calculateRecentActivityChange(sorted);

    // Work schedule analysis
    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);
    commits.forEach(c => {
      hourCounts[c.date.getHours()]++;
      dayCounts[c.date.getDay()]++;
    });

    const preferredHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(x => x.hour);

    const preferredDays = dayCounts
      .map((count, day) => ({ day, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(x => x.day);

    // Work-life balance score (0-100, higher is better)
    const workLifeBalanceScore = Math.max(0, 100 -
      (nightCommitPercentage * 1.5) -
      (weekendCommitPercentage * 1.2) -
      (crunchPeriods * 5)
    );

    const metrics = {
      nightCommitPercentage,
      weekendCommitPercentage,
      avgCommitHour,
      avgMessageLength,
      fixCommitRatio,
      crunchPeriods,
      longestStreak,
      avgTimeBetweenCommits,
      recentActivityChange,
    };

    // Generate signals
    const signals = this.generateSignals(metrics);

    // Calculate risk score
    const riskScore = this.calculateDeveloperRiskScore(metrics, signals);
    const riskLevel = this.scoreToLevel(riskScore);

    return {
      name,
      email,
      riskLevel,
      riskScore,
      signals,
      metrics,
      workSchedule: {
        preferredHours,
        preferredDays,
        workLifeBalanceScore,
      },
    };
  }

  private generateSignals(metrics: DeveloperBurnoutRisk['metrics']): BurnoutSignal[] {
    const signals: BurnoutSignal[] = [];

    // Night commits
    if (metrics.nightCommitPercentage > 40) {
      signals.push({
        type: 'night_commits',
        severity: 'high',
        description: 'Very high percentage of late-night commits',
        value: `${metrics.nightCommitPercentage.toFixed(0)}% of commits after 10pm`,
        recommendation: 'Consider adjusting workload or deadlines',
      });
    } else if (metrics.nightCommitPercentage > 20) {
      signals.push({
        type: 'night_commits',
        severity: 'medium',
        description: 'Elevated late-night work detected',
        value: `${metrics.nightCommitPercentage.toFixed(0)}% of commits after 10pm`,
        recommendation: 'Monitor for sustained patterns',
      });
    }

    // Weekend work
    if (metrics.weekendCommitPercentage > 30) {
      signals.push({
        type: 'weekend_work',
        severity: 'high',
        description: 'Significant weekend work detected',
        value: `${metrics.weekendCommitPercentage.toFixed(0)}% of commits on weekends`,
        recommendation: 'Ensure adequate time off is taken',
      });
    } else if (metrics.weekendCommitPercentage > 15) {
      signals.push({
        type: 'weekend_work',
        severity: 'medium',
        description: 'Regular weekend work detected',
        value: `${metrics.weekendCommitPercentage.toFixed(0)}% of commits on weekends`,
        recommendation: 'Review project timelines',
      });
    }

    // Crunch periods
    if (metrics.crunchPeriods >= 3) {
      signals.push({
        type: 'crunch_period',
        severity: 'high',
        description: 'Multiple crunch periods detected',
        value: `${metrics.crunchPeriods} intense work periods`,
        recommendation: 'Address root causes of recurring crunches',
      });
    } else if (metrics.crunchPeriods >= 1) {
      signals.push({
        type: 'crunch_period',
        severity: 'medium',
        description: 'Crunch period detected',
        value: `${metrics.crunchPeriods} intense work period(s)`,
        recommendation: 'Allow recovery time after intense periods',
      });
    }

    // Message quality decline
    if (metrics.avgMessageLength < 15) {
      signals.push({
        type: 'message_quality',
        severity: 'medium',
        description: 'Very short commit messages may indicate fatigue',
        value: `Average ${metrics.avgMessageLength.toFixed(0)} characters`,
        recommendation: 'Encourage detailed commit messages',
      });
    }

    // High fix ratio
    if (metrics.fixCommitRatio > 50) {
      signals.push({
        type: 'fix_ratio',
        severity: 'high',
        description: 'Majority of commits are fixes - possible firefighting mode',
        value: `${metrics.fixCommitRatio.toFixed(0)}% are fix commits`,
        recommendation: 'Allocate time for proactive improvements',
      });
    } else if (metrics.fixCommitRatio > 30) {
      signals.push({
        type: 'fix_ratio',
        severity: 'medium',
        description: 'High proportion of fix commits',
        value: `${metrics.fixCommitRatio.toFixed(0)}% are fix commits`,
        recommendation: 'Review code quality practices',
      });
    }

    // Long streaks without breaks
    if (metrics.longestStreak > 21) {
      signals.push({
        type: 'no_breaks',
        severity: 'high',
        description: 'Extended period without breaks',
        value: `${metrics.longestStreak} consecutive days with commits`,
        recommendation: 'Ensure regular time off is taken',
      });
    } else if (metrics.longestStreak > 14) {
      signals.push({
        type: 'no_breaks',
        severity: 'medium',
        description: 'Long streak without apparent breaks',
        value: `${metrics.longestStreak} consecutive days with commits`,
        recommendation: 'Monitor work-life balance',
      });
    }

    // Activity spike
    if (metrics.recentActivityChange > 100) {
      signals.push({
        type: 'activity_spike',
        severity: 'high',
        description: 'Dramatic increase in recent activity',
        value: `${metrics.recentActivityChange.toFixed(0)}% increase vs previous period`,
        recommendation: 'Verify if workload is sustainable',
      });
    } else if (metrics.recentActivityChange > 50) {
      signals.push({
        type: 'activity_spike',
        severity: 'medium',
        description: 'Significant increase in activity',
        value: `${metrics.recentActivityChange.toFixed(0)}% increase vs previous period`,
        recommendation: 'Check if additional support is needed',
      });
    }

    // Activity drop (could indicate disengagement or burnout aftermath)
    if (metrics.recentActivityChange < -50) {
      signals.push({
        type: 'activity_drop',
        severity: 'medium',
        description: 'Significant decrease in recent activity',
        value: `${Math.abs(metrics.recentActivityChange).toFixed(0)}% decrease vs previous period`,
        recommendation: 'Check in with developer - may need support',
      });
    }

    return signals;
  }

  private calculateDeveloperRiskScore(
    metrics: DeveloperBurnoutRisk['metrics'],
    signals: BurnoutSignal[]
  ): number {
    let score = 0;

    // Base metrics contribution
    score += Math.min(30, metrics.nightCommitPercentage * 0.5);
    score += Math.min(20, metrics.weekendCommitPercentage * 0.4);
    score += Math.min(15, metrics.crunchPeriods * 5);
    score += Math.min(10, Math.max(0, 30 - metrics.avgMessageLength) * 0.3);
    score += Math.min(15, metrics.fixCommitRatio * 0.2);
    score += Math.min(10, Math.max(0, metrics.longestStreak - 7) * 0.5);

    // Signal severity bonus
    for (const signal of signals) {
      if (signal.severity === 'high') score += 5;
      else if (signal.severity === 'medium') score += 2;
    }

    return Math.min(100, Math.round(score));
  }

  private detectCrunchPeriods(commits: Commit[]): number {
    if (commits.length < 10) return 0;

    // Group by day
    const dailyCommits = new Map<string, number>();
    commits.forEach(c => {
      const day = c.date.toISOString().split('T')[0];
      dailyCommits.set(day, (dailyCommits.get(day) || 0) + 1);
    });

    const counts = Array.from(dailyCommits.values());
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const threshold = avg * 2.5; // Crunch = 2.5x normal activity

    // Find consecutive high-activity days
    let crunchPeriods = 0;
    let inCrunch = false;
    let crunchDays = 0;

    const sortedDays = Array.from(dailyCommits.entries()).sort();
    for (const [_, count] of sortedDays) {
      if (count >= threshold) {
        if (!inCrunch) {
          inCrunch = true;
          crunchDays = 1;
        } else {
          crunchDays++;
        }
      } else {
        if (inCrunch && crunchDays >= 3) {
          crunchPeriods++;
        }
        inCrunch = false;
        crunchDays = 0;
      }
    }

    // Check if still in crunch at end
    if (inCrunch && crunchDays >= 3) {
      crunchPeriods++;
    }

    return crunchPeriods;
  }

  private calculateLongestStreak(commits: Commit[]): number {
    if (commits.length === 0) return 0;

    const days = new Set<string>();
    commits.forEach(c => {
      days.add(c.date.toISOString().split('T')[0]);
    });

    const sortedDays = Array.from(days).sort();
    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1]);
      const curr = new Date(sortedDays[i]);
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    return maxStreak;
  }

  private calculateAvgTimeBetweenCommits(commits: Commit[]): number {
    if (commits.length < 2) return 0;

    let totalHours = 0;
    for (let i = 1; i < commits.length; i++) {
      const diff = commits[i].date.getTime() - commits[i - 1].date.getTime();
      totalHours += diff / (1000 * 60 * 60);
    }

    return totalHours / (commits.length - 1);
  }

  private calculateRecentActivityChange(commits: Commit[]): number {
    if (commits.length < 10) return 0;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const recent = commits.filter(c => c.date >= thirtyDaysAgo).length;
    const previous = commits.filter(c => c.date >= sixtyDaysAgo && c.date < thirtyDaysAgo).length;

    if (previous === 0) return recent > 0 ? 100 : 0;
    return ((recent - previous) / previous) * 100;
  }

  private analyzeTeamPatterns(commits: Commit[], developerRisks: DeveloperBurnoutRisk[]): TeamBurnoutPatterns {
    // Hour and day distribution
    const hourlyDistribution = new Array(24).fill(0);
    const dailyDistribution = new Array(7).fill(0);

    commits.forEach(c => {
      hourlyDistribution[c.date.getHours()]++;
      dailyDistribution[c.date.getDay()]++;
    });

    // Normalize
    const totalCommits = commits.length;
    const normalizedHourly = hourlyDistribution.map(h => (h / totalCommits) * 100);
    const normalizedDaily = dailyDistribution.map(d => (d / totalCommits) * 100);

    // Team averages
    const avgNight = developerRisks.reduce((sum, d) => sum + d.metrics.nightCommitPercentage, 0) / developerRisks.length;
    const avgWeekend = developerRisks.reduce((sum, d) => sum + d.metrics.weekendCommitPercentage, 0) / developerRisks.length;
    const avgBalance = developerRisks.reduce((sum, d) => sum + d.workSchedule.workLifeBalanceScore, 0) / developerRisks.length;

    // Count risk levels
    const atRisk = developerRisks.filter(d => d.riskLevel === 'high' || d.riskLevel === 'critical').length;
    const healthy = developerRisks.filter(d => d.riskLevel === 'low').length;

    // Detect team-wide crunch periods
    const crunchPeriodsDetected = this.detectTeamCrunchPeriods(commits);

    return {
      avgNightCommitPercentage: avgNight,
      avgWeekendCommitPercentage: avgWeekend,
      teamWorkLifeBalance: avgBalance,
      crunchPeriodsDetected,
      developersAtRisk: atRisk,
      developersHealthy: healthy,
      hourlyDistribution: normalizedHourly,
      dailyDistribution: normalizedDaily,
    };
  }

  private detectTeamCrunchPeriods(commits: Commit[]): CrunchPeriodDetail[] {
    // Group by day
    const dailyData = new Map<string, { commits: number; authors: Set<string> }>();

    commits.forEach(c => {
      const day = c.date.toISOString().split('T')[0];
      if (!dailyData.has(day)) {
        dailyData.set(day, { commits: 0, authors: new Set() });
      }
      const data = dailyData.get(day)!;
      data.commits++;
      data.authors.add(c.author.email);
    });

    const sortedDays = Array.from(dailyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const avgCommitsPerDay = sortedDays.reduce((sum, [_, d]) => sum + d.commits, 0) / sortedDays.length;
    const threshold = avgCommitsPerDay * 2;

    const crunchPeriods: CrunchPeriodDetail[] = [];
    let crunchStart: string | null = null;
    let crunchDays: { date: string; commits: number; authors: Set<string> }[] = [];

    for (const [date, data] of sortedDays) {
      if (data.commits >= threshold) {
        if (!crunchStart) {
          crunchStart = date;
          crunchDays = [];
        }
        crunchDays.push({ date, commits: data.commits, authors: data.authors });
      } else {
        if (crunchStart && crunchDays.length >= 3) {
          const allAuthors = new Set<string>();
          crunchDays.forEach(d => d.authors.forEach(a => allAuthors.add(a)));
          const avgCrunch = crunchDays.reduce((sum, d) => sum + d.commits, 0) / crunchDays.length;

          let intensity: 'moderate' | 'high' | 'extreme';
          if (avgCrunch > avgCommitsPerDay * 4) intensity = 'extreme';
          else if (avgCrunch > avgCommitsPerDay * 3) intensity = 'high';
          else intensity = 'moderate';

          crunchPeriods.push({
            startDate: new Date(crunchStart),
            endDate: new Date(crunchDays[crunchDays.length - 1].date),
            durationDays: crunchDays.length,
            developersInvolved: Array.from(allAuthors),
            avgCommitsPerDay: avgCrunch,
            normalAvgCommitsPerDay: avgCommitsPerDay,
            intensity,
          });
        }
        crunchStart = null;
        crunchDays = [];
      }
    }

    // Check end
    if (crunchStart && crunchDays.length >= 3) {
      const allAuthors = new Set<string>();
      crunchDays.forEach(d => d.authors.forEach(a => allAuthors.add(a)));
      const avgCrunch = crunchDays.reduce((sum, d) => sum + d.commits, 0) / crunchDays.length;

      let intensity: 'moderate' | 'high' | 'extreme';
      if (avgCrunch > avgCommitsPerDay * 4) intensity = 'extreme';
      else if (avgCrunch > avgCommitsPerDay * 3) intensity = 'high';
      else intensity = 'moderate';

      crunchPeriods.push({
        startDate: new Date(crunchStart),
        endDate: new Date(crunchDays[crunchDays.length - 1].date),
        durationDays: crunchDays.length,
        developersInvolved: Array.from(allAuthors),
        avgCommitsPerDay: avgCrunch,
        normalAvgCommitsPerDay: avgCommitsPerDay,
        intensity,
      });
    }

    return crunchPeriods;
  }

  private calculateTeamRiskScore(developerRisks: DeveloperBurnoutRisk[], patterns: TeamBurnoutPatterns): number {
    // Weighted average of individual risks
    const avgIndividualRisk = developerRisks.reduce((sum, d) => sum + d.riskScore, 0) / developerRisks.length;

    // Team pattern factors
    let teamFactor = 0;
    teamFactor += patterns.avgNightCommitPercentage * 0.3;
    teamFactor += patterns.avgWeekendCommitPercentage * 0.2;
    teamFactor += patterns.crunchPeriodsDetected.length * 5;
    teamFactor += (patterns.developersAtRisk / developerRisks.length) * 20;

    return Math.min(100, Math.round(avgIndividualRisk * 0.7 + teamFactor * 0.3));
  }

  private generateRecommendations(
    developerRisks: DeveloperBurnoutRisk[],
    patterns: TeamBurnoutPatterns
  ): BurnoutRecommendation[] {
    const recommendations: BurnoutRecommendation[] = [];

    // Team-level recommendations
    if (patterns.avgNightCommitPercentage > 25) {
      recommendations.push({
        priority: 'high',
        target: 'team',
        issue: 'High percentage of late-night work across the team',
        recommendation: 'Review project deadlines and consider hiring additional resources',
        impact: 'Reduces risk of team-wide burnout and improves code quality',
      });
    }

    if (patterns.crunchPeriodsDetected.length > 2) {
      recommendations.push({
        priority: 'critical',
        target: 'team',
        issue: 'Multiple crunch periods detected - unsustainable pace',
        recommendation: 'Implement better sprint planning and set realistic expectations',
        impact: 'Prevents chronic stress and reduces turnover risk',
      });
    }

    if (patterns.developersAtRisk > patterns.developersHealthy) {
      recommendations.push({
        priority: 'critical',
        target: 'team',
        issue: 'Majority of developers showing burnout signals',
        recommendation: 'Immediate workload assessment and potential team expansion needed',
        impact: 'Critical for team retention and project continuity',
      });
    }

    // Individual recommendations for high-risk developers
    for (const dev of developerRisks.filter(d => d.riskLevel === 'high' || d.riskLevel === 'critical')) {
      const topSignal = dev.signals.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })[0];

      if (topSignal) {
        recommendations.push({
          priority: dev.riskLevel === 'critical' ? 'critical' : 'high',
          target: dev.name,
          issue: topSignal.description,
          recommendation: topSignal.recommendation,
          impact: `Improve work-life balance for ${dev.name}`,
        });
      }
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  private calculateMonthlyTrends(commits: Commit[]): MonthlyBurnoutTrend[] {
    const monthlyData = new Map<string, {
      commits: Commit[];
      nightCommits: number;
      weekendCommits: number;
      totalMessageLength: number;
    }>();

    commits.forEach(c => {
      const month = c.date.toISOString().slice(0, 7);
      if (!monthlyData.has(month)) {
        monthlyData.set(month, {
          commits: [],
          nightCommits: 0,
          weekendCommits: 0,
          totalMessageLength: 0,
        });
      }
      const data = monthlyData.get(month)!;
      data.commits.push(c);

      const hour = c.date.getHours();
      if (hour >= 22 || hour < 6) data.nightCommits++;

      const day = c.date.getDay();
      if (day === 0 || day === 6) data.weekendCommits++;

      data.totalMessageLength += c.message.length;
    });

    const trends: MonthlyBurnoutTrend[] = [];
    for (const [month, data] of monthlyData.entries()) {
      const total = data.commits.length;
      const nightPct = (data.nightCommits / total) * 100;
      const weekendPct = (data.weekendCommits / total) * 100;
      const avgMsg = data.totalMessageLength / total;

      // Simple risk score for the month
      const riskScore = Math.min(100, Math.round(nightPct * 1.5 + weekendPct * 1.2));

      // Count crunch days
      const dailyCommits = new Map<string, number>();
      data.commits.forEach(c => {
        const day = c.date.toISOString().split('T')[0];
        dailyCommits.set(day, (dailyCommits.get(day) || 0) + 1);
      });
      const avgPerDay = total / dailyCommits.size;
      const crunchDays = Array.from(dailyCommits.values()).filter(c => c > avgPerDay * 2).length;

      trends.push({
        month,
        teamRiskScore: riskScore,
        nightCommitPercentage: nightPct,
        weekendCommitPercentage: weekendPct,
        avgMessageLength: avgMsg,
        crunchDays,
      });
    }

    return trends.sort((a, b) => a.month.localeCompare(b.month));
  }

  private scoreToLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 70) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  private emptyStats(): BurnoutStats {
    return {
      teamRiskLevel: 'low',
      teamRiskScore: 0,
      developerRisks: [],
      teamPatterns: {
        avgNightCommitPercentage: 0,
        avgWeekendCommitPercentage: 0,
        teamWorkLifeBalance: 100,
        crunchPeriodsDetected: [],
        developersAtRisk: 0,
        developersHealthy: 0,
        hourlyDistribution: new Array(24).fill(0),
        dailyDistribution: new Array(7).fill(0),
      },
      recommendations: [],
      monthlyTrends: [],
    };
  }
}

export function createBurnoutAnalyzer(): BurnoutAnalyzer {
  return new BurnoutAnalyzer();
}
