import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';

export interface CollaborationStats {
  // Collaboration pairs
  collaborationPairs: CollaborationPair[];

  // File ownership overlap
  sharedFiles: SharedFile[];

  // Sequential work (who modifies after whom)
  handoffs: Handoff[];

  // Team clustering
  clusters: TeamCluster[];

  // Collaboration score
  collaborationScore: number; // 0-100, higher = more collaboration

  // Lone wolves (authors who rarely collaborate)
  loneWolves: LoneWolf[];
}

export interface CollaborationPair {
  author1: string;
  author2: string;
  sharedFiles: number;
  sharedCommits: number; // commits on same files
  collaborationStrength: number; // 0-100
}

export interface SharedFile {
  path: string;
  authors: string[];
  authorCount: number;
  potentialConflicts: number; // times different authors modified sequentially
}

export interface Handoff {
  file: string;
  fromAuthor: string;
  toAuthor: string;
  count: number;
}

export interface TeamCluster {
  members: string[];
  commonFiles: string[];
  commitOverlap: number;
}

export interface LoneWolf {
  name: string;
  email: string;
  soloFiles: number; // files only they touched
  totalFiles: number;
  soloPercentage: number;
}

export class CollaborationAnalyzer implements Analyzer<CollaborationStats> {
  name = 'collaboration-analyzer';
  description = 'Analyzes team collaboration patterns';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<CollaborationStats> {
    if (commits.length === 0) {
      return this.emptyStats();
    }

    // Track file authors
    const fileAuthors = new Map<string, Set<string>>();
    const authorFiles = new Map<string, Set<string>>();
    const fileHistory = new Map<string, { author: string; date: Date }[]>();

    for (const commit of commits) {
      const authorKey = commit.author.email.toLowerCase();

      if (!authorFiles.has(authorKey)) {
        authorFiles.set(authorKey, new Set());
      }

      for (const file of commit.files) {
        // Track authors per file
        if (!fileAuthors.has(file.path)) {
          fileAuthors.set(file.path, new Set());
        }
        fileAuthors.get(file.path)!.add(authorKey);
        authorFiles.get(authorKey)!.add(file.path);

        // Track file history for handoffs
        if (!fileHistory.has(file.path)) {
          fileHistory.set(file.path, []);
        }
        fileHistory.get(file.path)!.push({
          author: authorKey,
          date: commit.date,
        });
      }
    }

    // Calculate collaboration pairs
    const pairCollaboration = new Map<string, { sharedFiles: Set<string>; commits: number }>();

    for (const [file, authors] of fileAuthors) {
      if (authors.size < 2) continue;

      const authorList = Array.from(authors);
      for (let i = 0; i < authorList.length; i++) {
        for (let j = i + 1; j < authorList.length; j++) {
          const pairKey = [authorList[i], authorList[j]].sort().join('|');

          if (!pairCollaboration.has(pairKey)) {
            pairCollaboration.set(pairKey, { sharedFiles: new Set(), commits: 0 });
          }

          pairCollaboration.get(pairKey)!.sharedFiles.add(file);
          pairCollaboration.get(pairKey)!.commits++;
        }
      }
    }

    const collaborationPairs: CollaborationPair[] = Array.from(pairCollaboration.entries())
      .map(([key, data]) => {
        const [author1, author2] = key.split('|');
        const sharedFiles = data.sharedFiles.size;
        const maxPossibleShared = Math.min(
          authorFiles.get(author1)?.size || 0,
          authorFiles.get(author2)?.size || 0
        );
        const collaborationStrength = maxPossibleShared > 0
          ? (sharedFiles / maxPossibleShared) * 100
          : 0;

        return {
          author1,
          author2,
          sharedFiles,
          sharedCommits: data.commits,
          collaborationStrength: Math.round(collaborationStrength),
        };
      })
      .sort((a, b) => b.sharedFiles - a.sharedFiles);

    // Shared files analysis
    const sharedFiles: SharedFile[] = Array.from(fileAuthors.entries())
      .filter(([, authors]) => authors.size > 1)
      .map(([path, authors]) => {
        const history = fileHistory.get(path) || [];
        let conflicts = 0;

        // Count sequential modifications by different authors
        for (let i = 1; i < history.length; i++) {
          if (history[i].author !== history[i - 1].author) {
            conflicts++;
          }
        }

        return {
          path,
          authors: Array.from(authors),
          authorCount: authors.size,
          potentialConflicts: conflicts,
        };
      })
      .sort((a, b) => b.authorCount - a.authorCount);

    // Calculate handoffs
    const handoffMap = new Map<string, number>();

    for (const [file, history] of fileHistory) {
      const sorted = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());

      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].author !== sorted[i - 1].author) {
          const key = `${file}|${sorted[i - 1].author}|${sorted[i].author}`;
          handoffMap.set(key, (handoffMap.get(key) || 0) + 1);
        }
      }
    }

    const handoffs: Handoff[] = Array.from(handoffMap.entries())
      .map(([key, count]) => {
        const [file, fromAuthor, toAuthor] = key.split('|');
        return { file, fromAuthor, toAuthor, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // Find lone wolves
    const loneWolves: LoneWolf[] = [];

    for (const [authorKey, files] of authorFiles) {
      let soloFiles = 0;

      for (const file of files) {
        if (fileAuthors.get(file)?.size === 1) {
          soloFiles++;
        }
      }

      const soloPercentage = (soloFiles / files.size) * 100;

      if (soloPercentage > 50 && files.size > 5) {
        // Find author name from commits
        const authorCommit = commits.find(c => c.author.email.toLowerCase() === authorKey);
        loneWolves.push({
          name: authorCommit?.author.name || authorKey,
          email: authorKey,
          soloFiles,
          totalFiles: files.size,
          soloPercentage,
        });
      }
    }

    loneWolves.sort((a, b) => b.soloPercentage - a.soloPercentage);

    // Simple clustering based on shared files
    const clusters = this.detectClusters(collaborationPairs, authorFiles);

    // Collaboration score
    const collaborationScore = this.calculateCollaborationScore(
      collaborationPairs,
      sharedFiles,
      loneWolves,
      authorFiles.size
    );

    return {
      collaborationPairs: collaborationPairs.slice(0, 30),
      sharedFiles: sharedFiles.slice(0, 30),
      handoffs,
      clusters,
      collaborationScore,
      loneWolves,
    };
  }

  private detectClusters(
    pairs: CollaborationPair[],
    authorFiles: Map<string, Set<string>>
  ): TeamCluster[] {
    // Simple clustering: group authors with high collaboration
    const clusters: TeamCluster[] = [];
    const assigned = new Set<string>();

    const strongPairs = pairs.filter(p => p.collaborationStrength > 30);

    for (const pair of strongPairs) {
      if (assigned.has(pair.author1) && assigned.has(pair.author2)) continue;

      const members = new Set<string>();
      members.add(pair.author1);
      members.add(pair.author2);

      // Find other authors that collaborate with both
      for (const otherPair of strongPairs) {
        if (members.has(otherPair.author1) || members.has(otherPair.author2)) {
          members.add(otherPair.author1);
          members.add(otherPair.author2);
        }
      }

      if (members.size >= 2) {
        // Find common files
        const membersList = Array.from(members);
        let commonFiles: string[] = [];

        if (membersList.length > 0) {
          const firstFiles = authorFiles.get(membersList[0]) || new Set();
          commonFiles = Array.from(firstFiles).filter(file =>
            membersList.every(m => authorFiles.get(m)?.has(file))
          );
        }

        clusters.push({
          members: membersList,
          commonFiles: commonFiles.slice(0, 10),
          commitOverlap: membersList.length,
        });

        membersList.forEach(m => assigned.add(m));
      }
    }

    return clusters.slice(0, 5);
  }

  private calculateCollaborationScore(
    pairs: CollaborationPair[],
    sharedFiles: SharedFile[],
    loneWolves: LoneWolf[],
    totalAuthors: number
  ): number {
    if (totalAuthors <= 1) return 0;

    let score = 50;

    // Bonus for collaboration pairs
    const avgCollaboration = pairs.length > 0
      ? pairs.reduce((sum, p) => sum + p.collaborationStrength, 0) / pairs.length
      : 0;
    score += avgCollaboration * 0.3;

    // Bonus for shared files
    const sharedPercentage = sharedFiles.length > 0 ? Math.min(100, sharedFiles.length) : 0;
    score += sharedPercentage * 0.1;

    // Penalty for lone wolves
    const loneWolfPercentage = (loneWolves.length / totalAuthors) * 100;
    score -= loneWolfPercentage * 0.5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private emptyStats(): CollaborationStats {
    return {
      collaborationPairs: [],
      sharedFiles: [],
      handoffs: [],
      clusters: [],
      collaborationScore: 0,
      loneWolves: [],
    };
  }
}

export function createCollaborationAnalyzer(): CollaborationAnalyzer {
  return new CollaborationAnalyzer();
}
