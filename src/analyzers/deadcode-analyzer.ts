import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, basename } from 'node:path';

export interface DeadCodeStats {
  // Summary
  summary: DeadCodeSummary;

  // Dead files (not imported anywhere)
  deadFiles: DeadFile[];

  // Orphan files (in git but deleted from filesystem)
  orphanFiles: OrphanFile[];

  // Zombie files (single commit, very old)
  zombieFiles: DeadZombieFile[];

  // Stale exports (exported but not imported)
  staleExports: StaleExport[];

  // Deprecated patterns (files with deprecated naming)
  deprecatedPatterns: DeprecatedFile[];

  // Test orphans (test files without corresponding source)
  testOrphans: TestOrphan[];

  // Recommendations
  recommendations: DeadCodeRecommendation[];
}

export interface DeadCodeSummary {
  totalFilesAnalyzed: number;
  deadFilesCount: number;
  orphanFilesCount: number;
  zombieFilesCount: number;
  staleExportsCount: number;
  estimatedDeadLOC: number;
  deadCodePercentage: number;
  potentialSavings: string;
}

export interface DeadFile {
  path: string;
  reason: string;
  confidence: number; // 0-100
  lastModified: Date | null;
  daysSinceModified: number;
  loc: number;
  exports: string[];
  importedBy: string[]; // Should be empty for truly dead files
  suggestion: string;
}

export interface OrphanFile {
  path: string;
  lastCommit: Date;
  author: string;
  commitMessage: string;
  reason: string;
}

export interface DeadZombieFile {
  path: string;
  singleCommit: boolean;
  lastModified: Date;
  daysSinceModified: number;
  author: string;
  loc: number;
  reason: string;
}

export interface StaleExport {
  file: string;
  exportName: string;
  exportType: 'function' | 'class' | 'const' | 'type' | 'interface' | 'default';
  usedInternally: boolean;
  usedExternally: boolean;
  suggestion: string;
}

export interface DeprecatedFile {
  path: string;
  pattern: string;
  reason: string;
  suggestion: string;
}

export interface TestOrphan {
  testFile: string;
  expectedSource: string;
  exists: boolean;
  suggestion: string;
}

export interface DeadCodeRecommendation {
  priority: 'low' | 'medium' | 'high';
  category: string;
  description: string;
  files: string[];
  potentialSavings: string;
  action: string;
}

// Patterns that suggest deprecated/old code
const DEPRECATED_PATTERNS = [
  { pattern: /^old[_-]/i, reason: 'Prefixed with "old"' },
  { pattern: /[_-]old$/i, reason: 'Suffixed with "old"' },
  { pattern: /^backup[_-]/i, reason: 'Backup file' },
  { pattern: /[_-]backup$/i, reason: 'Backup file' },
  { pattern: /^deprecated[_-]/i, reason: 'Marked as deprecated' },
  { pattern: /[_-]deprecated$/i, reason: 'Marked as deprecated' },
  { pattern: /^unused[_-]/i, reason: 'Marked as unused' },
  { pattern: /[_-]unused$/i, reason: 'Marked as unused' },
  { pattern: /^tmp[_-]/i, reason: 'Temporary file' },
  { pattern: /[_-]tmp$/i, reason: 'Temporary file' },
  { pattern: /^temp[_-]/i, reason: 'Temporary file' },
  { pattern: /[_-]temp$/i, reason: 'Temporary file' },
  { pattern: /\.bak$/i, reason: 'Backup extension' },
  { pattern: /\.old$/i, reason: 'Old extension' },
  { pattern: /\.orig$/i, reason: 'Original file backup' },
  { pattern: /copy\s*\d*\./i, reason: 'Copy of file' },
];

// File extensions to analyze for imports
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];

// Test file patterns
const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_spec\.[jt]sx?$/,
  /^test_/,
  /__tests__\//,
];

export class DeadCodeAnalyzer implements Analyzer<DeadCodeStats> {
  name = 'deadcode-analyzer';
  description = 'Detects potentially dead or unused code';

  async analyze(commits: Commit[], config: AnalysisConfig): Promise<DeadCodeStats> {
    if (commits.length === 0) {
      return this.emptyStats();
    }

    const repoPath = config.repoPath;

    // Get all files from git history
    const filesInGit = this.getFilesFromCommits(commits);

    // Get current files in filesystem
    const currentFiles = await this.getCurrentFiles(repoPath);

    // Build import graph
    const importGraph = await this.buildImportGraph(repoPath, currentFiles);

    // Analyze dead files (not imported)
    const deadFiles = this.findDeadFiles(currentFiles, importGraph, commits);

    // Find orphan files (in git but not in filesystem)
    const orphanFiles = this.findOrphanFiles(filesInGit, currentFiles, commits);

    // Find zombie files (single commit, old)
    const zombieFiles = this.findZombieFiles(commits, currentFiles);

    // Find stale exports
    const staleExports = await this.findStaleExports(repoPath, currentFiles, importGraph);

    // Find deprecated patterns
    const deprecatedPatterns = this.findDeprecatedPatterns(currentFiles);

    // Find test orphans
    const testOrphans = this.findTestOrphans(currentFiles);

    // Generate summary
    const summary = this.generateSummary(
      currentFiles,
      deadFiles,
      orphanFiles,
      zombieFiles,
      staleExports
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      deadFiles,
      orphanFiles,
      zombieFiles,
      staleExports,
      deprecatedPatterns,
      testOrphans
    );

    return {
      summary,
      deadFiles,
      orphanFiles,
      zombieFiles,
      staleExports,
      deprecatedPatterns,
      testOrphans,
      recommendations,
    };
  }

  private getFilesFromCommits(commits: Commit[]): Map<string, { lastCommit: Date; author: string; message: string; commitCount: number }> {
    const files = new Map<string, { lastCommit: Date; author: string; message: string; commitCount: number }>();

    for (const commit of commits) {
      for (const file of commit.files) {
        const existing = files.get(file.path);
        if (!existing || commit.date > existing.lastCommit) {
          files.set(file.path, {
            lastCommit: commit.date,
            author: commit.author.name,
            message: commit.message,
            commitCount: (existing?.commitCount || 0) + 1,
          });
        } else {
          existing.commitCount++;
        }
      }
    }

    return files;
  }

  private async getCurrentFiles(repoPath: string): Promise<Set<string>> {
    const files = new Set<string>();

    const walk = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = fullPath.replace(repoPath + '/', '');

          // Skip common non-code directories
          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', 'vendor'].includes(entry.name)) {
              continue;
            }
            await walk(fullPath);
          } else {
            const ext = extname(entry.name);
            if (CODE_EXTENSIONS.includes(ext)) {
              files.add(relativePath);
            }
          }
        }
      } catch {
        // Directory might not exist or be unreadable
      }
    };

    await walk(repoPath);
    return files;
  }

  private async buildImportGraph(
    repoPath: string,
    files: Set<string>
  ): Promise<Map<string, Set<string>>> {
    const graph = new Map<string, Set<string>>(); // file -> files it imports

    for (const file of files) {
      try {
        const content = await readFile(join(repoPath, file), 'utf-8');
        const imports = this.extractImports(content, file);
        graph.set(file, imports);
      } catch {
        graph.set(file, new Set());
      }
    }

    return graph;
  }

  private extractImports(content: string, currentFile: string): Set<string> {
    const imports = new Set<string>();
    const currentDir = dirname(currentFile);

    // Match import statements
    const importPatterns = [
      /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /export\s+(?:[\w\s{},*]+\s+from\s+)['"]([^'"]+)['"]/g,
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];

        // Skip external modules
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          continue;
        }

        // Resolve relative path
        let resolvedPath = importPath;
        if (importPath.startsWith('.')) {
          resolvedPath = join(currentDir, importPath);
        }

        // Normalize and add extensions
        resolvedPath = resolvedPath.replace(/\\/g, '/');

        // Try different extensions
        for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']) {
          const withExt = resolvedPath.replace(/\.[jt]sx?$/, '') + ext;
          imports.add(withExt.replace(/^\.\//, ''));
        }
      }
    }

    return imports;
  }

  private findDeadFiles(
    currentFiles: Set<string>,
    importGraph: Map<string, Set<string>>,
    commits: Commit[]
  ): DeadFile[] {
    const deadFiles: DeadFile[] = [];

    // Build reverse import graph (file -> files that import it)
    const importedBy = new Map<string, Set<string>>();
    for (const file of currentFiles) {
      importedBy.set(file, new Set());
    }

    for (const [importer, imports] of importGraph.entries()) {
      for (const imported of imports) {
        // Check various possible paths
        for (const file of currentFiles) {
          if (this.pathsMatch(file, imported)) {
            importedBy.get(file)?.add(importer);
          }
        }
      }
    }

    // Find files that aren't imported by anything
    const now = new Date();

    for (const file of currentFiles) {
      const importers = importedBy.get(file) || new Set();

      // Skip entry points and config files
      if (this.isEntryPoint(file)) continue;

      // Skip test files for this analysis
      if (TEST_PATTERNS.some(p => p.test(file))) continue;

      if (importers.size === 0) {
        // Get file info from commits
        const fileCommits = commits.filter(c => c.files.some(f => f.path === file));
        const lastCommit = fileCommits.sort((a, b) => b.date.getTime() - a.date.getTime())[0];
        const lastModified = lastCommit?.date || null;
        const daysSinceModified = lastModified
          ? Math.floor((now.getTime() - lastModified.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        // Calculate confidence
        let confidence = 50; // Base confidence
        if (daysSinceModified > 180) confidence += 20;
        if (daysSinceModified > 365) confidence += 15;
        if (fileCommits.length === 1) confidence += 10;

        // Cap at 95 (never 100% sure)
        confidence = Math.min(95, confidence);

        deadFiles.push({
          path: file,
          reason: 'Not imported by any other file',
          confidence,
          lastModified,
          daysSinceModified,
          loc: 0, // Would need to read file to count
          exports: [],
          importedBy: [],
          suggestion: daysSinceModified > 180
            ? 'Consider removing - not used and very old'
            : 'Verify if this is an entry point or needed externally',
        });
      }
    }

    return deadFiles.sort((a, b) => b.confidence - a.confidence);
  }

  private pathsMatch(actual: string, imported: string): boolean {
    // Normalize both paths
    const normalizedActual = actual.replace(/\.[jt]sx?$/, '').replace(/\/index$/, '');
    const normalizedImported = imported.replace(/\.[jt]sx?$/, '').replace(/\/index$/, '');

    return normalizedActual === normalizedImported ||
           normalizedActual.endsWith('/' + normalizedImported) ||
           normalizedImported.endsWith('/' + normalizedActual);
  }

  private isEntryPoint(file: string): boolean {
    const entryPatterns = [
      /^index\.[jt]sx?$/,
      /^main\.[jt]sx?$/,
      /^app\.[jt]sx?$/,
      /^server\.[jt]sx?$/,
      /^cli\.[jt]sx?$/,
      /\/index\.[jt]sx?$/,
      /^src\/index\.[jt]sx?$/,
      /^src\/main\.[jt]sx?$/,
      /^src\/app\.[jt]sx?$/,
      /\.config\.[jt]s$/,
      /\.config\.[mc]js$/,
    ];

    return entryPatterns.some(p => p.test(file));
  }

  private findOrphanFiles(
    filesInGit: Map<string, { lastCommit: Date; author: string; message: string }>,
    currentFiles: Set<string>,
    commits: Commit[]
  ): OrphanFile[] {
    const orphans: OrphanFile[] = [];

    for (const [file, info] of filesInGit.entries()) {
      // Skip if file exists
      if (currentFiles.has(file)) continue;

      // Skip non-code files
      const ext = extname(file);
      if (!CODE_EXTENSIONS.includes(ext)) continue;

      // Check if file was explicitly deleted
      const wasDeleted = commits.some(c =>
        c.files.some(f => f.path === file && f.status === 'deleted')
      );

      if (!wasDeleted) {
        orphans.push({
          path: file,
          lastCommit: info.lastCommit,
          author: info.author,
          commitMessage: info.message,
          reason: 'File exists in git history but not in current filesystem',
        });
      }
    }

    return orphans;
  }

  private findZombieFiles(commits: Commit[], currentFiles: Set<string>): DeadZombieFile[] {
    const zombies: DeadZombieFile[] = [];
    const now = new Date();

    // Count commits per file
    const fileCommitCounts = new Map<string, { count: number; lastDate: Date; author: string }>();

    for (const commit of commits) {
      for (const file of commit.files) {
        const existing = fileCommitCounts.get(file.path);
        if (!existing) {
          fileCommitCounts.set(file.path, {
            count: 1,
            lastDate: commit.date,
            author: commit.author.name,
          });
        } else {
          existing.count++;
          if (commit.date > existing.lastDate) {
            existing.lastDate = commit.date;
            existing.author = commit.author.name;
          }
        }
      }
    }

    for (const file of currentFiles) {
      const info = fileCommitCounts.get(file);
      if (!info) continue;

      const daysSinceModified = Math.floor(
        (now.getTime() - info.lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Zombie: single commit AND very old (>180 days)
      if (info.count === 1 && daysSinceModified > 180) {
        zombies.push({
          path: file,
          singleCommit: true,
          lastModified: info.lastDate,
          daysSinceModified,
          author: info.author,
          loc: 0,
          reason: 'Single commit and untouched for 6+ months',
        });
      }
    }

    return zombies.sort((a, b) => b.daysSinceModified - a.daysSinceModified);
  }

  private async findStaleExports(
    repoPath: string,
    currentFiles: Set<string>,
    importGraph: Map<string, Set<string>>
  ): Promise<StaleExport[]> {
    const staleExports: StaleExport[] = [];

    // This is a simplified version - full implementation would need AST parsing
    for (const file of currentFiles) {
      try {
        const content = await readFile(join(repoPath, file), 'utf-8');

        // Find exported names
        const exportMatches = [
          ...content.matchAll(/export\s+(?:const|let|var|function|class|type|interface)\s+(\w+)/g),
          ...content.matchAll(/export\s+{\s*([^}]+)\s*}/g),
        ];

        for (const match of exportMatches) {
          const exportName = match[1].split(',')[0].trim();

          // Check if this export is imported anywhere
          let usedExternally = false;
          for (const [importer, imports] of importGraph.entries()) {
            if (importer === file) continue;
            if (imports.has(file) || Array.from(imports).some(i => this.pathsMatch(file, i))) {
              // Would need more sophisticated analysis to check specific exports
              usedExternally = true;
              break;
            }
          }

          // Very simplified - in reality would need AST analysis
          if (!usedExternally && !this.isEntryPoint(file)) {
            // Only add if we're reasonably confident
            const isType = /export\s+(?:type|interface)/.test(match[0]);

            staleExports.push({
              file,
              exportName,
              exportType: isType ? 'type' : 'function',
              usedInternally: content.includes(exportName),
              usedExternally: false,
              suggestion: `Consider making ${exportName} private or removing if unused`,
            });
          }
        }
      } catch {
        // File unreadable
      }
    }

    // Limit results to most likely stale (this is heuristic)
    return staleExports.slice(0, 20);
  }

  private findDeprecatedPatterns(currentFiles: Set<string>): DeprecatedFile[] {
    const deprecated: DeprecatedFile[] = [];

    for (const file of currentFiles) {
      const fileName = basename(file);

      for (const { pattern, reason } of DEPRECATED_PATTERNS) {
        if (pattern.test(fileName)) {
          deprecated.push({
            path: file,
            pattern: pattern.toString(),
            reason,
            suggestion: 'Remove or rename this file',
          });
          break;
        }
      }
    }

    return deprecated;
  }

  private findTestOrphans(currentFiles: Set<string>): TestOrphan[] {
    const orphans: TestOrphan[] = [];

    for (const file of currentFiles) {
      // Check if it's a test file
      if (!TEST_PATTERNS.some(p => p.test(file))) continue;

      // Derive expected source file
      const sourceFile = file
        .replace(/\.test\.([jt]sx?)$/, '.$1')
        .replace(/\.spec\.([jt]sx?)$/, '.$1')
        .replace(/_test\.([jt]sx?)$/, '.$1')
        .replace(/_spec\.([jt]sx?)$/, '.$1')
        .replace(/__tests__\//, '');

      // Check if source exists
      const sourceExists = currentFiles.has(sourceFile) ||
        currentFiles.has(sourceFile.replace(/\.tsx?$/, '.ts')) ||
        currentFiles.has(sourceFile.replace(/\.jsx?$/, '.js'));

      if (!sourceExists && sourceFile !== file) {
        orphans.push({
          testFile: file,
          expectedSource: sourceFile,
          exists: false,
          suggestion: 'Source file not found - consider removing test or updating path',
        });
      }
    }

    return orphans;
  }

  private generateSummary(
    currentFiles: Set<string>,
    deadFiles: DeadFile[],
    orphanFiles: OrphanFile[],
    zombieFiles: DeadZombieFile[],
    staleExports: StaleExport[]
  ): DeadCodeSummary {
    const totalFiles = currentFiles.size;
    const deadCount = deadFiles.length;
    const estimatedDeadLOC = deadFiles.reduce((sum, f) => sum + f.loc, 0) || deadCount * 50; // Estimate 50 LOC per file

    return {
      totalFilesAnalyzed: totalFiles,
      deadFilesCount: deadCount,
      orphanFilesCount: orphanFiles.length,
      zombieFilesCount: zombieFiles.length,
      staleExportsCount: staleExports.length,
      estimatedDeadLOC,
      deadCodePercentage: totalFiles > 0 ? (deadCount / totalFiles) * 100 : 0,
      potentialSavings: `~${estimatedDeadLOC} LOC`,
    };
  }

  private generateRecommendations(
    deadFiles: DeadFile[],
    orphanFiles: OrphanFile[],
    zombieFiles: DeadZombieFile[],
    staleExports: StaleExport[],
    deprecatedPatterns: DeprecatedFile[],
    testOrphans: TestOrphan[]
  ): DeadCodeRecommendation[] {
    const recommendations: DeadCodeRecommendation[] = [];

    // High-confidence dead files
    const highConfidenceDead = deadFiles.filter(f => f.confidence >= 80);
    if (highConfidenceDead.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Dead Files',
        description: `${highConfidenceDead.length} files are likely unused (high confidence)`,
        files: highConfidenceDead.map(f => f.path),
        potentialSavings: `~${highConfidenceDead.length * 50} LOC`,
        action: 'Review and remove these files',
      });
    }

    // Deprecated pattern files
    if (deprecatedPatterns.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Deprecated Files',
        description: `${deprecatedPatterns.length} files have deprecated naming patterns`,
        files: deprecatedPatterns.map(f => f.path),
        potentialSavings: 'Improved code clarity',
        action: 'Remove or rename these files',
      });
    }

    // Zombie files
    if (zombieFiles.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'Zombie Files',
        description: `${zombieFiles.length} files were created once and never touched again`,
        files: zombieFiles.slice(0, 10).map(f => f.path),
        potentialSavings: `~${zombieFiles.length * 30} LOC`,
        action: 'Review if these files are still needed',
      });
    }

    // Test orphans
    if (testOrphans.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'Orphan Tests',
        description: `${testOrphans.length} test files have no corresponding source file`,
        files: testOrphans.map(f => f.testFile),
        potentialSavings: 'Cleaner test suite',
        action: 'Remove outdated tests or fix paths',
      });
    }

    // Medium-confidence dead files
    const mediumConfidenceDead = deadFiles.filter(f => f.confidence >= 60 && f.confidence < 80);
    if (mediumConfidenceDead.length > 0) {
      recommendations.push({
        priority: 'low',
        category: 'Potentially Dead Files',
        description: `${mediumConfidenceDead.length} files might be unused (medium confidence)`,
        files: mediumConfidenceDead.slice(0, 10).map(f => f.path),
        potentialSavings: `~${mediumConfidenceDead.length * 50} LOC`,
        action: 'Verify these files are entry points or externally used',
      });
    }

    return recommendations;
  }

  private emptyStats(): DeadCodeStats {
    return {
      summary: {
        totalFilesAnalyzed: 0,
        deadFilesCount: 0,
        orphanFilesCount: 0,
        zombieFilesCount: 0,
        staleExportsCount: 0,
        estimatedDeadLOC: 0,
        deadCodePercentage: 0,
        potentialSavings: '0 LOC',
      },
      deadFiles: [],
      orphanFiles: [],
      zombieFiles: [],
      staleExports: [],
      deprecatedPatterns: [],
      testOrphans: [],
      recommendations: [],
    };
  }
}

export function createDeadCodeAnalyzer(): DeadCodeAnalyzer {
  return new DeadCodeAnalyzer();
}
