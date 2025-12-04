import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.ts';

export interface ComplexityStats {
  // God files (too many lines or too many changes)
  godFiles: GodFile[];

  // Files growing out of control
  growingFiles: GrowingFile[];

  // Refactoring candidates (high delete ratio = good, low = accumulating)
  refactoringCandidates: RefactoringCandidate[];

  // Overall metrics
  averageFileGrowth: number;
  totalFilesAnalyzed: number;
  filesWithHighChurn: number;

  // Technical Debt Analysis (NEW)
  technicalDebtScore: number; // 0-100, higher = more debt
  debtByModule: ModuleDebt[];
  debtTrend: 'increasing' | 'stable' | 'decreasing';
  criticalDebtAreas: CriticalDebtArea[];
  debtIndicators: DebtIndicator[];
}

export interface ModuleDebt {
  path: string;
  debtScore: number;
  filesWithDebt: number;
  totalFiles: number;
  topIssues: string[];
}

export interface CriticalDebtArea {
  path: string;
  debtScore: number;
  reason: string;
  metrics: {
    churnRate: number;
    growthRate: number;
    authorConcentration: number;
  };
  recommendation: string;
}

export interface DebtIndicator {
  name: string;
  value: number;
  status: 'good' | 'warning' | 'critical';
  description: string;
}

export interface GodFile {
  path: string;
  totalChanges: number; // additions + deletions over time
  commitCount: number;
  authorCount: number;
  reason: string;
}

export interface GrowingFile {
  path: string;
  netGrowth: number; // additions - deletions
  growthRate: number; // net growth per commit
  commitCount: number;
  trend: 'growing' | 'shrinking' | 'stable';
}

export interface RefactoringCandidate {
  path: string;
  addDeleteRatio: number; // additions / deletions, high ratio = accumulating
  totalAdditions: number;
  totalDeletions: number;
  commitCount: number;
  suggestion: string;
}

export class ComplexityAnalyzer implements Analyzer<ComplexityStats> {
  name = 'complexity-analyzer';
  description = 'Analyzes code complexity and identifies problematic files';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<ComplexityStats> {
    const fileStats = new Map<string, {
      additions: number;
      deletions: number;
      commits: number;
      authors: Set<string>;
    }>();

    // Aggregate file statistics
    for (const commit of commits) {
      for (const file of commit.files) {
        if (!fileStats.has(file.path)) {
          fileStats.set(file.path, {
            additions: 0,
            deletions: 0,
            commits: 0,
            authors: new Set(),
          });
        }

        const stats = fileStats.get(file.path)!;
        stats.additions += file.additions;
        stats.deletions += file.deletions;
        stats.commits++;
        stats.authors.add(commit.author.email);
      }
    }

    // Identify god files (high total changes + many commits + many authors)
    const godFiles: GodFile[] = [];
    const godThreshold = 5000; // total changes threshold

    for (const [path, stats] of fileStats) {
      const totalChanges = stats.additions + stats.deletions;

      if (totalChanges > godThreshold || (stats.commits > 50 && stats.authors.size > 5)) {
        const reasons: string[] = [];
        if (totalChanges > godThreshold) reasons.push(`${totalChanges} total line changes`);
        if (stats.commits > 50) reasons.push(`${stats.commits} commits`);
        if (stats.authors.size > 5) reasons.push(`${stats.authors.size} authors`);

        godFiles.push({
          path,
          totalChanges,
          commitCount: stats.commits,
          authorCount: stats.authors.size,
          reason: reasons.join(', '),
        });
      }
    }

    godFiles.sort((a, b) => b.totalChanges - a.totalChanges);

    // Identify growing files
    const growingFiles: GrowingFile[] = [];

    for (const [path, stats] of fileStats) {
      if (stats.commits < 3) continue; // Need enough data

      const netGrowth = stats.additions - stats.deletions;
      const growthRate = netGrowth / stats.commits;

      let trend: 'growing' | 'shrinking' | 'stable';
      if (growthRate > 10) {
        trend = 'growing';
      } else if (growthRate < -10) {
        trend = 'shrinking';
      } else {
        trend = 'stable';
      }

      if (trend !== 'stable') {
        growingFiles.push({
          path,
          netGrowth,
          growthRate,
          commitCount: stats.commits,
          trend,
        });
      }
    }

    growingFiles.sort((a, b) => Math.abs(b.growthRate) - Math.abs(a.growthRate));

    // Identify refactoring candidates
    const refactoringCandidates: RefactoringCandidate[] = [];

    for (const [path, stats] of fileStats) {
      if (stats.commits < 5 || stats.additions < 100) continue;

      const ratio = stats.deletions > 0 ? stats.additions / stats.deletions : stats.additions;

      let suggestion = '';
      if (ratio > 5) {
        suggestion = 'Code accumulating - consider refactoring';
      } else if (ratio > 3) {
        suggestion = 'Growing faster than being cleaned up';
      } else if (ratio < 0.5 && stats.deletions > 100) {
        suggestion = 'Good refactoring activity';
      }

      if (suggestion && ratio > 2) {
        refactoringCandidates.push({
          path,
          addDeleteRatio: ratio,
          totalAdditions: stats.additions,
          totalDeletions: stats.deletions,
          commitCount: stats.commits,
          suggestion,
        });
      }
    }

    refactoringCandidates.sort((a, b) => b.addDeleteRatio - a.addDeleteRatio);

    // Calculate overall metrics
    let totalGrowth = 0;
    let filesWithHighChurn = 0;

    for (const [, stats] of fileStats) {
      totalGrowth += stats.additions - stats.deletions;
      if (stats.commits > 20) filesWithHighChurn++;
    }

    // Calculate Technical Debt Analysis
    const { technicalDebtScore, debtByModule, criticalDebtAreas, debtIndicators } =
      this.calculateTechnicalDebt(fileStats, godFiles, growingFiles, refactoringCandidates);

    // Determine debt trend
    const growingCount = growingFiles.filter(f => f.trend === 'growing').length;
    const shrinkingCount = growingFiles.filter(f => f.trend === 'shrinking').length;
    let debtTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (growingCount > shrinkingCount * 2) debtTrend = 'increasing';
    else if (shrinkingCount > growingCount * 2) debtTrend = 'decreasing';

    return {
      godFiles: godFiles.slice(0, 20),
      growingFiles: growingFiles.slice(0, 20),
      refactoringCandidates: refactoringCandidates.slice(0, 20),
      averageFileGrowth: fileStats.size > 0 ? totalGrowth / fileStats.size : 0,
      totalFilesAnalyzed: fileStats.size,
      filesWithHighChurn,
      technicalDebtScore,
      debtByModule,
      debtTrend,
      criticalDebtAreas,
      debtIndicators,
    };
  }

  private calculateTechnicalDebt(
    fileStats: Map<string, { additions: number; deletions: number; commits: number; authors: Set<string> }>,
    godFiles: GodFile[],
    growingFiles: GrowingFile[],
    refactoringCandidates: RefactoringCandidate[]
  ): {
    technicalDebtScore: number;
    debtByModule: ModuleDebt[];
    criticalDebtAreas: CriticalDebtArea[];
    debtIndicators: DebtIndicator[];
  } {
    // Group files by top-level module/directory
    const moduleStats = new Map<string, {
      files: number;
      filesWithDebt: number;
      totalChurn: number;
      totalGrowth: number;
      issues: string[];
    }>();

    const getModule = (path: string): string => {
      const parts = path.split('/');
      return parts.length > 1 ? parts.slice(0, 2).join('/') : parts[0];
    };

    // Initialize modules
    for (const [path, stats] of fileStats) {
      const module = getModule(path);
      if (!moduleStats.has(module)) {
        moduleStats.set(module, { files: 0, filesWithDebt: 0, totalChurn: 0, totalGrowth: 0, issues: [] });
      }
      const mod = moduleStats.get(module)!;
      mod.files++;
      mod.totalChurn += stats.commits;
      mod.totalGrowth += stats.additions - stats.deletions;

      // Check if file has debt indicators
      const hasDebt = stats.commits > 20 ||
        (stats.additions / Math.max(stats.deletions, 1)) > 5 ||
        stats.authors.size === 1 && stats.commits > 10;
      if (hasDebt) mod.filesWithDebt++;
    }

    // Add issues from god files
    for (const gf of godFiles) {
      const module = getModule(gf.path);
      const mod = moduleStats.get(module);
      if (mod && !mod.issues.includes('God files detected')) {
        mod.issues.push('God files detected');
      }
    }

    // Add issues from growing files
    for (const gf of growingFiles) {
      const module = getModule(gf.path);
      const mod = moduleStats.get(module);
      if (mod && gf.trend === 'growing' && !mod.issues.includes('Files growing rapidly')) {
        mod.issues.push('Files growing rapidly');
      }
    }

    // Calculate module debt scores
    const debtByModule: ModuleDebt[] = [];
    for (const [path, stats] of moduleStats) {
      if (stats.files < 3) continue;

      const debtRatio = stats.filesWithDebt / stats.files;
      const debtScore = Math.round(debtRatio * 100);

      debtByModule.push({
        path,
        debtScore,
        filesWithDebt: stats.filesWithDebt,
        totalFiles: stats.files,
        topIssues: stats.issues.slice(0, 3),
      });
    }

    debtByModule.sort((a, b) => b.debtScore - a.debtScore);

    // Calculate critical debt areas
    const criticalDebtAreas: CriticalDebtArea[] = [];
    for (const gf of godFiles.slice(0, 10)) {
      const stats = fileStats.get(gf.path);
      if (!stats) continue;

      const churnRate = stats.commits;
      const growthRate = stats.additions - stats.deletions;
      const authorConcentration = 1 / stats.authors.size;

      criticalDebtAreas.push({
        path: gf.path,
        debtScore: Math.min(100, Math.round(gf.totalChanges / 100)),
        reason: gf.reason,
        metrics: { churnRate, growthRate, authorConcentration },
        recommendation: this.getDebtRecommendation(churnRate, growthRate, authorConcentration),
      });
    }

    // Calculate debt indicators
    const totalFiles = fileStats.size;
    const godFilePercentage = (godFiles.length / totalFiles) * 100;
    const growingFilesPercentage = (growingFiles.filter(f => f.trend === 'growing').length / totalFiles) * 100;
    const refactorNeededPercentage = (refactoringCandidates.length / totalFiles) * 100;

    const debtIndicators: DebtIndicator[] = [
      {
        name: 'God Files',
        value: godFiles.length,
        status: godFiles.length < 5 ? 'good' : godFiles.length < 15 ? 'warning' : 'critical',
        description: `${godFilePercentage.toFixed(1)}% of files are "god files"`,
      },
      {
        name: 'Growing Files',
        value: growingFiles.filter(f => f.trend === 'growing').length,
        status: growingFilesPercentage < 5 ? 'good' : growingFilesPercentage < 15 ? 'warning' : 'critical',
        description: `${growingFilesPercentage.toFixed(1)}% of files are growing rapidly`,
      },
      {
        name: 'Refactor Needed',
        value: refactoringCandidates.length,
        status: refactorNeededPercentage < 10 ? 'good' : refactorNeededPercentage < 25 ? 'warning' : 'critical',
        description: `${refactorNeededPercentage.toFixed(1)}% of files need refactoring`,
      },
    ];

    // Calculate high churn files count
    const highChurnCount = Array.from(fileStats.values()).filter(s => s.commits > 20).length;
    debtIndicators.push({
      name: 'High Churn Files',
      value: highChurnCount,
      status: highChurnCount < 20 ? 'good' : highChurnCount < 50 ? 'warning' : 'critical',
      description: 'Files with more than 20 commits',
    });

    // Calculate overall technical debt score
    let technicalDebtScore = 0;
    for (const indicator of debtIndicators) {
      if (indicator.status === 'critical') technicalDebtScore += 25;
      else if (indicator.status === 'warning') technicalDebtScore += 10;
    }
    technicalDebtScore = Math.min(100, technicalDebtScore);

    return { technicalDebtScore, debtByModule: debtByModule.slice(0, 15), criticalDebtAreas, debtIndicators };
  }

  private getDebtRecommendation(churnRate: number, growthRate: number, authorConcentration: number): string {
    if (authorConcentration > 0.8) {
      return 'Single owner - spread knowledge through pair programming or code reviews';
    }
    if (growthRate > 500) {
      return 'File growing too fast - consider splitting into smaller modules';
    }
    if (churnRate > 50) {
      return 'High change frequency - stabilize API or add better abstractions';
    }
    return 'Monitor and refactor incrementally';
  }
}

export function createComplexityAnalyzer(): ComplexityAnalyzer {
  return new ComplexityAnalyzer();
}
