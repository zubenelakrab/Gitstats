import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';

export interface CommitQualityStats {
  // Message quality
  averageMessageLength: number;
  shortMessages: number; // < 10 chars
  longMessages: number; // > 100 chars

  // Conventional commits
  conventionalCommits: number;
  conventionalPercentage: number;
  commitTypes: Record<string, number>;

  // Problematic commits
  wipCommits: WipCommit[];
  fixCommits: number;
  fixPercentage: number;

  // Commit size analysis
  averageFilesPerCommit: number;
  largeCommits: LargeCommit[]; // commits touching many files
  atomicCommitScore: number; // 0-100, higher = more atomic

  // Shotgun surgery (unrelated files in same commit)
  shotgunCommits: ShotgunCommit[];

  // Overall quality score
  qualityScore: number;

  // Author breakdown by type (NEW)
  authorBreakdown: AuthorTypeBreakdown[];

  // Type evolution over time (NEW)
  typeEvolution: TypeEvolutionEntry[];
}

export interface WipCommit {
  hash: string;
  message: string;
  author: string;
  date: Date;
}

export interface LargeCommit {
  hash: string;
  message: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  author: string;
}

export interface ShotgunCommit {
  hash: string;
  message: string;
  directories: string[];
  filesChanged: number;
  reason: string;
}

export interface AuthorTypeBreakdown {
  author: string;
  email: string;
  totalCommits: number;
  types: Record<string, number>;
  primaryType: string;
  diversityScore: number; // 0-100, higher = more diverse contribution types
}

export interface TypeEvolutionEntry {
  month: string;
  types: Record<string, number>;
  totalCommits: number;
  dominantType: string;
}

// Conventional commit patterns
const CONVENTIONAL_PATTERN = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\s.+/i;
const WIP_PATTERNS = [
  /^wip/i,
  /^work in progress/i,
  /^tmp/i,
  /^temp/i,
  /^TODO/i,
  /^fixup/i,
  /^squash/i,
];
const FIX_PATTERNS = [
  /^fix/i,
  /bug\s*fix/i,
  /hot\s*fix/i,
  /patch/i,
];

export class CommitQualityAnalyzer implements Analyzer<CommitQualityStats> {
  name = 'commit-quality-analyzer';
  description = 'Analyzes commit message quality and patterns';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<CommitQualityStats> {
    if (commits.length === 0) {
      return this.emptyStats();
    }

    let totalMessageLength = 0;
    let shortMessages = 0;
    let longMessages = 0;
    let conventionalCommits = 0;
    let totalFiles = 0;
    const commitTypes: Record<string, number> = {};
    const wipCommits: WipCommit[] = [];
    let fixCommits = 0;
    const largeCommits: LargeCommit[] = [];
    const shotgunCommits: ShotgunCommit[] = [];

    // Author breakdown tracking
    const authorTypes = new Map<string, {
      name: string;
      email: string;
      types: Record<string, number>;
    }>();

    // Type evolution tracking
    const monthlyTypes = new Map<string, Record<string, number>>();

    for (const commit of commits) {
      const message = commit.messageSubject;
      const messageLength = message.length;

      totalMessageLength += messageLength;

      // Message length analysis
      if (messageLength < 10) shortMessages++;
      if (messageLength > 100) longMessages++;

      // Conventional commits
      const conventionalMatch = message.match(CONVENTIONAL_PATTERN);
      let commitType: string;
      if (conventionalMatch) {
        conventionalCommits++;
        commitType = conventionalMatch[1].toLowerCase();
      } else {
        // Try to detect type from message patterns for non-conventional commits
        commitType = this.detectCommitType(message);
      }
      commitTypes[commitType] = (commitTypes[commitType] || 0) + 1;

      // Track author types
      const authorKey = commit.author.email.toLowerCase();
      if (!authorTypes.has(authorKey)) {
        authorTypes.set(authorKey, {
          name: commit.author.name,
          email: commit.author.email,
          types: {},
        });
      }
      const authorData = authorTypes.get(authorKey)!;
      authorData.types[commitType] = (authorData.types[commitType] || 0) + 1;

      // Track monthly evolution
      const monthKey = commit.date.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyTypes.has(monthKey)) {
        monthlyTypes.set(monthKey, {});
      }
      const monthData = monthlyTypes.get(monthKey)!;
      monthData[commitType] = (monthData[commitType] || 0) + 1;

      // WIP commits
      if (WIP_PATTERNS.some(pattern => pattern.test(message))) {
        wipCommits.push({
          hash: commit.hashShort,
          message,
          author: commit.author.name,
          date: commit.date,
        });
      }

      // Fix commits
      if (FIX_PATTERNS.some(pattern => pattern.test(message))) {
        fixCommits++;
      }

      // File count
      const filesChanged = commit.files.length;
      totalFiles += filesChanged;

      // Large commits (> 20 files)
      if (filesChanged > 20) {
        let additions = 0;
        let deletions = 0;
        for (const file of commit.files) {
          additions += file.additions;
          deletions += file.deletions;
        }

        largeCommits.push({
          hash: commit.hashShort,
          message,
          filesChanged,
          additions,
          deletions,
          author: commit.author.name,
        });
      }

      // Shotgun surgery detection
      const directories = new Set<string>();
      for (const file of commit.files) {
        const parts = file.path.split('/');
        if (parts.length > 1) {
          directories.add(parts[0]);
        }
      }

      if (directories.size > 5 && filesChanged > 10) {
        shotgunCommits.push({
          hash: commit.hashShort,
          message,
          directories: Array.from(directories),
          filesChanged,
          reason: `Touches ${directories.size} different top-level directories`,
        });
      }
    }

    const averageMessageLength = totalMessageLength / commits.length;
    const conventionalPercentage = (conventionalCommits / commits.length) * 100;
    const averageFilesPerCommit = totalFiles / commits.length;
    const fixPercentage = (fixCommits / commits.length) * 100;

    // Atomic commit score (fewer files per commit = more atomic)
    const atomicCommitScore = Math.max(0, 100 - (averageFilesPerCommit * 5));

    // Overall quality score
    const qualityScore = this.calculateQualityScore({
      conventionalPercentage,
      shortMessages,
      wipCommits: wipCommits.length,
      largeCommits: largeCommits.length,
      shotgunCommits: shotgunCommits.length,
      totalCommits: commits.length,
    });

    // Build author breakdown
    const authorBreakdown: AuthorTypeBreakdown[] = Array.from(authorTypes.values())
      .map(author => {
        const totalCommits = Object.values(author.types).reduce((a, b) => a + b, 0);
        const typeCount = Object.keys(author.types).length;

        // Find primary type
        let primaryType = 'other';
        let maxCount = 0;
        for (const [type, count] of Object.entries(author.types)) {
          if (count > maxCount) {
            maxCount = count;
            primaryType = type;
          }
        }

        // Diversity score: more types = more diverse (normalized to 0-100)
        const diversityScore = Math.min(100, Math.round((typeCount / 8) * 100));

        return {
          author: author.name,
          email: author.email,
          totalCommits,
          types: author.types,
          primaryType,
          diversityScore,
        };
      })
      .sort((a, b) => b.totalCommits - a.totalCommits)
      .slice(0, 20);

    // Build type evolution
    const typeEvolution: TypeEvolutionEntry[] = Array.from(monthlyTypes.entries())
      .map(([month, types]) => {
        const totalCommits = Object.values(types).reduce((a, b) => a + b, 0);

        // Find dominant type
        let dominantType = 'other';
        let maxCount = 0;
        for (const [type, count] of Object.entries(types)) {
          if (count > maxCount) {
            maxCount = count;
            dominantType = type;
          }
        }

        return {
          month,
          types,
          totalCommits,
          dominantType,
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      averageMessageLength,
      shortMessages,
      longMessages,
      conventionalCommits,
      conventionalPercentage,
      commitTypes,
      wipCommits: wipCommits.slice(0, 20),
      fixCommits,
      fixPercentage,
      averageFilesPerCommit,
      largeCommits: largeCommits.slice(0, 20),
      atomicCommitScore,
      shotgunCommits: shotgunCommits.slice(0, 20),
      qualityScore,
      authorBreakdown,
      typeEvolution,
    };
  }

  private calculateQualityScore(metrics: {
    conventionalPercentage: number;
    shortMessages: number;
    wipCommits: number;
    largeCommits: number;
    shotgunCommits: number;
    totalCommits: number;
  }): number {
    let score = 50; // Start at 50

    // Bonus for conventional commits
    score += metrics.conventionalPercentage * 0.3;

    // Penalty for short messages
    const shortPercentage = (metrics.shortMessages / metrics.totalCommits) * 100;
    score -= shortPercentage * 0.5;

    // Penalty for WIP commits
    const wipPercentage = (metrics.wipCommits / metrics.totalCommits) * 100;
    score -= wipPercentage * 2;

    // Penalty for large commits
    const largePercentage = (metrics.largeCommits / metrics.totalCommits) * 100;
    score -= largePercentage * 1.5;

    // Penalty for shotgun commits
    const shotgunPercentage = (metrics.shotgunCommits / metrics.totalCommits) * 100;
    score -= shotgunPercentage * 2;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private detectCommitType(message: string): string {
    const lowerMessage = message.toLowerCase();

    // Fix/bugfix patterns
    if (/\b(fix|bug|hotfix|patch|resolve|solved?)\b/i.test(message)) {
      return 'fix';
    }

    // Feature/add patterns
    if (/\b(add|new|feature|implement|create|introduce)\b/i.test(message)) {
      return 'feat';
    }

    // Update/change patterns
    if (/\b(update|change|modify|adjust|improve|enhance)\b/i.test(message)) {
      return 'update';
    }

    // Refactor patterns
    if (/\b(refactor|restructure|reorganize|clean|simplify)\b/i.test(message)) {
      return 'refactor';
    }

    // Delete/remove patterns
    if (/\b(delete|remove|drop|deprecate)\b/i.test(message)) {
      return 'remove';
    }

    // Style patterns
    if (/\b(style|css|scss|format|lint)\b/i.test(message)) {
      return 'style';
    }

    // Docs patterns
    if (/\b(doc|readme|comment|documentation)\b/i.test(message)) {
      return 'docs';
    }

    // Test patterns
    if (/\b(test|spec|coverage)\b/i.test(message)) {
      return 'test';
    }

    // Config patterns
    if (/\b(config|setting|environment|env)\b/i.test(message)) {
      return 'config';
    }

    // Merge patterns
    if (/\bmerge\b/i.test(message)) {
      return 'merge';
    }

    return 'other';
  }

  private emptyStats(): CommitQualityStats {
    return {
      averageMessageLength: 0,
      shortMessages: 0,
      longMessages: 0,
      conventionalCommits: 0,
      conventionalPercentage: 0,
      commitTypes: {},
      wipCommits: [],
      fixCommits: 0,
      fixPercentage: 0,
      averageFilesPerCommit: 0,
      largeCommits: [],
      atomicCommitScore: 100,
      shotgunCommits: [],
      qualityScore: 0,
      authorBreakdown: [],
      typeEvolution: [],
    };
  }
}

export function createCommitQualityAnalyzer(): CommitQualityAnalyzer {
  return new CommitQualityAnalyzer();
}
