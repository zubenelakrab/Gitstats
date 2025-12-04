import type {
  Branch,
  AnalysisConfig,
  Analyzer,
} from '../types/index.ts';
import { daysDifference } from '../utils/date.ts';
import { execGit } from '../utils/exec.ts';

export interface BranchesStats {
  // Branch counts
  totalBranches: number;
  localBranches: number;
  remoteBranches: number;

  // Stale branches
  staleBranches: StaleBranch[];

  // Active branches
  activeBranches: ActiveBranch[];

  // Orphan branches (no recent activity, not merged)
  orphanBranches: OrphanBranch[];

  // Branch naming patterns
  namingPatterns: NamingPattern[];

  // Branch lifecycle stats
  averageBranchAge: number; // in days
  oldestBranch: { name: string; age: number } | null;
  newestBranch: { name: string; age: number } | null;

  // Health score
  branchHealthScore: number;
}

export interface StaleBranch {
  name: string;
  lastCommitDate: Date;
  daysSinceCommit: number;
  isRemote: boolean;
  recommendation: string;
}

export interface ActiveBranch {
  name: string;
  lastCommitDate: Date;
  daysSinceCommit: number;
  isRemote: boolean;
  isCurrent: boolean;
}

export interface OrphanBranch {
  name: string;
  lastCommitDate: Date;
  daysSinceCommit: number;
  reason: string;
}

export interface NamingPattern {
  pattern: string;
  count: number;
  examples: string[];
  description: string;
}

export class BranchesAnalyzer implements Analyzer<BranchesStats> {
  name = 'branches-analyzer';
  description = 'Analyzes branch patterns and health';

  async analyze(
    _commits: unknown,
    config: AnalysisConfig,
    branches?: Branch[]
  ): Promise<BranchesStats> {
    if (!branches || branches.length === 0) {
      return this.emptyStats();
    }

    const now = new Date();

    // Separate local and remote
    const localBranches = branches.filter(b => !b.isRemote);
    const remoteBranches = branches.filter(b => b.isRemote);

    // Categorize branches
    const staleBranches: StaleBranch[] = [];
    const activeBranches: ActiveBranch[] = [];
    const orphanBranches: OrphanBranch[] = [];

    // Get merged branches for orphan detection
    let mergedBranches = new Set<string>();
    try {
      const merged = await execGit(['branch', '--merged', 'HEAD'], config.repoPath);
      mergedBranches = new Set(
        merged.split('\n')
          .map(b => b.trim().replace('* ', ''))
          .filter(Boolean)
      );
    } catch {
      // Ignore errors
    }

    for (const branch of branches) {
      const daysSinceCommit = daysDifference(branch.lastCommitDate, now);

      if (daysSinceCommit > 90) {
        // Stale branch
        let recommendation = 'Consider deleting';
        if (daysSinceCommit > 365) {
          recommendation = 'Strongly recommend deleting - over 1 year old';
        } else if (daysSinceCommit > 180) {
          recommendation = 'Should be reviewed for deletion';
        }

        staleBranches.push({
          name: branch.name,
          lastCommitDate: branch.lastCommitDate,
          daysSinceCommit,
          isRemote: branch.isRemote,
          recommendation,
        });

        // Check if orphan (stale + not merged)
        const baseName = branch.name.replace('origin/', '');
        if (!mergedBranches.has(baseName) && daysSinceCommit > 60) {
          orphanBranches.push({
            name: branch.name,
            lastCommitDate: branch.lastCommitDate,
            daysSinceCommit,
            reason: 'Not merged and inactive for 60+ days',
          });
        }
      } else {
        // Active branch
        activeBranches.push({
          name: branch.name,
          lastCommitDate: branch.lastCommitDate,
          daysSinceCommit,
          isRemote: branch.isRemote,
          isCurrent: branch.isCurrent,
        });
      }
    }

    // Sort by age
    staleBranches.sort((a, b) => b.daysSinceCommit - a.daysSinceCommit);
    activeBranches.sort((a, b) => a.daysSinceCommit - b.daysSinceCommit);
    orphanBranches.sort((a, b) => b.daysSinceCommit - a.daysSinceCommit);

    // Analyze naming patterns
    const namingPatterns = this.analyzeNamingPatterns(branches);

    // Calculate branch ages
    const branchAges = branches.map(b => daysDifference(b.lastCommitDate, now));
    const averageBranchAge = branchAges.length > 0
      ? branchAges.reduce((a, b) => a + b, 0) / branchAges.length
      : 0;

    const sortedByAge = [...branches].sort(
      (a, b) => a.lastCommitDate.getTime() - b.lastCommitDate.getTime()
    );

    const oldestBranch = sortedByAge.length > 0
      ? { name: sortedByAge[0].name, age: daysDifference(sortedByAge[0].lastCommitDate, now) }
      : null;

    const newestBranch = sortedByAge.length > 0
      ? {
          name: sortedByAge[sortedByAge.length - 1].name,
          age: daysDifference(sortedByAge[sortedByAge.length - 1].lastCommitDate, now)
        }
      : null;

    // Calculate health score
    const branchHealthScore = this.calculateHealthScore(
      staleBranches.length,
      orphanBranches.length,
      branches.length
    );

    return {
      totalBranches: branches.length,
      localBranches: localBranches.length,
      remoteBranches: remoteBranches.length,
      staleBranches,
      activeBranches,
      orphanBranches,
      namingPatterns,
      averageBranchAge: Math.round(averageBranchAge),
      oldestBranch,
      newestBranch,
      branchHealthScore,
    };
  }

  private analyzeNamingPatterns(branches: Branch[]): NamingPattern[] {
    const patterns: Record<string, string[]> = {
      'feature/*': [],
      'bugfix/*': [],
      'hotfix/*': [],
      'release/*': [],
      'develop': [],
      'main/master': [],
      'other': [],
    };

    for (const branch of branches) {
      const name = branch.name.replace('origin/', '');

      if (name.startsWith('feature/') || name.startsWith('feat/')) {
        patterns['feature/*'].push(name);
      } else if (name.startsWith('bugfix/') || name.startsWith('bug/') || name.startsWith('fix/')) {
        patterns['bugfix/*'].push(name);
      } else if (name.startsWith('hotfix/') || name.startsWith('hot/')) {
        patterns['hotfix/*'].push(name);
      } else if (name.startsWith('release/') || name.startsWith('rel/')) {
        patterns['release/*'].push(name);
      } else if (name === 'develop' || name === 'dev' || name === 'development') {
        patterns['develop'].push(name);
      } else if (name === 'main' || name === 'master') {
        patterns['main/master'].push(name);
      } else {
        patterns['other'].push(name);
      }
    }

    const result: NamingPattern[] = [];

    const descriptions: Record<string, string> = {
      'feature/*': 'Feature branches following GitFlow',
      'bugfix/*': 'Bug fix branches',
      'hotfix/*': 'Hotfix branches for urgent fixes',
      'release/*': 'Release branches',
      'develop': 'Development integration branch',
      'main/master': 'Main production branch',
      'other': 'Non-standard naming',
    };

    for (const [pattern, names] of Object.entries(patterns)) {
      if (names.length > 0) {
        result.push({
          pattern,
          count: names.length,
          examples: names.slice(0, 5),
          description: descriptions[pattern],
        });
      }
    }

    result.sort((a, b) => b.count - a.count);

    return result;
  }

  private calculateHealthScore(
    staleCount: number,
    orphanCount: number,
    totalCount: number
  ): number {
    if (totalCount === 0) return 100;

    let score = 100;

    // Penalty for stale branches
    const stalePercentage = (staleCount / totalCount) * 100;
    score -= stalePercentage * 0.5;

    // Bigger penalty for orphan branches
    const orphanPercentage = (orphanCount / totalCount) * 100;
    score -= orphanPercentage * 1.5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private emptyStats(): BranchesStats {
    return {
      totalBranches: 0,
      localBranches: 0,
      remoteBranches: 0,
      staleBranches: [],
      activeBranches: [],
      orphanBranches: [],
      namingPatterns: [],
      averageBranchAge: 0,
      oldestBranch: null,
      newestBranch: null,
      branchHealthScore: 100,
    };
  }
}

export function createBranchesAnalyzer(): BranchesAnalyzer {
  return new BranchesAnalyzer();
}
