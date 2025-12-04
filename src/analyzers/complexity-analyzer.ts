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

    return {
      godFiles: godFiles.slice(0, 20),
      growingFiles: growingFiles.slice(0, 20),
      refactoringCandidates: refactoringCandidates.slice(0, 20),
      averageFileGrowth: fileStats.size > 0 ? totalGrowth / fileStats.size : 0,
      totalFilesAnalyzed: fileStats.size,
      filesWithHighChurn,
    };
  }
}

export function createComplexityAnalyzer(): ComplexityAnalyzer {
  return new ComplexityAnalyzer();
}
