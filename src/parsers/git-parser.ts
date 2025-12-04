import type {
  Commit,
  Author,
  FileChange,
  FileStatus,
  Branch,
  Tag,
  Repository,
  Remote,
  GitParser,
  AnalysisConfig,
} from '../types/index.ts';
import { execGit, isGitRepository } from '../utils/exec.ts';
import { basename } from 'node:path';

// Unique separator for parsing git log output
// Using record separator (0x1e) and unit separator (0x1f) for reliability
const COMMIT_SEPARATOR = '\x1e'; // Record separator
const FIELD_SEPARATOR = '\x1f';  // Unit separator

/**
 * Git log format string for extracting commit data
 * Fields: hash, short hash, author name, author email, author date,
 *         committer name, committer email, subject, body, parent hashes
 */
const LOG_FORMAT =
  COMMIT_SEPARATOR +
  [
    '%H',  // full hash
    '%h',  // short hash
    '%an', // author name
    '%ae', // author email
    '%aI', // author date (ISO 8601)
    '%cn', // committer name
    '%ce', // committer email
    '%s',  // subject
    '%b',  // body
    '%P',  // parent hashes
  ].join(FIELD_SEPARATOR);

export class GitParserImpl implements GitParser {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Validate that the path is a git repository
   */
  async validate(): Promise<void> {
    const isRepo = await isGitRepository(this.repoPath);
    if (!isRepo) {
      throw new Error(`Not a git repository: ${this.repoPath}`);
    }
  }

  /**
   * Get all commits with optional filtering
   */
  async getCommits(options: Partial<AnalysisConfig> = {}): Promise<Commit[]> {
    await this.validate();

    const args = ['log', `--format=${LOG_FORMAT}`, '--numstat'];

    if (options.branch) {
      args.push(options.branch);
    } else {
      args.push('--all');
    }

    if (options.since) {
      args.push(`--since=${options.since.toISOString()}`);
    }

    if (options.until) {
      args.push(`--until=${options.until.toISOString()}`);
    }

    if (options.authors && options.authors.length > 0) {
      for (const author of options.authors) {
        args.push(`--author=${author}`);
      }
    }

    if (options.excludeMerges) {
      args.push('--no-merges');
    }

    if (options.maxCommits) {
      args.push(`-n`, options.maxCommits.toString());
    }

    if (options.excludePaths && options.excludePaths.length > 0) {
      args.push('--');
      args.push('.');
      for (const path of options.excludePaths) {
        args.push(`:!${path}`);
      }
    }

    if (options.includePaths && options.includePaths.length > 0) {
      args.push('--');
      args.push(...options.includePaths);
    }

    const output = await execGit(args, this.repoPath);
    return this.parseCommits(output);
  }

  /**
   * Parse raw git log output into Commit objects
   */
  private parseCommits(output: string): Commit[] {
    const commits: Commit[] = [];

    // Split by commit separator (which marks the start of each commit)
    const rawCommits = output.split(COMMIT_SEPARATOR).filter(s => s.trim());

    for (const rawCommit of rawCommits) {
      const commit = this.parseCommit(rawCommit);
      if (commit) {
        commits.push(commit);
      }
    }

    return commits;
  }

  /**
   * Parse a single commit from raw output
   */
  private parseCommit(raw: string): Commit | null {
    // The format is: fields separated by FIELD_SEPARATOR, followed by numstat lines
    // First, split by newlines to separate the header from numstat
    const lines = raw.split('\n');
    if (lines.length === 0) return null;

    // The first line(s) contain the formatted commit info - need to find where numstat starts
    // numstat format is: number\tnumber\tpath
    let headerEndIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      // numstat lines start with digits or dash followed by tab
      if (lines[i].match(/^(\d+|-)\t(\d+|-)\t/)) {
        headerEndIndex = i;
        break;
      }
      headerEndIndex = i + 1;
    }

    // Join header lines back (in case body has newlines)
    const headerPart = lines.slice(0, headerEndIndex).join('\n');
    const numstatLines = lines.slice(headerEndIndex);

    // Parse header fields
    const fields = headerPart.split(FIELD_SEPARATOR);

    if (fields.length < 10) return null;

    const [
      hash,
      hashShort,
      authorName,
      authorEmail,
      dateStr,
      committerName,
      committerEmail,
      subject,
      body,
      parentHashes,
    ] = fields;

    // Clean up body - it might have trailing whitespace
    const cleanBody = body?.trim() || '';
    const parents = parentHashes?.trim().split(' ').filter(Boolean) || [];

    // Parse file changes from numstat output
    const files = this.parseFileChanges(numstatLines);

    return {
      hash: hash?.trim(),
      hashShort: hashShort?.trim(),
      author: { name: authorName?.trim(), email: authorEmail?.trim() },
      committer: { name: committerName?.trim(), email: committerEmail?.trim() },
      date: new Date(dateStr?.trim()),
      message: cleanBody ? `${subject?.trim()}\n\n${cleanBody}` : subject?.trim(),
      messageSubject: subject?.trim(),
      messageBody: cleanBody,
      parents,
      isMerge: parents.length > 1,
      files,
    };
  }

  /**
   * Parse numstat output into FileChange objects
   */
  private parseFileChanges(lines: string[]): FileChange[] {
    const files: FileChange[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // numstat format: additions\tdeletions\tfilepath
      // For renames: additions\tdeletions\toldpath => newpath
      const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!match) continue;

      const [, addStr, delStr, pathPart] = match;
      const additions = addStr === '-' ? 0 : parseInt(addStr, 10);
      const deletions = delStr === '-' ? 0 : parseInt(delStr, 10);
      const binary = addStr === '-' && delStr === '-';

      // Check for rename
      const renameMatch = pathPart.match(/^(.+) => (.+)$/);
      let path: string;
      let oldPath: string | undefined;
      let status: FileStatus;

      if (renameMatch) {
        // Handle different rename formats
        const [, oldPart, newPart] = renameMatch;

        // Format could be: {old => new}/rest or full/path/{old => new}
        if (pathPart.includes('{')) {
          const fullMatch = pathPart.match(/^(.*)\{(.+) => (.+)\}(.*)$/);
          if (fullMatch) {
            const [, prefix, oldName, newName, suffix] = fullMatch;
            oldPath = `${prefix}${oldName}${suffix}`;
            path = `${prefix}${newName}${suffix}`;
          } else {
            path = newPart;
            oldPath = oldPart;
          }
        } else {
          path = newPart;
          oldPath = oldPart;
        }
        status = 'renamed';
      } else {
        path = pathPart;
        status = 'modified'; // Will be refined later if needed
      }

      files.push({
        path,
        oldPath,
        additions,
        deletions,
        binary,
        status,
      });
    }

    return files;
  }

  /**
   * Get all branches
   */
  async getBranches(): Promise<Branch[]> {
    await this.validate();

    const output = await execGit(
      ['branch', '-a', '--format=%(refname:short)|%(objectname:short)|%(committerdate:iso)|%(HEAD)'],
      this.repoPath
    );

    const branches: Branch[] = [];

    for (const line of output.trim().split('\n')) {
      if (!line.trim()) continue;

      const [name, hash, dateStr, isHead] = line.split('|');
      const isRemote = name.startsWith('remotes/') || name.startsWith('origin/');

      branches.push({
        name: isRemote ? name.replace(/^remotes\//, '') : name,
        isRemote,
        isCurrent: isHead === '*',
        lastCommitHash: hash,
        lastCommitDate: new Date(dateStr),
      });
    }

    return branches;
  }

  /**
   * Get all tags
   */
  async getTags(): Promise<Tag[]> {
    await this.validate();

    const output = await execGit(
      ['tag', '-l', '--format=%(refname:short)|%(objectname:short)|%(creatordate:iso)|%(contents:subject)'],
      this.repoPath
    );

    const tags: Tag[] = [];

    for (const line of output.trim().split('\n')) {
      if (!line.trim()) continue;

      const [name, hash, dateStr, message] = line.split('|');

      tags.push({
        name,
        hash,
        date: new Date(dateStr),
        message: message || undefined,
        isAnnotated: !!message,
      });
    }

    return tags;
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(): Promise<Repository> {
    await this.validate();

    // Get remotes
    const remotesOutput = await execGit(['remote', '-v'], this.repoPath);
    const remotes = this.parseRemotes(remotesOutput);

    // Get default branch
    let defaultBranch = 'main';
    try {
      const headRef = await execGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], this.repoPath);
      defaultBranch = headRef.trim().replace('refs/remotes/origin/', '');
    } catch {
      // Try to get current branch as fallback
      try {
        const currentBranch = await execGit(['branch', '--show-current'], this.repoPath);
        defaultBranch = currentBranch.trim() || 'main';
      } catch {
        defaultBranch = 'main';
      }
    }

    // Get first and last commit dates
    let createdAt = new Date();
    let lastCommitAt = new Date();

    try {
      const firstCommit = await execGit(
        ['log', '--reverse', '--format=%aI', '-1'],
        this.repoPath
      );
      createdAt = new Date(firstCommit.trim());

      const lastCommit = await execGit(
        ['log', '--format=%aI', '-1'],
        this.repoPath
      );
      lastCommitAt = new Date(lastCommit.trim());
    } catch {
      // Empty repository
    }

    return {
      path: this.repoPath,
      name: basename(this.repoPath),
      remotes,
      defaultBranch,
      createdAt,
      lastCommitAt,
    };
  }

  /**
   * Parse remotes output
   */
  private parseRemotes(output: string): Remote[] {
    const remotes: Remote[] = [];
    const seen = new Set<string>();

    for (const line of output.trim().split('\n')) {
      if (!line.trim()) continue;

      const match = line.match(/^(\S+)\t(\S+)\s+\((fetch|push)\)$/);
      if (!match) continue;

      const [, name, url, type] = match;
      const key = `${name}|${type}`;

      if (!seen.has(key)) {
        seen.add(key);
        remotes.push({
          name,
          url,
          type: type as 'fetch' | 'push',
        });
      }
    }

    return remotes;
  }

  /**
   * Get commit history for a specific file
   */
  async getFileHistory(filePath: string): Promise<Commit[]> {
    await this.validate();

    const args = ['log', `--format=${LOG_FORMAT}`, '--numstat', '--follow', '--', filePath];
    const output = await execGit(args, this.repoPath);
    return this.parseCommits(output);
  }

  /**
   * Get the list of all files in the repository
   */
  async getFiles(): Promise<string[]> {
    await this.validate();

    const output = await execGit(['ls-files'], this.repoPath);
    return output.trim().split('\n').filter(Boolean);
  }

  /**
   * Get blame information for a file
   */
  async getBlame(filePath: string): Promise<Map<number, { author: Author; commit: string }>> {
    await this.validate();

    const output = await execGit(
      ['blame', '--line-porcelain', filePath],
      this.repoPath
    );

    const blameMap = new Map<number, { author: Author; commit: string }>();
    const lines = output.split('\n');

    let currentCommit = '';
    let currentAuthor = '';
    let currentEmail = '';
    let lineNumber = 0;

    for (const line of lines) {
      if (line.match(/^[0-9a-f]{40}/)) {
        currentCommit = line.substring(0, 40);
        const parts = line.split(' ');
        lineNumber = parseInt(parts[2], 10);
      } else if (line.startsWith('author ')) {
        currentAuthor = line.substring(7);
      } else if (line.startsWith('author-mail ')) {
        currentEmail = line.substring(12).replace(/[<>]/g, '');
      } else if (line.startsWith('\t')) {
        // Content line - save the blame info
        blameMap.set(lineNumber, {
          author: { name: currentAuthor, email: currentEmail },
          commit: currentCommit,
        });
      }
    }

    return blameMap;
  }
}

/**
 * Create a new GitParser instance
 */
export function createGitParser(repoPath: string): GitParser {
  return new GitParserImpl(repoPath);
}
