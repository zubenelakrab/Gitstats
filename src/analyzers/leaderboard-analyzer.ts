import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';

export interface LeaderboardStats {
  // Main leaderboards
  leaderboards: Leaderboard[];

  // Individual achievements
  achievements: DeveloperAchievements[];

  // Fun stats
  funStats: FunStat[];

  // Records
  records: RepositoryRecord[];
}

export interface Leaderboard {
  name: string;
  description: string;
  emoji: string;
  entries: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  email: string;
  value: number;
  formattedValue: string;
  trend?: 'up' | 'down' | 'stable'; // vs previous period
  badge?: string; // 🥇🥈🥉
}

export interface DeveloperAchievements {
  name: string;
  email: string;
  achievements: Achievement[];
  totalPoints: number;
  level: string; // Novice, Contributor, Expert, Legend
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  earnedAt: Date;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  points: number;
}

export interface FunStat {
  name: string;
  emoji: string;
  winner: string;
  value: string;
  description: string;
}

export interface RepositoryRecord {
  name: string;
  holder: string;
  value: string;
  date: Date;
  emoji: string;
}

// Achievement definitions
const ACHIEVEMENT_DEFINITIONS: {
  id: string;
  name: string;
  description: string;
  emoji: string;
  rarity: Achievement['rarity'];
  points: number;
  check: (stats: DeveloperStats) => Date | null;
}[] = [
  {
    id: 'first_commit',
    name: 'First Blood',
    description: 'Made your first commit to the repository',
    emoji: '🌟',
    rarity: 'common',
    points: 10,
    check: (s) => s.firstCommit,
  },
  {
    id: 'century',
    name: 'Century',
    description: 'Reached 100 commits',
    emoji: '💯',
    rarity: 'uncommon',
    points: 50,
    check: (s) => s.totalCommits >= 100 ? s.lastCommit : null,
  },
  {
    id: 'millennium',
    name: 'Millennium',
    description: 'Reached 1,000 commits',
    emoji: '🏆',
    rarity: 'legendary',
    points: 500,
    check: (s) => s.totalCommits >= 1000 ? s.lastCommit : null,
  },
  {
    id: 'bug_hunter',
    name: 'Bug Hunter',
    description: 'Fixed 50 bugs (fix commits)',
    emoji: '🐛',
    rarity: 'uncommon',
    points: 30,
    check: (s) => s.fixCommits >= 50 ? s.lastCommit : null,
  },
  {
    id: 'exterminator',
    name: 'Exterminator',
    description: 'Fixed 200 bugs',
    emoji: '🔫',
    rarity: 'epic',
    points: 150,
    check: (s) => s.fixCommits >= 200 ? s.lastCommit : null,
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Made 50 commits after midnight',
    emoji: '🦉',
    rarity: 'uncommon',
    points: 25,
    check: (s) => s.nightCommits >= 50 ? s.lastCommit : null,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Made 50 commits before 7am',
    emoji: '🐦',
    rarity: 'uncommon',
    points: 25,
    check: (s) => s.earlyCommits >= 50 ? s.lastCommit : null,
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: 'Made 100 commits on weekends',
    emoji: '⚔️',
    rarity: 'rare',
    points: 75,
    check: (s) => s.weekendCommits >= 100 ? s.lastCommit : null,
  },
  {
    id: 'marie_kondo',
    name: 'Marie Kondo',
    description: 'Deleted more code than you added (net negative LOC)',
    emoji: '🧹',
    rarity: 'rare',
    points: 100,
    check: (s) => s.netLOC < -1000 ? s.lastCommit : null,
  },
  {
    id: 'novelist',
    name: 'Novelist',
    description: 'Average commit message over 100 characters',
    emoji: '📖',
    rarity: 'uncommon',
    points: 40,
    check: (s) => s.avgMessageLength > 100 ? s.lastCommit : null,
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: '50 commits with less than 10 lines changed each',
    emoji: '🎯',
    rarity: 'rare',
    points: 60,
    check: (s) => s.smallCommits >= 50 ? s.lastCommit : null,
  },
  {
    id: 'big_bang',
    name: 'Big Bang',
    description: 'Single commit with 1000+ lines changed',
    emoji: '💥',
    rarity: 'uncommon',
    points: 20,
    check: (s) => s.largestCommit >= 1000 ? s.lastCommit : null,
  },
  {
    id: 'streak_master',
    name: 'Streak Master',
    description: 'Committed for 30 consecutive days',
    emoji: '🔥',
    rarity: 'epic',
    points: 200,
    check: (s) => s.longestStreak >= 30 ? s.lastCommit : null,
  },
  {
    id: 'polyglot',
    name: 'Polyglot',
    description: 'Modified files with 10+ different extensions',
    emoji: '🌍',
    rarity: 'rare',
    points: 80,
    check: (s) => s.fileExtensions >= 10 ? s.lastCommit : null,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Modified files in 20+ different directories',
    emoji: '🧭',
    rarity: 'rare',
    points: 70,
    check: (s) => s.directoriesModified >= 20 ? s.lastCommit : null,
  },
  {
    id: 'feature_factory',
    name: 'Feature Factory',
    description: '50 feature commits (feat:)',
    emoji: '🏭',
    rarity: 'uncommon',
    points: 45,
    check: (s) => s.featCommits >= 50 ? s.lastCommit : null,
  },
  {
    id: 'documentation_hero',
    name: 'Documentation Hero',
    description: '30 documentation commits (docs:)',
    emoji: '📚',
    rarity: 'uncommon',
    points: 35,
    check: (s) => s.docsCommits >= 30 ? s.lastCommit : null,
  },
  {
    id: 'refactor_master',
    name: 'Refactor Master',
    description: '50 refactoring commits',
    emoji: '♻️',
    rarity: 'rare',
    points: 90,
    check: (s) => s.refactorCommits >= 50 ? s.lastCommit : null,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Contributing to the project for over 1 year',
    emoji: '🎖️',
    rarity: 'rare',
    points: 100,
    check: (s) => {
      if (!s.firstCommit || !s.lastCommit) return null;
      const days = (s.lastCommit.getTime() - s.firstCommit.getTime()) / (1000 * 60 * 60 * 24);
      return days >= 365 ? s.lastCommit : null;
    },
  },
  {
    id: 'founding_member',
    name: 'Founding Member',
    description: 'One of the first 3 contributors',
    emoji: '👑',
    rarity: 'legendary',
    points: 300,
    check: () => null, // Special check in main logic
  },
];

interface DeveloperStats {
  totalCommits: number;
  firstCommit: Date | null;
  lastCommit: Date | null;
  additions: number;
  deletions: number;
  netLOC: number;
  fixCommits: number;
  featCommits: number;
  docsCommits: number;
  refactorCommits: number;
  nightCommits: number;
  earlyCommits: number;
  weekendCommits: number;
  avgMessageLength: number;
  smallCommits: number;
  largestCommit: number;
  longestStreak: number;
  fileExtensions: number;
  directoriesModified: number;
  activeDays: number;
}

export class LeaderboardAnalyzer implements Analyzer<LeaderboardStats> {
  name = 'leaderboard-analyzer';
  description = 'Generates gamified leaderboards and achievements';

  async analyze(commits: Commit[], _config: AnalysisConfig): Promise<LeaderboardStats> {
    if (commits.length === 0) {
      return this.emptyStats();
    }

    // Compute stats per developer
    const developerStats = this.computeDeveloperStats(commits);

    // Generate leaderboards
    const leaderboards = this.generateLeaderboards(developerStats);

    // Generate achievements
    const achievements = this.generateAchievements(developerStats, commits);

    // Generate fun stats
    const funStats = this.generateFunStats(developerStats, commits);

    // Generate records
    const records = this.generateRecords(commits);

    return {
      leaderboards,
      achievements,
      funStats,
      records,
    };
  }

  private computeDeveloperStats(commits: Commit[]): Map<string, DeveloperStats & { name: string; email: string }> {
    const statsMap = new Map<string, DeveloperStats & { name: string; email: string }>();

    // Group commits by author
    const commitsByAuthor = new Map<string, Commit[]>();
    for (const commit of commits) {
      const email = commit.author.email;
      if (!commitsByAuthor.has(email)) {
        commitsByAuthor.set(email, []);
      }
      commitsByAuthor.get(email)!.push(commit);
    }

    for (const [email, authorCommits] of commitsByAuthor.entries()) {
      const sorted = [...authorCommits].sort((a, b) => a.date.getTime() - b.date.getTime());
      const name = authorCommits[0].author.name;

      let additions = 0;
      let deletions = 0;
      let fixCommits = 0;
      let featCommits = 0;
      let docsCommits = 0;
      let refactorCommits = 0;
      let nightCommits = 0;
      let earlyCommits = 0;
      let weekendCommits = 0;
      let totalMessageLength = 0;
      let smallCommits = 0;
      let largestCommit = 0;
      const extensions = new Set<string>();
      const directories = new Set<string>();
      const activeDays = new Set<string>();

      for (const commit of authorCommits) {
        // LOC
        for (const file of commit.files) {
          additions += file.additions;
          deletions += file.deletions;

          // Extensions
          const ext = file.path.split('.').pop() || '';
          if (ext) extensions.add(ext);

          // Directories
          const dir = file.path.split('/').slice(0, -1).join('/');
          if (dir) directories.add(dir);
        }

        // Commit types
        const msg = commit.message.toLowerCase();
        if (/^fix/i.test(msg) || /bug\s*fix/i.test(msg)) fixCommits++;
        if (/^feat/i.test(msg)) featCommits++;
        if (/^docs/i.test(msg)) docsCommits++;
        if (/^refactor/i.test(msg)) refactorCommits++;

        // Time-based
        const hour = commit.date.getHours();
        if (hour >= 0 && hour < 5) nightCommits++;
        if (hour >= 5 && hour < 7) earlyCommits++;

        const day = commit.date.getDay();
        if (day === 0 || day === 6) weekendCommits++;

        // Message length
        totalMessageLength += commit.message.length;

        // Commit size
        const commitSize = commit.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
        if (commitSize < 10) smallCommits++;
        if (commitSize > largestCommit) largestCommit = commitSize;

        // Active days
        activeDays.add(commit.date.toISOString().split('T')[0]);
      }

      // Calculate longest streak
      const longestStreak = this.calculateStreak(sorted);

      statsMap.set(email, {
        name,
        email,
        totalCommits: authorCommits.length,
        firstCommit: sorted[0]?.date || null,
        lastCommit: sorted[sorted.length - 1]?.date || null,
        additions,
        deletions,
        netLOC: additions - deletions,
        fixCommits,
        featCommits,
        docsCommits,
        refactorCommits,
        nightCommits,
        earlyCommits,
        weekendCommits,
        avgMessageLength: totalMessageLength / authorCommits.length,
        smallCommits,
        largestCommit,
        longestStreak,
        fileExtensions: extensions.size,
        directoriesModified: directories.size,
        activeDays: activeDays.size,
      });
    }

    return statsMap;
  }

  private calculateStreak(commits: Commit[]): number {
    if (commits.length === 0) return 0;

    const days = new Set<string>();
    commits.forEach(c => days.add(c.date.toISOString().split('T')[0]));

    const sortedDays = Array.from(days).sort();
    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1]);
      const curr = new Date(sortedDays[i]);
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    return maxStreak;
  }

  private generateLeaderboards(statsMap: Map<string, DeveloperStats & { name: string; email: string }>): Leaderboard[] {
    const stats = Array.from(statsMap.values());
    const leaderboards: Leaderboard[] = [];

    // Most Commits
    leaderboards.push({
      name: 'Most Commits',
      description: 'Total commits all time',
      emoji: '📝',
      entries: this.createEntries(stats, s => s.totalCommits, v => `${v} commits`),
    });

    // Lines Added
    leaderboards.push({
      name: 'Code Contributors',
      description: 'Most lines of code added',
      emoji: '➕',
      entries: this.createEntries(stats, s => s.additions, v => `+${v.toLocaleString()} LOC`),
    });

    // Bug Hunters
    leaderboards.push({
      name: 'Bug Hunters',
      description: 'Most bug fix commits',
      emoji: '🐛',
      entries: this.createEntries(stats, s => s.fixCommits, v => `${v} fixes`),
    });

    // Feature Builders
    leaderboards.push({
      name: 'Feature Builders',
      description: 'Most feature commits',
      emoji: '🚀',
      entries: this.createEntries(stats, s => s.featCommits, v => `${v} features`),
    });

    // Refactor Masters
    leaderboards.push({
      name: 'Refactor Masters',
      description: 'Net negative lines (cleaned up code)',
      emoji: '🧹',
      entries: this.createEntries(
        stats.filter(s => s.netLOC < 0),
        s => Math.abs(s.netLOC),
        v => `-${v.toLocaleString()} LOC`
      ),
    });

    // Documentation Heroes
    leaderboards.push({
      name: 'Documentation Heroes',
      description: 'Most documentation commits',
      emoji: '📚',
      entries: this.createEntries(stats, s => s.docsCommits, v => `${v} docs`),
    });

    // Consistency Kings
    leaderboards.push({
      name: 'Consistency Kings',
      description: 'Longest commit streak',
      emoji: '🔥',
      entries: this.createEntries(stats, s => s.longestStreak, v => `${v} days`),
    });

    // Night Owls
    leaderboards.push({
      name: 'Night Owls',
      description: 'Commits between midnight and 5am',
      emoji: '🦉',
      entries: this.createEntries(stats, s => s.nightCommits, v => `${v} night commits`),
    });

    // Weekend Warriors
    leaderboards.push({
      name: 'Weekend Warriors',
      description: 'Commits on weekends',
      emoji: '⚔️',
      entries: this.createEntries(stats, s => s.weekendCommits, v => `${v} weekend commits`),
    });

    // Precision (smallest avg commit)
    leaderboards.push({
      name: 'Precision Masters',
      description: 'Most atomic commits (smallest average size)',
      emoji: '🎯',
      entries: this.createEntries(
        stats.filter(s => s.totalCommits >= 10),
        s => s.smallCommits / s.totalCommits * 100,
        v => `${v.toFixed(0)}% small commits`,
        'desc'
      ),
    });

    // Explorers
    leaderboards.push({
      name: 'Codebase Explorers',
      description: 'Modified most directories',
      emoji: '🧭',
      entries: this.createEntries(stats, s => s.directoriesModified, v => `${v} directories`),
    });

    // Storytellers
    leaderboards.push({
      name: 'Storytellers',
      description: 'Longest average commit messages',
      emoji: '📖',
      entries: this.createEntries(
        stats.filter(s => s.totalCommits >= 10),
        s => s.avgMessageLength,
        v => `${v.toFixed(0)} chars avg`
      ),
    });

    return leaderboards;
  }

  private createEntries(
    stats: (DeveloperStats & { name: string; email: string })[],
    getValue: (s: DeveloperStats) => number,
    formatValue: (v: number) => string,
    order: 'asc' | 'desc' = 'desc'
  ): LeaderboardEntry[] {
    const sorted = [...stats].sort((a, b) => {
      const diff = getValue(b) - getValue(a);
      return order === 'desc' ? diff : -diff;
    });

    return sorted.slice(0, 10).map((s, i) => ({
      rank: i + 1,
      name: s.name,
      email: s.email,
      value: getValue(s),
      formattedValue: formatValue(getValue(s)),
      badge: i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : undefined,
    }));
  }

  private generateAchievements(
    statsMap: Map<string, DeveloperStats & { name: string; email: string }>,
    commits: Commit[]
  ): DeveloperAchievements[] {
    const achievements: DeveloperAchievements[] = [];

    // Find founding members (first 3 contributors by first commit date)
    const byFirstCommit = Array.from(statsMap.values())
      .filter(s => s.firstCommit)
      .sort((a, b) => a.firstCommit!.getTime() - b.firstCommit!.getTime());
    const foundingMembers = new Set(byFirstCommit.slice(0, 3).map(s => s.email));

    for (const [email, stats] of statsMap.entries()) {
      const earned: Achievement[] = [];

      for (const def of ACHIEVEMENT_DEFINITIONS) {
        // Special case for founding member
        if (def.id === 'founding_member') {
          if (foundingMembers.has(email) && stats.firstCommit) {
            earned.push({
              id: def.id,
              name: def.name,
              description: def.description,
              emoji: def.emoji,
              earnedAt: stats.firstCommit,
              rarity: def.rarity,
              points: def.points,
            });
          }
          continue;
        }

        const earnedAt = def.check(stats);
        if (earnedAt) {
          earned.push({
            id: def.id,
            name: def.name,
            description: def.description,
            emoji: def.emoji,
            earnedAt,
            rarity: def.rarity,
            points: def.points,
          });
        }
      }

      const totalPoints = earned.reduce((sum, a) => sum + a.points, 0);
      let level: string;
      if (totalPoints >= 1000) level = 'Legend';
      else if (totalPoints >= 500) level = 'Expert';
      else if (totalPoints >= 200) level = 'Contributor';
      else if (totalPoints >= 50) level = 'Regular';
      else level = 'Novice';

      achievements.push({
        name: stats.name,
        email: stats.email,
        achievements: earned.sort((a, b) => b.points - a.points),
        totalPoints,
        level,
      });
    }

    return achievements.sort((a, b) => b.totalPoints - a.totalPoints);
  }

  private generateFunStats(
    statsMap: Map<string, DeveloperStats & { name: string; email: string }>,
    commits: Commit[]
  ): FunStat[] {
    const stats = Array.from(statsMap.values());
    const funStats: FunStat[] = [];

    // Most commits in a single day
    const commitsByDay = new Map<string, { count: number; author: string }>();
    for (const commit of commits) {
      const day = commit.date.toISOString().split('T')[0];
      const key = `${day}-${commit.author.email}`;
      if (!commitsByDay.has(key)) {
        commitsByDay.set(key, { count: 0, author: commit.author.name });
      }
      commitsByDay.get(key)!.count++;
    }
    const maxDay = Array.from(commitsByDay.entries()).sort((a, b) => b[1].count - a[1].count)[0];
    if (maxDay) {
      funStats.push({
        name: 'Most Productive Day',
        emoji: '📅',
        winner: maxDay[1].author,
        value: `${maxDay[1].count} commits`,
        description: `On ${maxDay[0].split('-')[0]}`,
      });
    }

    // Shortest commit message
    const shortestMsg = commits.reduce((min, c) =>
      c.message.length < min.message.length ? c : min
    );
    funStats.push({
      name: 'Shortest Message',
      emoji: '📝',
      winner: shortestMsg.author.name,
      value: `"${shortestMsg.message.slice(0, 30)}${shortestMsg.message.length > 30 ? '...' : ''}"`,
      description: `${shortestMsg.message.length} characters`,
    });

    // Longest commit message
    const longestMsg = commits.reduce((max, c) =>
      c.message.length > max.message.length ? c : max
    );
    funStats.push({
      name: 'Longest Message',
      emoji: '📜',
      winner: longestMsg.author.name,
      value: `${longestMsg.message.length} characters`,
      description: 'Most detailed commit message',
    });

    // Latest night commit
    const nightCommits = commits.filter(c => {
      const hour = c.date.getHours();
      return hour >= 0 && hour < 5;
    });
    if (nightCommits.length > 0) {
      const latest = nightCommits.reduce((max, c) => {
        const hour = c.date.getHours();
        const maxHour = max.date.getHours();
        // Closer to 5am is "later"
        return hour > maxHour ? c : max;
      });
      funStats.push({
        name: 'Latest Night Owl',
        emoji: '🌙',
        winner: latest.author.name,
        value: `${latest.date.getHours()}:${latest.date.getMinutes().toString().padStart(2, '0')} AM`,
        description: 'Latest recorded commit time',
      });
    }

    // Most diverse (file extensions)
    const mostDiverse = stats.reduce((max, s) =>
      s.fileExtensions > max.fileExtensions ? s : max
    );
    funStats.push({
      name: 'Polyglot',
      emoji: '🌍',
      winner: mostDiverse.name,
      value: `${mostDiverse.fileExtensions} file types`,
      description: 'Most diverse file extensions modified',
    });

    // Biggest single commit
    let biggestCommit: Commit | null = null;
    let biggestSize = 0;
    for (const commit of commits) {
      const size = commit.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
      if (size > biggestSize) {
        biggestSize = size;
        biggestCommit = commit;
      }
    }
    if (biggestCommit) {
      funStats.push({
        name: 'Big Bang',
        emoji: '💥',
        winner: biggestCommit.author.name,
        value: `${biggestSize.toLocaleString()} lines`,
        description: 'Largest single commit',
      });
    }

    return funStats;
  }

  private generateRecords(commits: Commit[]): RepositoryRecord[] {
    const records: RepositoryRecord[] = [];

    // First commit ever
    const firstCommit = commits.reduce((min, c) =>
      c.date < min.date ? c : min
    );
    records.push({
      name: 'First Commit',
      holder: firstCommit.author.name,
      value: firstCommit.message.slice(0, 50),
      date: firstCommit.date,
      emoji: '🎂',
    });

    // Most recent commit
    const lastCommit = commits.reduce((max, c) =>
      c.date > max.date ? c : max
    );
    records.push({
      name: 'Latest Commit',
      holder: lastCommit.author.name,
      value: lastCommit.message.slice(0, 50),
      date: lastCommit.date,
      emoji: '🆕',
    });

    // Most files in single commit
    const mostFiles = commits.reduce((max, c) =>
      c.files.length > max.files.length ? c : max
    );
    records.push({
      name: 'Most Files Changed',
      holder: mostFiles.author.name,
      value: `${mostFiles.files.length} files`,
      date: mostFiles.date,
      emoji: '📁',
    });

    return records;
  }

  private emptyStats(): LeaderboardStats {
    return {
      leaderboards: [],
      achievements: [],
      funStats: [],
      records: [],
    };
  }
}

export function createLeaderboardAnalyzer(): LeaderboardAnalyzer {
  return new LeaderboardAnalyzer();
}
