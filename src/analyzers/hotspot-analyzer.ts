import type {
  Commit,
  FileStats,
  DirectoryStats,
  HotspotAnalysis,
  OwnershipMap,
  Author,
  AnalysisConfig,
  Analyzer,
} from '../types/index.ts';
import { dirname } from 'node:path';

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

    return {
      files,
      directories,
      codeOwnership,
    };
  }
}

export function createHotspotAnalyzer(): HotspotAnalyzer {
  return new HotspotAnalyzer();
}
