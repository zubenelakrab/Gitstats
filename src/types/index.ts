// ============================================
// Core Types for GitStats
// ============================================

// Import extended stats types from analyzers
import type { VelocityStats } from '../analyzers/velocity-analyzer.js';
import type { ComplexityStats } from '../analyzers/complexity-analyzer.js';
import type { WorkPatternsStats } from '../analyzers/workpatterns-analyzer.js';
import type { CommitQualityStats } from '../analyzers/commits-analyzer.js';
import type { CollaborationStats } from '../analyzers/collaboration-analyzer.js';
import type { CouplingStats } from '../analyzers/coupling-analyzer.js';
import type { HealthStats } from '../analyzers/health-analyzer.js';
import type { BranchesStats } from '../analyzers/branches-analyzer.js';
import type { DirectoryHotspot, RiskMapEntry } from '../analyzers/hotspot-analyzer.js';
import type { BurnoutStats } from '../analyzers/burnout-analyzer.js';
import type { LeaderboardStats } from '../analyzers/leaderboard-analyzer.js';
import type { DeadCodeStats } from '../analyzers/deadcode-analyzer.js';
import type { DependencyStats } from '../analyzers/dependency-analyzer.js';
import type { CopyPasteStats } from '../analyzers/copypaste-analyzer.js';
import type { CodeCityStats } from '../analyzers/codecity-analyzer.js';

// Re-export for convenience
export type {
  VelocityStats,
  ComplexityStats,
  WorkPatternsStats,
  CommitQualityStats,
  CollaborationStats,
  CouplingStats,
  HealthStats,
  BranchesStats,
  BurnoutStats,
  LeaderboardStats,
  DeadCodeStats,
  DependencyStats,
  CopyPasteStats,
  CodeCityStats,
};

// Git Primitives
export interface Commit {
  hash: string;
  hashShort: string;
  author: Author;
  committer: Author;
  date: Date;
  message: string;
  messageSubject: string;
  messageBody: string;
  parents: string[];
  isMerge: boolean;
  files: FileChange[];
  branch?: string;
}

export interface Author {
  name: string;
  email: string;
}

export interface FileChange {
  path: string;
  oldPath?: string; // For renames
  additions: number;
  deletions: number;
  binary: boolean;
  status: FileStatus;
}

export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied';

export interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  lastCommitHash: string;
  lastCommitDate: Date;
  aheadBehind?: {
    ahead: number;
    behind: number;
  };
}

export interface Tag {
  name: string;
  hash: string;
  date: Date;
  message?: string;
  isAnnotated: boolean;
}

// Repository Info
export interface Repository {
  path: string;
  name: string;
  remotes: Remote[];
  defaultBranch: string;
  createdAt: Date;
  lastCommitAt: Date;
}

export interface Remote {
  name: string;
  url: string;
  type: 'fetch' | 'push';
}

// ============================================
// Analysis Results
// ============================================

export interface AuthorStats {
  author: Author;
  commits: number;
  additions: number;
  deletions: number;
  filesChanged: number;
  firstCommit: Date;
  lastCommit: Date;
  activeDays: number;
  averageCommitsPerDay: number;
  topFiles: FileStats[];
  commitsByMonth: Record<string, number>;
  commitsByDayOfWeek: number[];
  commitsByHour: number[];
}

export interface FileStats {
  path: string;
  commits: number;
  additions: number;
  deletions: number;
  authors: string[];
  lastModified: Date;
  createdAt: Date;
  churnScore: number; // High churn = potential tech debt
}

export interface TimelineStats {
  daily: Record<string, DayStats>;
  weekly: Record<string, WeekStats>;
  monthly: Record<string, MonthStats>;
  yearly: Record<string, YearStats>;
}

export interface DayStats {
  date: string;
  commits: number;
  additions: number;
  deletions: number;
  authors: Set<string>;
}

export interface WeekStats extends DayStats {
  weekNumber: number;
  year: number;
}

export interface MonthStats extends DayStats {
  month: number;
  year: number;
}

export interface YearStats {
  year: number;
  commits: number;
  additions: number;
  deletions: number;
  authors: Set<string>;
  newContributors: number;
}

export interface HotspotAnalysis {
  files: FileStats[];
  directories: DirectoryStats[];
  codeOwnership: OwnershipMap;
  directoryHotspots?: DirectoryHotspot[];
  riskMap?: RiskMapEntry[];
}


export interface DirectoryStats {
  path: string;
  fileCount: number;
  commits: number;
  additions: number;
  deletions: number;
  topContributors: Author[];
}

export interface OwnershipMap {
  [filePath: string]: {
    primaryOwner: Author;
    contributors: Author[];
    ownershipPercentage: number;
  };
}

// Bus Factor Analysis
export interface BusFactorAnalysis {
  overall: number;
  byDirectory: Record<string, number>;
  criticalAreas: CriticalArea[];
}

export interface CriticalArea {
  path: string;
  busFactor: number;
  soleContributor?: Author;
  risk: 'high' | 'medium' | 'low';
}

// ============================================
// Analysis Configuration
// ============================================

export interface AnalysisConfig {
  repoPath: string;
  branch?: string;
  since?: Date;
  until?: Date;
  authors?: string[];
  excludePaths?: string[];
  includePaths?: string[];
  excludeMerges?: boolean;
  maxCommits?: number;
}

export interface OutputConfig {
  format: OutputFormat;
  destination?: string;
  options?: OutputOptions;
}

export type OutputFormat = 'json' | 'csv' | 'html' | 'markdown' | 'cli';

export interface OutputOptions {
  pretty?: boolean;
  includeCharts?: boolean;
  theme?: 'light' | 'dark';
  title?: string;
}

// ============================================
// Complete Analysis Report
// ============================================

export interface AnalysisReport {
  repository: Repository;
  generatedAt: Date;
  config: AnalysisConfig;
  summary: ReportSummary;
  authors: AuthorStats[];
  timeline: TimelineStats;
  hotspots: HotspotAnalysis;
  busFactor: BusFactorAnalysis;
  branches: Branch[];
  tags: Tag[];

  // Extended analytics
  velocity?: VelocityStats;
  complexity?: ComplexityStats;
  workPatterns?: WorkPatternsStats;
  commitQuality?: CommitQualityStats;
  collaboration?: CollaborationStats;
  coupling?: CouplingStats;
  health?: HealthStats;
  branchAnalysis?: BranchesStats;

  // New analytics
  burnout?: BurnoutStats;
  leaderboard?: LeaderboardStats;
  deadCode?: DeadCodeStats;
  dependencies?: DependencyStats;
  duplicates?: CopyPasteStats;
  codeCity?: CodeCityStats;
}


export interface ReportSummary {
  totalCommits: number;
  totalAuthors: number;
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  averageCommitsPerDay: number;
  averageCommitsPerAuthor: number;
  mostActiveAuthor: Author;
  mostChangedFile: string;
  repositoryAge: number; // in days
}

// ============================================
// Parser Interface
// ============================================

export interface GitParser {
  getCommits(options?: Partial<AnalysisConfig>): Promise<Commit[]>;
  getBranches(): Promise<Branch[]>;
  getTags(): Promise<Tag[]>;
  getRepositoryInfo(): Promise<Repository>;
  getFileHistory(filePath: string): Promise<Commit[]>;
}

// ============================================
// Analyzer Interface
// ============================================

export interface Analyzer<T> {
  name: string;
  description: string;
  analyze(commits: Commit[], config: AnalysisConfig): Promise<T>;
}

// ============================================
// Output Renderer Interface
// ============================================

export interface OutputRenderer {
  render(report: AnalysisReport, config: OutputConfig): Promise<string>;
  save(content: string, path: string): Promise<void>;
}
