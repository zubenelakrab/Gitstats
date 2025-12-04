// ============================================
// Core Types for GitStats
// ============================================

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

export interface DirectoryHotspot {
  path: string;
  commits: number;
  fileCount: number;
  churnScore: number;
  authorCount: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  topFiles: string[];
  avgFileChurn: number;
}

export interface RiskMapEntry {
  path: string;
  frequency: number;
  complexity: number;
  ownership: number;
  combinedRisk: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
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
}

// Extended Stats Types (imported from analyzers)
export interface VelocityStats {
  commitsPerDay: number;
  commitsPerWeek: number;
  commitsPerMonth: number;
  trend: 'accelerating' | 'stable' | 'decelerating';
  trendPercentage: number;
  weeklyVelocity: { week: string; commits: number; additions: number; deletions: number }[];
  busiestWeek: { week: string; commits: number };
  slowestWeek: { week: string; commits: number };
  consistencyScore: number;
  averageTimeBetweenCommits: number;
}

export interface ComplexityStats {
  godFiles: { path: string; totalChanges: number; commitCount: number; reason: string }[];
  growingFiles: { path: string; netGrowth: number; growthRate: number; trend: string }[];
  refactoringCandidates: { path: string; addDeleteRatio: number; suggestion: string }[];
  averageFileGrowth: number;
  filesWithHighChurn: number;
}

export interface WorkPatternsStats {
  peakHour: number;
  peakDay: number;
  nightOwlPercentage: number;
  weekendPercentage: number;
  crunchPeriods: { startDate: string; endDate: string; severity: string }[];
  workLifeBalance: number;
  hourlyDistribution: number[];
  dailyDistribution: number[];
}

export interface CommitQualityStats {
  averageMessageLength: number;
  conventionalPercentage: number;
  commitTypes: Record<string, number>;
  wipCommits: { hash: string; message: string }[];
  fixPercentage: number;
  largeCommits: { hash: string; filesChanged: number }[];
  atomicCommitScore: number;
  qualityScore: number;
}

export interface CollaborationStats {
  collaborationPairs: { author1: string; author2: string; sharedFiles: number }[];
  sharedFiles: { path: string; authorCount: number }[];
  collaborationScore: number;
  loneWolves: { name: string; soloPercentage: number }[];
}

export interface CouplingStats {
  temporalCoupling: { file1: string; file2: string; couplingStrength: number }[];
  highImpactCommits: { hash: string; filesChanged: number; impactScore: number }[];
  hiddenDependencies: { file1: string; file2: string; reason: string }[];
  couplingScore: number;
}

export interface HealthStats {
  zombieFiles: { path: string; daysSinceModified: number }[];
  legacyFiles: { path: string; daysSinceModified: number; risk: string }[];
  abandonedDirs: { path: string; daysSinceActivity: number }[];
  activeAreas: { path: string; activityLevel: string }[];
  ageDistribution: { fresh: number; recent: number; aging: number; old: number; ancient: number };
  healthScore: number;
  indicators: { name: string; status: string; value: string }[];
}

export interface BranchesStats {
  totalBranches: number;
  staleBranches: { name: string; daysSinceCommit: number; recommendation: string }[];
  orphanBranches: { name: string; reason: string }[];
  namingPatterns: { pattern: string; count: number }[];
  averageBranchAge: number;
  branchHealthScore: number;
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
