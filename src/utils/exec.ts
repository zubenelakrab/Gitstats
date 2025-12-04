import { spawn } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
}

/**
 * Execute a command and return the result
 */
export async function exec(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd = process.cwd(), timeout = 60000, maxBuffer = 50 * 1024 * 1024 } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let stderrSize = 0;

    proc.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdoutSize += data.length;
      if (stdoutSize <= maxBuffer) {
        stdout += chunk;
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderrSize += data.length;
      if (stderrSize <= maxBuffer) {
        stderr += chunk;
      }
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Execute a git command in a repository
 */
export async function execGit(
  args: string[],
  repoPath: string
): Promise<string> {
  const result = await exec('git', args, { cwd: repoPath });

  if (result.exitCode !== 0) {
    throw new Error(`Git command failed: git ${args.join(' ')}\n${result.stderr}`);
  }

  return result.stdout;
}

/**
 * Check if a directory is a git repository
 */
export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const result = await exec('git', ['rev-parse', '--git-dir'], { cwd: path });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
