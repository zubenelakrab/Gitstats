import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';
import { readdir, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';

export interface CopyPasteStats {
  // Summary
  summary: CopyPasteSummary;

  // Clone groups (sets of similar code blocks)
  cloneGroups: CloneGroup[];

  // Similar files
  similarFiles: SimilarFilePair[];

  // Duplicate blocks (exact matches)
  duplicateBlocks: DuplicateBlock[];

  // Pattern-based duplicates
  patternDuplicates: PatternDuplicate[];

  // Recommendations
  recommendations: CopyPasteRecommendation[];
}

export interface CopyPasteSummary {
  totalFilesAnalyzed: number;
  totalLinesAnalyzed: number;
  duplicatedLines: number;
  duplicationPercentage: number;
  cloneGroupCount: number;
  similarFilePairs: number;
  estimatedRefactoringSavings: number; // LOC that could be removed
}

export interface CloneGroup {
  id: number;
  instances: CloneInstance[];
  similarity: number; // 0-100
  lines: number;
  type: 'exact' | 'similar' | 'structural';
  sample: string; // Sample of the duplicated code
  suggestion: string;
}

export interface CloneInstance {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface SimilarFilePair {
  file1: string;
  file2: string;
  similarity: number; // 0-100
  sharedLines: number;
  totalLines: number;
  commonPatterns: string[];
  suggestion: string;
}

export interface DuplicateBlock {
  hash: string;
  content: string;
  lines: number;
  occurrences: {
    file: string;
    startLine: number;
    endLine: number;
  }[];
  suggestion: string;
}

export interface PatternDuplicate {
  pattern: string;
  description: string;
  occurrences: {
    file: string;
    line: number;
    content: string;
  }[];
  suggestion: string;
}

export interface CopyPasteRecommendation {
  priority: 'low' | 'medium' | 'high';
  category: string;
  description: string;
  files: string[];
  impact: string;
  action: string;
  estimatedSavings: number; // LOC
}

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const MIN_BLOCK_LINES = 5; // Minimum lines to consider as duplicate
const MIN_SIMILARITY = 70; // Minimum similarity percentage

// Patterns that often indicate copy-paste
const COPYPASTE_PATTERNS = [
  {
    pattern: /function\s+(\w+)(Handler|Callback|Listener)\s*\(/g,
    description: 'Similar handler/callback functions',
  },
  {
    pattern: /if\s*\([^)]+\)\s*\{\s*return\s+[^;]+;\s*\}\s*if\s*\([^)]+\)\s*\{\s*return/g,
    description: 'Repeated conditional return patterns',
  },
  {
    pattern: /catch\s*\([^)]+\)\s*\{[^}]+console\.(log|error)/g,
    description: 'Similar error handling blocks',
  },
  {
    pattern: /\.map\s*\(\s*\([^)]+\)\s*=>\s*\{[^}]{50,}\}\s*\)/g,
    description: 'Similar map transformations',
  },
];

export class CopyPasteAnalyzer implements Analyzer<CopyPasteStats> {
  name = 'copypaste-analyzer';
  description = 'Detects duplicated and copy-pasted code';

  async analyze(commits: Commit[], config: AnalysisConfig): Promise<CopyPasteStats> {
    const repoPath = config.repoPath;

    // Get current files
    const currentFiles = await this.getCurrentFiles(repoPath);

    if (currentFiles.size === 0) {
      return this.emptyStats();
    }

    // Read all file contents
    const fileContents = await this.readFileContents(repoPath, currentFiles);

    // Find exact duplicate blocks
    const duplicateBlocks = this.findDuplicateBlocks(fileContents);

    // Find similar files
    const similarFiles = this.findSimilarFiles(fileContents);

    // Group clones
    const cloneGroups = this.groupClones(duplicateBlocks, fileContents);

    // Find pattern-based duplicates
    const patternDuplicates = this.findPatternDuplicates(fileContents);

    // Generate summary
    const summary = this.generateSummary(
      fileContents,
      duplicateBlocks,
      cloneGroups,
      similarFiles
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      cloneGroups,
      similarFiles,
      duplicateBlocks,
      patternDuplicates
    );

    return {
      summary,
      cloneGroups,
      similarFiles,
      duplicateBlocks,
      patternDuplicates,
      recommendations,
    };
  }

  private async getCurrentFiles(repoPath: string): Promise<Set<string>> {
    const files = new Set<string>();

    const walk = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = relative(repoPath, fullPath);

          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', 'vendor'].includes(entry.name)) {
              continue;
            }
            await walk(fullPath);
          } else {
            const ext = extname(entry.name);
            if (CODE_EXTENSIONS.includes(ext)) {
              // Skip test files for cleaner analysis
              if (!/\.(test|spec)\.[jt]sx?$/.test(entry.name)) {
                files.add(relativePath);
              }
            }
          }
        }
      } catch {
        // Directory unreadable
      }
    };

    await walk(repoPath);
    return files;
  }

  private async readFileContents(
    repoPath: string,
    files: Set<string>
  ): Promise<Map<string, { content: string; lines: string[] }>> {
    const contents = new Map<string, { content: string; lines: string[] }>();

    for (const file of files) {
      try {
        const content = await readFile(join(repoPath, file), 'utf-8');
        const lines = content.split('\n');
        contents.set(file, { content, lines });
      } catch {
        // File unreadable
      }
    }

    return contents;
  }

  private findDuplicateBlocks(
    fileContents: Map<string, { content: string; lines: string[] }>
  ): DuplicateBlock[] {
    const blockHashes = new Map<string, {
      content: string;
      occurrences: { file: string; startLine: number; endLine: number }[];
    }>();

    for (const [file, { lines }] of fileContents.entries()) {
      // Sliding window to find duplicate blocks
      for (let i = 0; i <= lines.length - MIN_BLOCK_LINES; i++) {
        const block = lines.slice(i, i + MIN_BLOCK_LINES);

        // Skip blocks that are mostly empty or comments
        const meaningfulLines = block.filter(l => {
          const trimmed = l.trim();
          return trimmed.length > 0 &&
                 !trimmed.startsWith('//') &&
                 !trimmed.startsWith('*') &&
                 !trimmed.startsWith('/*');
        });

        if (meaningfulLines.length < MIN_BLOCK_LINES - 1) continue;

        // Normalize and hash the block
        const normalized = this.normalizeCode(block.join('\n'));
        const hash = this.hashCode(normalized);

        if (!blockHashes.has(hash)) {
          blockHashes.set(hash, {
            content: block.join('\n'),
            occurrences: [],
          });
        }

        blockHashes.get(hash)!.occurrences.push({
          file,
          startLine: i + 1,
          endLine: i + MIN_BLOCK_LINES,
        });
      }
    }

    // Filter to only keep actual duplicates
    const duplicates: DuplicateBlock[] = [];

    for (const [hash, data] of blockHashes.entries()) {
      if (data.occurrences.length > 1) {
        // Remove occurrences in the same file that overlap
        const uniqueOccurrences = this.deduplicateOccurrences(data.occurrences);

        if (uniqueOccurrences.length > 1) {
          duplicates.push({
            hash,
            content: data.content,
            lines: MIN_BLOCK_LINES,
            occurrences: uniqueOccurrences,
            suggestion: this.getDuplicateSuggestion(uniqueOccurrences),
          });
        }
      }
    }

    return duplicates.sort((a, b) => b.occurrences.length - a.occurrences.length);
  }

  private deduplicateOccurrences(
    occurrences: { file: string; startLine: number; endLine: number }[]
  ): { file: string; startLine: number; endLine: number }[] {
    const result: { file: string; startLine: number; endLine: number }[] = [];

    for (const occ of occurrences) {
      const overlaps = result.some(r =>
        r.file === occ.file &&
        ((occ.startLine >= r.startLine && occ.startLine <= r.endLine) ||
         (occ.endLine >= r.startLine && occ.endLine <= r.endLine))
      );

      if (!overlaps) {
        result.push(occ);
      }
    }

    return result;
  }

  private normalizeCode(code: string): string {
    return code
      .replace(/\/\/.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/['"`][^'"`]*['"`]/g, '""') // Normalize strings
      .replace(/\d+/g, '0') // Normalize numbers
      .trim();
  }

  private hashCode(code: string): string {
    return createHash('md5').update(code).digest('hex').slice(0, 16);
  }

  private getDuplicateSuggestion(
    occurrences: { file: string; startLine: number; endLine: number }[]
  ): string {
    const files = new Set(occurrences.map(o => o.file));

    if (files.size === 1) {
      return 'Extract to a local helper function';
    } else if (files.size <= 3) {
      return 'Extract to a shared utility function';
    } else {
      return 'Create a reusable component or module';
    }
  }

  private findSimilarFiles(
    fileContents: Map<string, { content: string; lines: string[] }>
  ): SimilarFilePair[] {
    const similarPairs: SimilarFilePair[] = [];
    const files = Array.from(fileContents.entries());

    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const [file1, content1] = files[i];
        const [file2, content2] = files[j];

        // Skip very small files
        if (content1.lines.length < 20 || content2.lines.length < 20) continue;

        // Calculate similarity
        const similarity = this.calculateSimilarity(content1.lines, content2.lines);

        if (similarity >= MIN_SIMILARITY) {
          const commonPatterns = this.findCommonPatterns(content1.content, content2.content);

          similarPairs.push({
            file1,
            file2,
            similarity,
            sharedLines: Math.round((content1.lines.length + content2.lines.length) * similarity / 200),
            totalLines: content1.lines.length + content2.lines.length,
            commonPatterns,
            suggestion: this.getSimilarFileSuggestion(similarity, file1, file2),
          });
        }
      }
    }

    return similarPairs.sort((a, b) => b.similarity - a.similarity);
  }

  private calculateSimilarity(lines1: string[], lines2: string[]): number {
    // Normalize lines
    const normalize = (line: string) => line.trim().replace(/\s+/g, ' ');

    const set1 = new Set(lines1.map(normalize).filter(l => l.length > 5));
    const set2 = new Set(lines2.map(normalize).filter(l => l.length > 5));

    if (set1.size === 0 || set2.size === 0) return 0;

    let matches = 0;
    for (const line of set1) {
      if (set2.has(line)) matches++;
    }

    const similarity = (matches * 2) / (set1.size + set2.size) * 100;
    return Math.round(similarity);
  }

  private findCommonPatterns(content1: string, content2: string): string[] {
    const patterns: string[] = [];

    // Check for similar function names
    const funcPattern = /function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
    const funcs1 = new Set<string>();
    const funcs2 = new Set<string>();

    let match;
    while ((match = funcPattern.exec(content1)) !== null) {
      funcs1.add(match[1] || match[2]);
    }
    funcPattern.lastIndex = 0;
    while ((match = funcPattern.exec(content2)) !== null) {
      funcs2.add(match[1] || match[2]);
    }

    const commonFuncs = [...funcs1].filter(f => funcs2.has(f));
    if (commonFuncs.length > 0) {
      patterns.push(`Similar functions: ${commonFuncs.slice(0, 3).join(', ')}`);
    }

    // Check for similar imports
    const importPattern = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    const imports1 = new Set<string>();
    const imports2 = new Set<string>();

    while ((match = importPattern.exec(content1)) !== null) {
      imports1.add(match[1]);
    }
    importPattern.lastIndex = 0;
    while ((match = importPattern.exec(content2)) !== null) {
      imports2.add(match[1]);
    }

    const commonImports = [...imports1].filter(i => imports2.has(i));
    if (commonImports.length >= 3) {
      patterns.push(`Common imports: ${commonImports.length}`);
    }

    return patterns;
  }

  private getSimilarFileSuggestion(similarity: number, file1: string, file2: string): string {
    if (similarity >= 90) {
      return 'These files are nearly identical - consider merging or creating a shared base';
    } else if (similarity >= 80) {
      return 'High similarity - extract common logic to a shared module';
    } else {
      return 'Consider creating a base class or shared utilities';
    }
  }

  private groupClones(
    duplicateBlocks: DuplicateBlock[],
    fileContents: Map<string, { content: string; lines: string[] }>
  ): CloneGroup[] {
    const groups: CloneGroup[] = [];
    let groupId = 1;

    // Group duplicates by file combinations
    const groupedByFiles = new Map<string, DuplicateBlock[]>();

    for (const block of duplicateBlocks) {
      const key = block.occurrences.map(o => o.file).sort().join('|');
      if (!groupedByFiles.has(key)) {
        groupedByFiles.set(key, []);
      }
      groupedByFiles.get(key)!.push(block);
    }

    // Create clone groups
    for (const [_, blocks] of groupedByFiles.entries()) {
      if (blocks.length === 0) continue;

      // Merge adjacent blocks
      const mergedInstances = this.mergeAdjacentBlocks(blocks);

      for (const instance of mergedInstances) {
        groups.push({
          id: groupId++,
          instances: instance.occurrences.map(occ => ({
            file: occ.file,
            startLine: occ.startLine,
            endLine: occ.endLine,
            content: this.getCodeSnippet(fileContents, occ),
          })),
          similarity: 100, // Exact match
          lines: instance.lines,
          type: 'exact',
          sample: instance.content.slice(0, 200) + (instance.content.length > 200 ? '...' : ''),
          suggestion: instance.suggestion,
        });
      }
    }

    return groups.sort((a, b) => b.lines * b.instances.length - a.lines * a.instances.length);
  }

  private mergeAdjacentBlocks(blocks: DuplicateBlock[]): DuplicateBlock[] {
    // For now, just return the blocks as-is
    // A more sophisticated implementation would merge adjacent duplicates
    return blocks.slice(0, 20); // Limit to prevent overwhelming output
  }

  private getCodeSnippet(
    fileContents: Map<string, { content: string; lines: string[] }>,
    occ: { file: string; startLine: number; endLine: number }
  ): string {
    const content = fileContents.get(occ.file);
    if (!content) return '';

    return content.lines.slice(occ.startLine - 1, occ.endLine).join('\n');
  }

  private findPatternDuplicates(
    fileContents: Map<string, { content: string; lines: string[] }>
  ): PatternDuplicate[] {
    const patternDuplicates: PatternDuplicate[] = [];

    for (const { pattern, description } of COPYPASTE_PATTERNS) {
      const occurrences: { file: string; line: number; content: string }[] = [];

      for (const [file, { content, lines }] of fileContents.entries()) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);

        while ((match = regex.exec(content)) !== null) {
          // Find line number
          const beforeMatch = content.slice(0, match.index);
          const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

          occurrences.push({
            file,
            line: lineNumber,
            content: match[0].slice(0, 100),
          });
        }
      }

      if (occurrences.length >= 3) {
        patternDuplicates.push({
          pattern: description,
          description: `${occurrences.length} occurrences of similar ${description.toLowerCase()}`,
          occurrences: occurrences.slice(0, 10),
          suggestion: 'Consider extracting to a reusable function or using a higher-order function',
        });
      }
    }

    return patternDuplicates;
  }

  private generateSummary(
    fileContents: Map<string, { content: string; lines: string[] }>,
    duplicateBlocks: DuplicateBlock[],
    cloneGroups: CloneGroup[],
    similarFiles: SimilarFilePair[]
  ): CopyPasteSummary {
    let totalLines = 0;
    for (const { lines } of fileContents.values()) {
      totalLines += lines.length;
    }

    // Calculate duplicated lines
    let duplicatedLines = 0;
    const countedRanges = new Set<string>();

    for (const block of duplicateBlocks) {
      for (const occ of block.occurrences) {
        const key = `${occ.file}:${occ.startLine}-${occ.endLine}`;
        if (!countedRanges.has(key)) {
          countedRanges.add(key);
          duplicatedLines += occ.endLine - occ.startLine + 1;
        }
      }
    }

    // Estimate savings (remove all but one instance of each duplicate)
    let estimatedSavings = 0;
    for (const block of duplicateBlocks) {
      estimatedSavings += block.lines * (block.occurrences.length - 1);
    }

    return {
      totalFilesAnalyzed: fileContents.size,
      totalLinesAnalyzed: totalLines,
      duplicatedLines,
      duplicationPercentage: totalLines > 0 ? (duplicatedLines / totalLines) * 100 : 0,
      cloneGroupCount: cloneGroups.length,
      similarFilePairs: similarFiles.length,
      estimatedRefactoringSavings: estimatedSavings,
    };
  }

  private generateRecommendations(
    cloneGroups: CloneGroup[],
    similarFiles: SimilarFilePair[],
    duplicateBlocks: DuplicateBlock[],
    patternDuplicates: PatternDuplicate[]
  ): CopyPasteRecommendation[] {
    const recommendations: CopyPasteRecommendation[] = [];

    // Very similar files
    const highSimilarityFiles = similarFiles.filter(f => f.similarity >= 80);
    if (highSimilarityFiles.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Similar Files',
        description: `${highSimilarityFiles.length} file pairs are more than 80% similar`,
        files: highSimilarityFiles.flatMap(f => [f.file1, f.file2]),
        impact: 'Maintaining duplicate code leads to inconsistencies and bugs',
        action: 'Merge files or extract common functionality',
        estimatedSavings: highSimilarityFiles.reduce((sum, f) => sum + Math.round(f.sharedLines / 2), 0),
      });
    }

    // Large clone groups
    const largeClones = cloneGroups.filter(g => g.lines >= 10 && g.instances.length >= 3);
    if (largeClones.length > 0) {
      const totalDuplicatedLines = largeClones.reduce(
        (sum, g) => sum + g.lines * (g.instances.length - 1), 0
      );

      recommendations.push({
        priority: 'high',
        category: 'Duplicate Code Blocks',
        description: `${largeClones.length} code blocks are duplicated 3+ times`,
        files: [...new Set(largeClones.flatMap(g => g.instances.map(i => i.file)))],
        impact: 'Increases maintenance burden and risk of inconsistent fixes',
        action: 'Extract duplicated logic into shared functions/components',
        estimatedSavings: totalDuplicatedLines,
      });
    }

    // Pattern-based duplicates
    if (patternDuplicates.length > 0) {
      const topPattern = patternDuplicates[0];
      recommendations.push({
        priority: 'medium',
        category: 'Code Patterns',
        description: topPattern.description,
        files: [...new Set(topPattern.occurrences.map(o => o.file))],
        impact: 'Similar patterns could benefit from abstraction',
        action: topPattern.suggestion,
        estimatedSavings: topPattern.occurrences.length * 5,
      });
    }

    // Moderate duplicates
    const moderateClones = cloneGroups.filter(g => g.lines >= 5 && g.instances.length === 2);
    if (moderateClones.length > 5) {
      recommendations.push({
        priority: 'low',
        category: 'Minor Duplicates',
        description: `${moderateClones.length} small code blocks appear twice`,
        files: [...new Set(moderateClones.slice(0, 10).flatMap(g => g.instances.map(i => i.file)))],
        impact: 'Minor maintenance overhead',
        action: 'Consider extracting if the code is likely to change',
        estimatedSavings: moderateClones.reduce((sum, g) => sum + g.lines, 0),
      });
    }

    return recommendations;
  }

  private emptyStats(): CopyPasteStats {
    return {
      summary: {
        totalFilesAnalyzed: 0,
        totalLinesAnalyzed: 0,
        duplicatedLines: 0,
        duplicationPercentage: 0,
        cloneGroupCount: 0,
        similarFilePairs: 0,
        estimatedRefactoringSavings: 0,
      },
      cloneGroups: [],
      similarFiles: [],
      duplicateBlocks: [],
      patternDuplicates: [],
      recommendations: [],
    };
  }
}

export function createCopyPasteAnalyzer(): CopyPasteAnalyzer {
  return new CopyPasteAnalyzer();
}
