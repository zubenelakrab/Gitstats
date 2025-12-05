import type {
  Commit,
  FileStats,
  DirectoryStats,
  HotspotAnalysis,
  OwnershipMap,
  Author,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';
import { dirname } from 'node:path';

// Risk level for hotspots
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface DirectoryHotspot {
  path: string;
  commits: number;
  fileCount: number;
  churnScore: number;
  authorCount: number;
  riskLevel: RiskLevel;
  topFiles: string[];
  avgFileChurn: number;
}

export interface RiskMapEntry {
  path: string;
  frequency: number;      // commit count
  complexity: number;     // churn score
  ownership: number;      // author concentration (1 = single owner)
  combinedRisk: number;   // 0-100
  riskLevel: RiskLevel;
  recommendation: string;
}

interface FileData {
  path: string;
  commits: number;
  additions: number;
  deletions: number;
  authors: Map<string, number>; // email -> commit count
  lastModified: Date;
  createdAt: Date;
}

/**
 * Analyzer for code hotspots and ownership
 */
export class HotspotAnalyzer implements Analyzer<HotspotAnalysis> {
  name = 'hotspot-analyzer';
  description = 'Analyzes code hotspots and file ownership';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<HotspotAnalysis> {
    const fileMap = new Map<string, FileData>();
    const dirMap = new Map<string, {
      path: string;
      commits: Set<string>; // commit hashes
      additions: number;
      deletions: number;
      authors: Map<string, number>;
      files: Set<string>;
    }>();

    // Author lookup for ownership
    const authorLookup = new Map<string, Author>();

    // Sort commits by date (oldest first) for accurate createdAt tracking
    const sortedCommits = [...commits].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    for (const commit of sortedCommits) {
      const authorKey = commit.author.email.toLowerCase();
      authorLookup.set(authorKey, commit.author);

      for (const file of commit.files) {
        // File stats
        if (!fileMap.has(file.path)) {
          fileMap.set(file.path, {
            path: file.path,
            commits: 0,
            additions: 0,
            deletions: 0,
            authors: new Map(),
            lastModified: commit.date,
            createdAt: commit.date,
          });
        }

        const fileData = fileMap.get(file.path)!;
        fileData.commits++;
        fileData.additions += file.additions;
        fileData.deletions += file.deletions;
        fileData.lastModified = commit.date; // Will be latest due to sort

        const authorCommits = fileData.authors.get(authorKey) || 0;
        fileData.authors.set(authorKey, authorCommits + 1);

        // Directory stats
        const dir = dirname(file.path);
        if (!dirMap.has(dir)) {
          dirMap.set(dir, {
            path: dir,
            commits: new Set(),
            additions: 0,
            deletions: 0,
            authors: new Map(),
            files: new Set(),
          });
        }

        const dirData = dirMap.get(dir)!;
        dirData.commits.add(commit.hash);
        dirData.additions += file.additions;
        dirData.deletions += file.deletions;
        dirData.files.add(file.path);

        const dirAuthorCommits = dirData.authors.get(authorKey) || 0;
        dirData.authors.set(authorKey, dirAuthorCommits + 1);
      }
    }

    // Convert file data to FileStats and calculate churn score
    const files: FileStats[] = [];
    for (const [, data] of fileMap) {
      // Churn score: high commits + high changes = potential tech debt
      // Normalized: commits * (additions + deletions) / total_commits
      const totalChanges = data.additions + data.deletions;
      const churnScore = data.commits * Math.log10(totalChanges + 1);

      files.push({
        path: data.path,
        commits: data.commits,
        additions: data.additions,
        deletions: data.deletions,
        authors: Array.from(data.authors.keys()),
        lastModified: data.lastModified,
        createdAt: data.createdAt,
        churnScore,
      });
    }

    // Sort by churn score (hottest first)
    files.sort((a, b) => b.churnScore - a.churnScore);

    // Convert directory data to DirectoryStats
    const directories: DirectoryStats[] = [];
    for (const [, data] of dirMap) {
      // Get top contributors for directory
      const sortedAuthors = Array.from(data.authors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([email]) => authorLookup.get(email)!)
        .filter(Boolean);

      directories.push({
        path: data.path,
        fileCount: data.files.size,
        commits: data.commits.size,
        additions: data.additions,
        deletions: data.deletions,
        topContributors: sortedAuthors,
      });
    }

    // Sort directories by commit count
    directories.sort((a, b) => b.commits - a.commits);

    // Calculate code ownership
    const codeOwnership: OwnershipMap = {};
    for (const [path, data] of fileMap) {
      if (data.authors.size === 0) continue;

      // Find primary owner (most commits)
      let maxCommits = 0;
      let primaryOwnerEmail = '';
      let totalCommits = 0;

      for (const [email, commitCount] of data.authors) {
        totalCommits += commitCount;
        if (commitCount > maxCommits) {
          maxCommits = commitCount;
          primaryOwnerEmail = email;
        }
      }

      const primaryOwner = authorLookup.get(primaryOwnerEmail);
      if (!primaryOwner) continue;

      const contributors = Array.from(data.authors.keys())
        .filter(email => email !== primaryOwnerEmail)
        .map(email => authorLookup.get(email)!)
        .filter(Boolean);

      codeOwnership[path] = {
        primaryOwner,
        contributors,
        ownershipPercentage: (maxCommits / totalCommits) * 100,
      };
    }

    // Calculate directory hotspots with risk levels
    const directoryHotspots: DirectoryHotspot[] = [];
    for (const [dirPath, data] of dirMap) {
      if (dirPath === '.' || data.files.size < 2) continue;

      // Get files in this directory with their churn
      const dirFiles = files.filter(f => dirname(f.path) === dirPath);
      const totalChurn = dirFiles.reduce((sum, f) => sum + f.churnScore, 0);
      const avgChurn = dirFiles.length > 0 ? totalChurn / dirFiles.length : 0;

      // Calculate risk level
      let riskLevel: RiskLevel = 'low';
      if (data.commits.size > 50 && avgChurn > 100) riskLevel = 'critical';
      else if (data.commits.size > 30 && avgChurn > 50) riskLevel = 'high';
      else if (data.commits.size > 15 || avgChurn > 30) riskLevel = 'medium';

      directoryHotspots.push({
        path: dirPath,
        commits: data.commits.size,
        fileCount: data.files.size,
        churnScore: totalChurn,
        authorCount: data.authors.size,
        riskLevel,
        topFiles: dirFiles.slice(0, 3).map(f => f.path),
        avgFileChurn: avgChurn,
      });
    }

    directoryHotspots.sort((a, b) => b.churnScore - a.churnScore);

    // Calculate risk map (combines frequency + complexity + ownership)
    const riskMap: RiskMapEntry[] = [];
    for (const file of files.slice(0, 100)) {
      const ownership = codeOwnership[file.path];
      const ownershipConcentration = ownership ? ownership.ownershipPercentage / 100 : 1;

      // Normalize values to 0-100
      const maxCommits = files[0]?.commits || 1;
      const maxChurn = files[0]?.churnScore || 1;

      const frequencyScore = (file.commits / maxCommits) * 100;
      const complexityScore = (file.churnScore / maxChurn) * 100;
      const ownershipRisk = ownershipConcentration * 100; // Higher = more concentrated = riskier

      // Combined risk: weighted average
      const combinedRisk = (frequencyScore * 0.3) + (complexityScore * 0.4) + (ownershipRisk * 0.3);

      let riskLevel: RiskLevel = 'low';
      if (combinedRisk > 70) riskLevel = 'critical';
      else if (combinedRisk > 50) riskLevel = 'high';
      else if (combinedRisk > 30) riskLevel = 'medium';

      let recommendation = '';
      if (riskLevel === 'critical') {
        recommendation = 'Urgent refactoring needed - high change frequency with concentrated ownership';
      } else if (riskLevel === 'high') {
        recommendation = 'Consider splitting or refactoring - becoming a maintenance burden';
      } else if (riskLevel === 'medium') {
        recommendation = 'Monitor closely - showing signs of complexity growth';
      }

      if (riskLevel !== 'low') {
        riskMap.push({
          path: file.path,
          frequency: file.commits,
          complexity: file.churnScore,
          ownership: ownershipConcentration,
          combinedRisk,
          riskLevel,
          recommendation,
        });
      }
    }

    riskMap.sort((a, b) => b.combinedRisk - a.combinedRisk);

    return {
      files,
      directories,
      codeOwnership,
      directoryHotspots: directoryHotspots.slice(0, 20),
      riskMap: riskMap.slice(0, 30),
    };
  }
}

export function createHotspotAnalyzer(): HotspotAnalyzer {
  return new HotspotAnalyzer();
}
