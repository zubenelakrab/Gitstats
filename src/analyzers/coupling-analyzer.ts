import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.ts';
import { dirname } from 'node:path';

export interface CouplingStats {
  // Temporal coupling (files that change together)
  temporalCoupling: TemporalCoupling[];

  // High impact commits
  highImpactCommits: HighImpactCommit[];

  // Directory coupling
  directoryCoupling: DirectoryCoupling[];

  // Hidden dependencies (files that seem unrelated but change together)
  hiddenDependencies: HiddenDependency[];

  // Change patterns
  changePatterns: ChangePattern[];

  // Overall coupling score (lower = better, less coupling)
  couplingScore: number;
}

export interface TemporalCoupling {
  file1: string;
  file2: string;
  cochangeCount: number; // times changed together
  file1Changes: number;
  file2Changes: number;
  couplingStrength: number; // percentage
  isLikelyCoupled: boolean;
}

export interface HighImpactCommit {
  hash: string;
  message: string;
  author: string;
  filesChanged: number;
  directoriesChanged: number;
  impactScore: number;
  date: Date;
}

export interface DirectoryCoupling {
  dir1: string;
  dir2: string;
  cochangeCount: number;
  couplingStrength: number;
}

export interface HiddenDependency {
  file1: string;
  file2: string;
  cochangeCount: number;
  reason: string; // why it's considered hidden
}

export interface ChangePattern {
  pattern: string;
  files: string[];
  frequency: number;
  description: string;
}

export class CouplingAnalyzer implements Analyzer<CouplingStats> {
  name = 'coupling-analyzer';
  description = 'Analyzes code coupling and change impact';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<CouplingStats> {
    if (commits.length === 0) {
      return this.emptyStats();
    }

    // Track file changes and co-changes
    const fileChanges = new Map<string, number>();
    const coChanges = new Map<string, number>(); // "file1|file2" -> count
    const dirChanges = new Map<string, number>();
    const dirCoChanges = new Map<string, number>();

    const highImpactCommits: HighImpactCommit[] = [];

    for (const commit of commits) {
      const files = commit.files.map(f => f.path);
      const dirs = new Set(files.map(f => dirname(f)));

      // Track individual file changes
      for (const file of files) {
        fileChanges.set(file, (fileChanges.get(file) || 0) + 1);
      }

      // Track co-changes
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const key = [files[i], files[j]].sort().join('|');
          coChanges.set(key, (coChanges.get(key) || 0) + 1);
        }
      }

      // Track directory changes
      for (const dir of dirs) {
        dirChanges.set(dir, (dirChanges.get(dir) || 0) + 1);
      }

      // Track directory co-changes
      const dirList = Array.from(dirs);
      for (let i = 0; i < dirList.length; i++) {
        for (let j = i + 1; j < dirList.length; j++) {
          const key = [dirList[i], dirList[j]].sort().join('|');
          dirCoChanges.set(key, (dirCoChanges.get(key) || 0) + 1);
        }
      }

      // Detect high impact commits
      if (files.length > 10 || dirs.size > 3) {
        const impactScore = files.length * 2 + dirs.size * 5;
        highImpactCommits.push({
          hash: commit.hashShort,
          message: commit.messageSubject,
          author: commit.author.name,
          filesChanged: files.length,
          directoriesChanged: dirs.size,
          impactScore,
          date: commit.date,
        });
      }
    }

    // Calculate temporal coupling
    const temporalCoupling: TemporalCoupling[] = [];

    for (const [key, count] of coChanges) {
      if (count < 3) continue; // Need at least 3 co-changes

      const [file1, file2] = key.split('|');
      const file1Changes = fileChanges.get(file1) || 0;
      const file2Changes = fileChanges.get(file2) || 0;

      // Coupling strength: how often they change together vs independently
      const minChanges = Math.min(file1Changes, file2Changes);
      const couplingStrength = minChanges > 0 ? (count / minChanges) * 100 : 0;

      // Files are likely coupled if they change together > 50% of the time
      const isLikelyCoupled = couplingStrength > 50;

      if (couplingStrength > 20) {
        temporalCoupling.push({
          file1,
          file2,
          cochangeCount: count,
          file1Changes,
          file2Changes,
          couplingStrength: Math.round(couplingStrength),
          isLikelyCoupled,
        });
      }
    }

    temporalCoupling.sort((a, b) => b.couplingStrength - a.couplingStrength);

    // Directory coupling
    const directoryCoupling: DirectoryCoupling[] = [];

    for (const [key, count] of dirCoChanges) {
      if (count < 5) continue;

      const [dir1, dir2] = key.split('|');
      const dir1Changes = dirChanges.get(dir1) || 0;
      const dir2Changes = dirChanges.get(dir2) || 0;

      const minChanges = Math.min(dir1Changes, dir2Changes);
      const couplingStrength = minChanges > 0 ? (count / minChanges) * 100 : 0;

      if (couplingStrength > 30) {
        directoryCoupling.push({
          dir1,
          dir2,
          cochangeCount: count,
          couplingStrength: Math.round(couplingStrength),
        });
      }
    }

    directoryCoupling.sort((a, b) => b.couplingStrength - a.couplingStrength);

    // Detect hidden dependencies (files in different directories that change together)
    const hiddenDependencies: HiddenDependency[] = temporalCoupling
      .filter(c => {
        const dir1 = dirname(c.file1);
        const dir2 = dirname(c.file2);
        return dir1 !== dir2 && c.couplingStrength > 60;
      })
      .map(c => ({
        file1: c.file1,
        file2: c.file2,
        cochangeCount: c.cochangeCount,
        reason: `Different directories but ${c.couplingStrength}% coupling`,
      }))
      .slice(0, 20);

    // Detect change patterns
    const changePatterns = this.detectChangePatterns(commits);

    // Sort high impact commits
    highImpactCommits.sort((a, b) => b.impactScore - a.impactScore);

    // Calculate overall coupling score (lower = better)
    const couplingScore = this.calculateCouplingScore(
      temporalCoupling,
      hiddenDependencies,
      highImpactCommits,
      commits.length
    );

    return {
      temporalCoupling: temporalCoupling.slice(0, 30),
      highImpactCommits: highImpactCommits.slice(0, 20),
      directoryCoupling: directoryCoupling.slice(0, 20),
      hiddenDependencies,
      changePatterns,
      couplingScore,
    };
  }

  private detectChangePatterns(commits: Commit[]): ChangePattern[] {
    const patterns: ChangePattern[] = [];

    // Pattern: Config + Code changes
    const configCodePattern = commits.filter(c => {
      const hasConfig = c.files.some(f =>
        f.path.includes('config') ||
        f.path.endsWith('.json') ||
        f.path.endsWith('.yml') ||
        f.path.endsWith('.yaml')
      );
      const hasCode = c.files.some(f =>
        f.path.endsWith('.ts') ||
        f.path.endsWith('.js') ||
        f.path.endsWith('.py')
      );
      return hasConfig && hasCode;
    });

    if (configCodePattern.length > 5) {
      patterns.push({
        pattern: 'config-code',
        files: [],
        frequency: configCodePattern.length,
        description: 'Config files often change with code',
      });
    }

    // Pattern: Test + Implementation
    const testCodePattern = commits.filter(c => {
      const hasTest = c.files.some(f =>
        f.path.includes('test') ||
        f.path.includes('spec') ||
        f.path.includes('__tests__')
      );
      const hasImpl = c.files.some(f =>
        !f.path.includes('test') &&
        !f.path.includes('spec') &&
        (f.path.endsWith('.ts') || f.path.endsWith('.js'))
      );
      return hasTest && hasImpl;
    });

    if (testCodePattern.length > 5) {
      patterns.push({
        pattern: 'test-implementation',
        files: [],
        frequency: testCodePattern.length,
        description: 'Tests updated with implementation (good practice)',
      });
    }

    // Pattern: Style + Template
    const styleTemplatePattern = commits.filter(c => {
      const hasStyle = c.files.some(f =>
        f.path.endsWith('.css') ||
        f.path.endsWith('.scss') ||
        f.path.endsWith('.less')
      );
      const hasTemplate = c.files.some(f =>
        f.path.endsWith('.html') ||
        f.path.endsWith('.vue') ||
        f.path.endsWith('.jsx') ||
        f.path.endsWith('.tsx')
      );
      return hasStyle && hasTemplate;
    });

    if (styleTemplatePattern.length > 5) {
      patterns.push({
        pattern: 'style-template',
        files: [],
        frequency: styleTemplatePattern.length,
        description: 'Styles change with templates',
      });
    }

    return patterns;
  }

  private calculateCouplingScore(
    temporalCoupling: TemporalCoupling[],
    hiddenDependencies: HiddenDependency[],
    highImpactCommits: HighImpactCommit[],
    totalCommits: number
  ): number {
    // Start at 100 (good) and deduct for coupling issues
    let score = 100;

    // Penalty for high coupling
    const highCouplingCount = temporalCoupling.filter(c => c.couplingStrength > 70).length;
    score -= highCouplingCount * 2;

    // Penalty for hidden dependencies
    score -= hiddenDependencies.length * 3;

    // Penalty for high impact commits
    const highImpactPercentage = (highImpactCommits.length / totalCommits) * 100;
    score -= highImpactPercentage * 2;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private emptyStats(): CouplingStats {
    return {
      temporalCoupling: [],
      highImpactCommits: [],
      directoryCoupling: [],
      hiddenDependencies: [],
      changePatterns: [],
      couplingScore: 100,
    };
  }
}

export function createCouplingAnalyzer(): CouplingAnalyzer {
  return new CouplingAnalyzer();
}
