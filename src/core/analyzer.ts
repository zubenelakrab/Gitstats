import type {
  AnalysisConfig,
  AnalysisReport,
  ReportSummary,
  Author,
} from '../types/index.ts';
import { createGitParser } from '../parsers/git-parser.ts';
import { createAuthorAnalyzer } from '../analyzers/author-analyzer.ts';
import { createTimelineAnalyzer } from '../analyzers/timeline-analyzer.ts';
import { createHotspotAnalyzer } from '../analyzers/hotspot-analyzer.ts';
import { createBusFactorAnalyzer } from '../analyzers/busfactor-analyzer.ts';
import { createVelocityAnalyzer } from '../analyzers/velocity-analyzer.ts';
import { createComplexityAnalyzer } from '../analyzers/complexity-analyzer.ts';
import { createWorkPatternsAnalyzer } from '../analyzers/workpatterns-analyzer.ts';
import { createCommitQualityAnalyzer } from '../analyzers/commits-analyzer.ts';
import { createCollaborationAnalyzer } from '../analyzers/collaboration-analyzer.ts';
import { createCouplingAnalyzer } from '../analyzers/coupling-analyzer.ts';
import { createHealthAnalyzer } from '../analyzers/health-analyzer.ts';
import { createBranchesAnalyzer } from '../analyzers/branches-analyzer.ts';
import { daysDifference } from '../utils/date.ts';

export interface AnalyzerProgress {
  phase: string;
  current: number;
  total: number;
}

export type ProgressCallback = (progress: AnalyzerProgress) => void;

/**
 * Main analyzer that orchestrates all sub-analyzers
 */
export class GitStatsAnalyzer {
  private config: AnalysisConfig;
  private onProgress?: ProgressCallback;

  constructor(config: AnalysisConfig, onProgress?: ProgressCallback) {
    this.config = config;
    this.onProgress = onProgress;
  }

  private reportProgress(phase: string, current: number, total: number): void {
    if (this.onProgress) {
      this.onProgress({ phase, current, total });
    }
  }

  async analyze(): Promise<AnalysisReport> {
    const parser = createGitParser(this.config.repoPath);
    const totalPhases = 8;

    // Phase 1: Get repository info
    this.reportProgress('Fetching repository info', 1, totalPhases);
    const repository = await parser.getRepositoryInfo();

    // Phase 2: Get commits
    this.reportProgress('Fetching commits', 2, totalPhases);
    const commits = await parser.getCommits(this.config);

    if (commits.length === 0) {
      throw new Error('No commits found in repository');
    }

    // Phase 3: Get branches and tags
    this.reportProgress('Fetching branches and tags', 3, totalPhases);
    const [branches, tags] = await Promise.all([
      parser.getBranches(),
      parser.getTags(),
    ]);

    // Phase 4: Run core analyzers in parallel
    this.reportProgress('Analyzing commits (core)', 4, totalPhases);
    const [authors, timeline, hotspots, busFactor] = await Promise.all([
      createAuthorAnalyzer().analyze(commits, this.config),
      createTimelineAnalyzer().analyze(commits, this.config),
      createHotspotAnalyzer().analyze(commits, this.config),
      createBusFactorAnalyzer().analyze(commits, this.config),
    ]);

    // Phase 5: Run velocity and patterns analyzers
    this.reportProgress('Analyzing velocity and patterns', 5, totalPhases);
    const [velocity, workPatterns, commitQuality] = await Promise.all([
      createVelocityAnalyzer().analyze(commits, this.config),
      createWorkPatternsAnalyzer().analyze(commits, this.config),
      createCommitQualityAnalyzer().analyze(commits, this.config),
    ]);

    // Phase 6: Run collaboration and coupling analyzers
    this.reportProgress('Analyzing collaboration and coupling', 6, totalPhases);
    const [collaboration, coupling, complexity] = await Promise.all([
      createCollaborationAnalyzer().analyze(commits, this.config),
      createCouplingAnalyzer().analyze(commits, this.config),
      createComplexityAnalyzer().analyze(commits, this.config),
    ]);

    // Phase 7: Run health and branch analyzers
    this.reportProgress('Analyzing health and branches', 7, totalPhases);
    const [health, branchAnalysis] = await Promise.all([
      createHealthAnalyzer().analyze(commits, this.config),
      createBranchesAnalyzer().analyze(commits, this.config, branches),
    ]);

    // Phase 8: Generate summary and compile report
    this.reportProgress('Compiling report', 8, totalPhases);
    const summary = this.generateSummary(commits, authors, hotspots, repository);

    return {
      repository,
      generatedAt: new Date(),
      config: this.config,
      summary,
      authors,
      timeline,
      hotspots,
      busFactor,
      branches,
      tags,
      // Extended analytics
      velocity,
      complexity,
      workPatterns,
      commitQuality,
      collaboration,
      coupling,
      health,
      branchAnalysis,
    };
  }

  private generateSummary(
    commits: { date: Date; files: { additions: number; deletions: number; path: string }[]; author: Author }[],
    authors: { author: Author; commits: number }[],
    hotspots: { files: { path: string; commits: number }[] },
    _repository: { createdAt: Date; lastCommitAt: Date }
  ): ReportSummary {
    let totalAdditions = 0;
    let totalDeletions = 0;
    const filesChanged = new Set<string>();

    for (const commit of commits) {
      for (const file of commit.files) {
        totalAdditions += file.additions;
        totalDeletions += file.deletions;
        filesChanged.add(file.path);
      }
    }

    // Calculate age from actual commits analyzed
    const sortedCommits = commits
      .map(c => c.date.getTime())
      .sort((a, b) => a - b);

    const firstCommitDate = sortedCommits.length > 0 ? new Date(sortedCommits[0]) : new Date();
    const lastCommitDate = sortedCommits.length > 0 ? new Date(sortedCommits[sortedCommits.length - 1]) : new Date();

    const repositoryAge = daysDifference(firstCommitDate, lastCommitDate) || 1;
    const mostActiveAuthor = authors[0]?.author || { name: 'Unknown', email: '' };
    const mostChangedFile = hotspots.files[0]?.path || '';

    return {
      totalCommits: commits.length,
      totalAuthors: authors.length,
      totalFiles: filesChanged.size,
      totalAdditions,
      totalDeletions,
      averageCommitsPerDay: commits.length / repositoryAge,
      averageCommitsPerAuthor: authors.length > 0 ? commits.length / authors.length : 0,
      mostActiveAuthor,
      mostChangedFile,
      repositoryAge,
    };
  }
}

/**
 * Create and run analyzer
 */
export async function analyzeRepository(
  config: AnalysisConfig,
  onProgress?: ProgressCallback
): Promise<AnalysisReport> {
  const analyzer = new GitStatsAnalyzer(config, onProgress);
  return analyzer.analyze();
}
