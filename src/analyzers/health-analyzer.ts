import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.ts';
import { dirname } from 'node:path';
import { daysDifference } from '../utils/date.ts';

export interface HealthStats {
  // Zombie files (exist but never touched)
  zombieFiles: ZombieFile[];

  // Legacy code (not touched in X months)
  legacyFiles: LegacyFile[];

  // Abandoned directories
  abandonedDirs: AbandonedDir[];

  // Recently active areas
  activeAreas: ActiveArea[];

  // File age distribution
  ageDistribution: AgeDistribution;

  // Overall health score
  healthScore: number;

  // Health indicators
  indicators: HealthIndicator[];
}

export interface ZombieFile {
  path: string;
  lastModified: Date;
  daysSinceModified: number;
  originalAuthor: string;
}

export interface LegacyFile {
  path: string;
  lastModified: Date;
  daysSinceModified: number;
  totalCommits: number;
  authors: string[];
  risk: 'low' | 'medium' | 'high';
}

export interface AbandonedDir {
  path: string;
  fileCount: number;
  lastActivity: Date;
  daysSinceActivity: number;
  lastAuthor: string;
}

export interface ActiveArea {
  path: string;
  recentCommits: number; // last 30 days
  totalCommits: number;
  activeAuthors: number;
  activityLevel: 'hot' | 'warm' | 'cold';
}

export interface AgeDistribution {
  fresh: number; // < 30 days
  recent: number; // 30-90 days
  aging: number; // 90-180 days
  old: number; // 180-365 days
  ancient: number; // > 365 days
}

export interface HealthIndicator {
  name: string;
  status: 'good' | 'warning' | 'critical';
  value: string;
  description: string;
}

export class HealthAnalyzer implements Analyzer<HealthStats> {
  name = 'health-analyzer';
  description = 'Analyzes repository health and identifies stale code';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<HealthStats> {
    if (commits.length === 0) {
      return this.emptyStats();
    }

    const now = new Date();

    // Track file last modified and commit counts
    const fileData = new Map<string, {
      lastModified: Date;
      firstModified: Date;
      commits: number;
      authors: Set<string>;
      lastAuthor: string;
    }>();

    // Track directory activity
    const dirData = new Map<string, {
      lastActivity: Date;
      files: Set<string>;
      commits: number;
      lastAuthor: string;
      recentCommits: number;
    }>();

    // Sort commits oldest first
    const sorted = [...commits].sort((a, b) => a.date.getTime() - b.date.getTime());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const commit of sorted) {
      for (const file of commit.files) {
        // File data
        if (!fileData.has(file.path)) {
          fileData.set(file.path, {
            lastModified: commit.date,
            firstModified: commit.date,
            commits: 0,
            authors: new Set(),
            lastAuthor: commit.author.name,
          });
        }

        const data = fileData.get(file.path)!;
        data.lastModified = commit.date;
        data.commits++;
        data.authors.add(commit.author.email);
        data.lastAuthor = commit.author.name;

        // Directory data
        const dir = dirname(file.path);
        if (!dirData.has(dir)) {
          dirData.set(dir, {
            lastActivity: commit.date,
            files: new Set(),
            commits: 0,
            lastAuthor: commit.author.name,
            recentCommits: 0,
          });
        }

        const dData = dirData.get(dir)!;
        dData.lastActivity = commit.date;
        dData.files.add(file.path);
        dData.commits++;
        dData.lastAuthor = commit.author.name;

        if (commit.date >= thirtyDaysAgo) {
          dData.recentCommits++;
        }
      }
    }

    // Identify zombie files (only 1 commit and > 180 days old)
    const zombieFiles: ZombieFile[] = [];
    const legacyFiles: LegacyFile[] = [];
    const ageDistribution: AgeDistribution = {
      fresh: 0,
      recent: 0,
      aging: 0,
      old: 0,
      ancient: 0,
    };

    for (const [path, data] of fileData) {
      const daysSince = daysDifference(data.lastModified, now);

      // Age distribution
      if (daysSince < 30) ageDistribution.fresh++;
      else if (daysSince < 90) ageDistribution.recent++;
      else if (daysSince < 180) ageDistribution.aging++;
      else if (daysSince < 365) ageDistribution.old++;
      else ageDistribution.ancient++;

      // Zombie files
      if (data.commits === 1 && daysSince > 180) {
        zombieFiles.push({
          path,
          lastModified: data.lastModified,
          daysSinceModified: daysSince,
          originalAuthor: data.lastAuthor,
        });
      }

      // Legacy files (> 180 days without changes, but has history)
      if (daysSince > 180 && data.commits > 1) {
        let risk: 'low' | 'medium' | 'high';
        if (daysSince > 365) risk = 'high';
        else if (daysSince > 270) risk = 'medium';
        else risk = 'low';

        legacyFiles.push({
          path,
          lastModified: data.lastModified,
          daysSinceModified: daysSince,
          totalCommits: data.commits,
          authors: Array.from(data.authors),
          risk,
        });
      }
    }

    zombieFiles.sort((a, b) => b.daysSinceModified - a.daysSinceModified);
    legacyFiles.sort((a, b) => b.daysSinceModified - a.daysSinceModified);

    // Abandoned directories
    const abandonedDirs: AbandonedDir[] = [];
    const activeAreas: ActiveArea[] = [];

    for (const [path, data] of dirData) {
      if (path === '.') continue;

      const daysSince = daysDifference(data.lastActivity, now);

      if (daysSince > 180 && data.files.size > 3) {
        abandonedDirs.push({
          path,
          fileCount: data.files.size,
          lastActivity: data.lastActivity,
          daysSinceActivity: daysSince,
          lastAuthor: data.lastAuthor,
        });
      }

      // Active areas
      let activityLevel: 'hot' | 'warm' | 'cold';
      if (data.recentCommits > 10) activityLevel = 'hot';
      else if (data.recentCommits > 3) activityLevel = 'warm';
      else activityLevel = 'cold';

      if (data.commits > 5) {
        activeAreas.push({
          path,
          recentCommits: data.recentCommits,
          totalCommits: data.commits,
          activeAuthors: 0, // Would need more tracking
          activityLevel,
        });
      }
    }

    abandonedDirs.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
    activeAreas.sort((a, b) => b.recentCommits - a.recentCommits);

    // Calculate health indicators
    const indicators = this.calculateIndicators(
      zombieFiles,
      legacyFiles,
      abandonedDirs,
      ageDistribution,
      fileData.size
    );

    // Calculate overall health score
    const healthScore = this.calculateHealthScore(indicators);

    return {
      zombieFiles: zombieFiles.slice(0, 20),
      legacyFiles: legacyFiles.slice(0, 30),
      abandonedDirs: abandonedDirs.slice(0, 15),
      activeAreas: activeAreas.slice(0, 15),
      ageDistribution,
      healthScore,
      indicators,
    };
  }

  private calculateIndicators(
    zombieFiles: ZombieFile[],
    legacyFiles: LegacyFile[],
    abandonedDirs: AbandonedDir[],
    ageDistribution: AgeDistribution,
    totalFiles: number
  ): HealthIndicator[] {
    const indicators: HealthIndicator[] = [];

    // Fresh code ratio
    const freshRatio = totalFiles > 0 ? (ageDistribution.fresh / totalFiles) * 100 : 0;
    indicators.push({
      name: 'Fresh Code',
      status: freshRatio > 30 ? 'good' : freshRatio > 10 ? 'warning' : 'critical',
      value: `${freshRatio.toFixed(1)}%`,
      description: 'Percentage of files modified in last 30 days',
    });

    // Legacy code ratio
    const legacyRatio = totalFiles > 0 ? ((ageDistribution.old + ageDistribution.ancient) / totalFiles) * 100 : 0;
    indicators.push({
      name: 'Legacy Code',
      status: legacyRatio < 20 ? 'good' : legacyRatio < 40 ? 'warning' : 'critical',
      value: `${legacyRatio.toFixed(1)}%`,
      description: 'Percentage of files not touched in 6+ months',
    });

    // Zombie files
    indicators.push({
      name: 'Zombie Files',
      status: zombieFiles.length < 5 ? 'good' : zombieFiles.length < 15 ? 'warning' : 'critical',
      value: zombieFiles.length.toString(),
      description: 'Files with single commit and 6+ months old',
    });

    // Abandoned directories
    indicators.push({
      name: 'Abandoned Areas',
      status: abandonedDirs.length < 3 ? 'good' : abandonedDirs.length < 7 ? 'warning' : 'critical',
      value: abandonedDirs.length.toString(),
      description: 'Directories with no activity in 6+ months',
    });

    // High risk legacy
    const highRiskLegacy = legacyFiles.filter(f => f.risk === 'high').length;
    indicators.push({
      name: 'High Risk Legacy',
      status: highRiskLegacy < 5 ? 'good' : highRiskLegacy < 15 ? 'warning' : 'critical',
      value: highRiskLegacy.toString(),
      description: 'Legacy files not touched in 1+ year',
    });

    return indicators;
  }

  private calculateHealthScore(indicators: HealthIndicator[]): number {
    let score = 100;

    for (const indicator of indicators) {
      if (indicator.status === 'warning') score -= 10;
      if (indicator.status === 'critical') score -= 20;
    }

    return Math.max(0, score);
  }

  private emptyStats(): HealthStats {
    return {
      zombieFiles: [],
      legacyFiles: [],
      abandonedDirs: [],
      activeAreas: [],
      ageDistribution: { fresh: 0, recent: 0, aging: 0, old: 0, ancient: 0 },
      healthScore: 100,
      indicators: [],
    };
  }
}

export function createHealthAnalyzer(): HealthAnalyzer {
  return new HealthAnalyzer();
}
