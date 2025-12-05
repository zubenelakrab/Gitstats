import type {
  Commit,
  BusFactorAnalysis,
  CriticalArea,
  Author,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';
import { dirname } from 'node:path';

/**
 * Calculate bus factor: minimum number of contributors that would need to
 * leave for a significant knowledge loss
 *
 * Algorithm: For a file/directory, how many people have >50% of the knowledge?
 * If 1 person = bus factor 1 (critical)
 * If 2-3 people = bus factor 2-3 (risky)
 * If 4+ people = healthier
 */
function calculateBusFactor(
  authorCommits: Map<string, number>,
  threshold: number = 0.5
): number {
  if (authorCommits.size === 0) return 0;
  if (authorCommits.size === 1) return 1;

  const totalCommits = Array.from(authorCommits.values()).reduce((a, b) => a + b, 0);
  if (totalCommits === 0) return 0;

  // Sort authors by contribution (descending)
  const sorted = Array.from(authorCommits.entries()).sort((a, b) => b[1] - a[1]);

  // Count how many authors cover the threshold of total commits
  let accumulated = 0;
  let busFactor = 0;

  for (const [, commits] of sorted) {
    accumulated += commits;
    busFactor++;
    if (accumulated / totalCommits >= threshold) {
      break;
    }
  }

  return busFactor;
}

/**
 * Determine risk level based on bus factor
 */
function getRiskLevel(busFactor: number): 'high' | 'medium' | 'low' {
  if (busFactor <= 1) return 'high';
  if (busFactor <= 2) return 'medium';
  return 'low';
}

/**
 * Analyzer for bus factor and knowledge distribution
 */
export class BusFactorAnalyzer implements Analyzer<BusFactorAnalysis> {
  name = 'busfactor-analyzer';
  description = 'Analyzes knowledge distribution and bus factor risk';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<BusFactorAnalysis> {
    // Track commits per author at repository level
    const repoAuthorCommits = new Map<string, number>();

    // Track commits per author per directory
    const dirAuthorCommits = new Map<string, Map<string, number>>();

    // Track commits per author per file (for critical area detection)
    const fileAuthorCommits = new Map<string, Map<string, number>>();

    // Author lookup
    const authorLookup = new Map<string, Author>();

    for (const commit of commits) {
      const authorKey = commit.author.email.toLowerCase();
      authorLookup.set(authorKey, commit.author);

      // Repository level
      const repoCount = repoAuthorCommits.get(authorKey) || 0;
      repoAuthorCommits.set(authorKey, repoCount + 1);

      for (const file of commit.files) {
        // File level
        if (!fileAuthorCommits.has(file.path)) {
          fileAuthorCommits.set(file.path, new Map());
        }
        const fileMap = fileAuthorCommits.get(file.path)!;
        const fileCount = fileMap.get(authorKey) || 0;
        fileMap.set(authorKey, fileCount + 1);

        // Directory level
        const dir = dirname(file.path);
        if (!dirAuthorCommits.has(dir)) {
          dirAuthorCommits.set(dir, new Map());
        }
        const dirMap = dirAuthorCommits.get(dir)!;
        const dirCount = dirMap.get(authorKey) || 0;
        dirMap.set(authorKey, dirCount + 1);
      }
    }

    // Calculate overall bus factor
    const overall = calculateBusFactor(repoAuthorCommits);

    // Calculate bus factor by directory
    const byDirectory: Record<string, number> = {};
    for (const [dir, authorMap] of dirAuthorCommits) {
      byDirectory[dir] = calculateBusFactor(authorMap);
    }

    // Find critical areas (files with bus factor = 1 and significant commits)
    const criticalAreas: CriticalArea[] = [];
    const minCommitsForCritical = 5; // Only flag files with at least 5 commits

    for (const [path, authorMap] of fileAuthorCommits) {
      const totalCommits = Array.from(authorMap.values()).reduce((a, b) => a + b, 0);
      if (totalCommits < minCommitsForCritical) continue;

      const fileBusFactor = calculateBusFactor(authorMap);
      const risk = getRiskLevel(fileBusFactor);

      // Only add to critical if high or medium risk
      if (risk === 'high' || risk === 'medium') {
        // Find sole contributor if bus factor is 1
        let soleContributor: Author | undefined;
        if (fileBusFactor === 1) {
          const topAuthor = Array.from(authorMap.entries())
            .sort((a, b) => b[1] - a[1])[0];
          if (topAuthor) {
            soleContributor = authorLookup.get(topAuthor[0]);
          }
        }

        criticalAreas.push({
          path,
          busFactor: fileBusFactor,
          soleContributor,
          risk,
        });
      }
    }

    // Sort critical areas by risk (high first) then by path
    criticalAreas.sort((a, b) => {
      const riskOrder = { high: 0, medium: 1, low: 2 };
      const riskDiff = riskOrder[a.risk] - riskOrder[b.risk];
      if (riskDiff !== 0) return riskDiff;
      return a.path.localeCompare(b.path);
    });

    return {
      overall,
      byDirectory,
      criticalAreas,
    };
  }
}

export function createBusFactorAnalyzer(): BusFactorAnalyzer {
  return new BusFactorAnalyzer();
}
