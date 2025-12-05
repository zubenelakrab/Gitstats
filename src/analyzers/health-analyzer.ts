import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';
import { dirname } from 'node:path';
import { daysDifference } from '../utils/date.js';

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

  // Test metrics (NEW)
  testMetrics: TestMetrics;
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

export interface TestMetrics {
  testFiles: number;
  sourceFiles: number;
  testToCodeRatio: number;
  testCoverage: string; // estimated based on test/code ratio
  modulesWithoutTests: ModuleTestInfo[];
  testTypes: Record<string, number>; // unit, integration, e2e, etc.
  recentTestActivity: number; // test files modified in last 30 days
}

export interface ModuleTestInfo {
  path: string;
  sourceFiles: number;
  testFiles: number;
  hasTests: boolean;
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

    // Calculate test metrics
    const testMetrics = this.calculateTestMetrics(fileData, thirtyDaysAgo);

    // Calculate health indicators
    const indicators = this.calculateIndicators(
      zombieFiles,
      legacyFiles,
      abandonedDirs,
      ageDistribution,
      fileData.size,
      testMetrics
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
      testMetrics,
    };
  }

  private calculateTestMetrics(
    fileData: Map<string, {
      lastModified: Date;
      firstModified: Date;
      commits: number;
      authors: Set<string>;
      lastAuthor: string;
    }>,
    thirtyDaysAgo: Date
  ): TestMetrics {
    const testPatterns = [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /_test\.[jt]sx?$/,
      /test_.*\.[jt]sx?$/,
      /\.tests?\.[jt]sx?$/,
      /__tests__\//,
      /\/tests?\//,
    ];

    const sourcePatterns = [
      /\.[jt]sx?$/,
      /\.py$/,
      /\.go$/,
      /\.rs$/,
      /\.java$/,
      /\.cs$/,
      /\.rb$/,
      /\.php$/,
    ];

    let testFiles = 0;
    let sourceFiles = 0;
    let recentTestActivity = 0;
    const testTypes: Record<string, number> = { unit: 0, integration: 0, e2e: 0, other: 0 };
    const moduleTests = new Map<string, { sourceFiles: number; testFiles: number }>();

    for (const [path, data] of fileData) {
      const isTest = testPatterns.some(p => p.test(path));
      const isSource = sourcePatterns.some(p => p.test(path));

      // Get module (first directory level)
      const parts = path.split('/');
      const module = parts.length > 1 ? parts[0] : '.';

      if (!moduleTests.has(module)) {
        moduleTests.set(module, { sourceFiles: 0, testFiles: 0 });
      }
      const moduleData = moduleTests.get(module)!;

      if (isTest) {
        testFiles++;
        moduleData.testFiles++;

        // Categorize test type
        if (/e2e|end-to-end|cypress|playwright|selenium/i.test(path)) {
          testTypes.e2e++;
        } else if (/integration|int\./i.test(path)) {
          testTypes.integration++;
        } else if (/unit|\.test\.|\.spec\./i.test(path)) {
          testTypes.unit++;
        } else {
          testTypes.other++;
        }

        // Recent test activity
        if (data.lastModified >= thirtyDaysAgo) {
          recentTestActivity++;
        }
      } else if (isSource) {
        sourceFiles++;
        moduleData.sourceFiles++;
      }
    }

    const testToCodeRatio = sourceFiles > 0 ? testFiles / sourceFiles : 0;

    // Estimate coverage based on ratio
    let testCoverage: string;
    if (testToCodeRatio >= 0.8) testCoverage = 'Excellent (80%+)';
    else if (testToCodeRatio >= 0.5) testCoverage = 'Good (50-80%)';
    else if (testToCodeRatio >= 0.3) testCoverage = 'Moderate (30-50%)';
    else if (testToCodeRatio >= 0.1) testCoverage = 'Low (10-30%)';
    else testCoverage = 'Minimal (<10%)';

    // Find modules without tests
    const modulesWithoutTests: ModuleTestInfo[] = Array.from(moduleTests.entries())
      .filter(([, data]) => data.sourceFiles > 3 && data.testFiles === 0)
      .map(([path, data]) => ({
        path,
        sourceFiles: data.sourceFiles,
        testFiles: data.testFiles,
        hasTests: false,
      }))
      .sort((a, b) => b.sourceFiles - a.sourceFiles)
      .slice(0, 10);

    return {
      testFiles,
      sourceFiles,
      testToCodeRatio: Math.round(testToCodeRatio * 100) / 100,
      testCoverage,
      modulesWithoutTests,
      testTypes,
      recentTestActivity,
    };
  }

  private calculateIndicators(
    zombieFiles: ZombieFile[],
    legacyFiles: LegacyFile[],
    abandonedDirs: AbandonedDir[],
    ageDistribution: AgeDistribution,
    totalFiles: number,
    testMetrics: TestMetrics
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

    // Test coverage indicator
    const testRatio = testMetrics.testToCodeRatio;
    indicators.push({
      name: 'Test Coverage',
      status: testRatio >= 0.5 ? 'good' : testRatio >= 0.2 ? 'warning' : 'critical',
      value: `${Math.round(testRatio * 100)}%`,
      description: `${testMetrics.testFiles} test files / ${testMetrics.sourceFiles} source files`,
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
      testMetrics: {
        testFiles: 0,
        sourceFiles: 0,
        testToCodeRatio: 0,
        testCoverage: 'No data',
        modulesWithoutTests: [],
        testTypes: { unit: 0, integration: 0, e2e: 0, other: 0 },
        recentTestActivity: 0,
      },
    };
  }
}

export function createHealthAnalyzer(): HealthAnalyzer {
  return new HealthAnalyzer();
}
