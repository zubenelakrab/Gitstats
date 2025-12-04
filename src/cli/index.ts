#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolve } from 'node:path';
import { analyzeRepository } from '../core/analyzer.ts';
import { createRenderer } from '../outputs/index.ts';
import { isGitRepository } from '../utils/exec.ts';
import type { AnalysisConfig, OutputFormat } from '../types/index.ts';

const BANNER = `
   ${chalk.cyan('_____ _ _   _____ _        _')}
  ${chalk.cyan('/ ____(_) | / ____| |      | |')}
 ${chalk.cyan('| |  __ _| |_| (___ | |_ __ _| |_ ___')}
 ${chalk.cyan('| | |_ | | __|\\___ \\| __/ _\` | __/ __|')}
 ${chalk.cyan('| |__| | | |_ ____) | || (_| | |_\\__ \\')}
  ${chalk.cyan('\\_____|\\_\\__|_____/ \\__\\__,_|\\__|___/')}
                                    ${chalk.gray('v0.1.0')}
`;

function showBanner(): void {
  console.log(BANNER);
}

const program = new Command();

program
  .name('gitstats')
  .description('Powerful Git repository analyzer with comprehensive statistics')
  .version('0.1.0')
  .addHelpText('before', BANNER);

// Main analyze command
program
  .command('analyze')
  .description('Analyze a Git repository')
  .argument('[path]', 'Path to the repository', '.')
  .option('-o, --output <format>', 'Output format (cli, json, html)', 'cli')
  .option('-f, --file <path>', 'Save output to file')
  .option('-b, --branch <branch>', 'Analyze specific branch')
  .option('--since <date>', 'Only commits after this date (ISO format)')
  .option('--until <date>', 'Only commits before this date (ISO format)')
  .option('--author <author>', 'Filter by author (can be used multiple times)', collect, [])
  .option('--exclude <path>', 'Exclude paths (glob pattern, can be used multiple times)', collect, [])
  .option('--include <path>', 'Include only these paths (glob pattern)', collect, [])
  .option('--no-merges', 'Exclude merge commits')
  .option('--max-commits <n>', 'Maximum number of commits to analyze', parseInt)
  .option('--theme <theme>', 'Theme for HTML output (light, dark)', 'light')
  .action(async (path: string, options) => {
    showBanner();
    const repoPath = resolve(path);

    // Validate repository
    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing repository...').start();

    try {
      // Build config
      const config: AnalysisConfig = {
        repoPath,
        branch: options.branch,
        since: options.since ? new Date(options.since) : undefined,
        until: options.until ? new Date(options.until) : undefined,
        authors: options.author.length > 0 ? options.author : undefined,
        excludePaths: options.exclude.length > 0 ? options.exclude : undefined,
        includePaths: options.include.length > 0 ? options.include : undefined,
        excludeMerges: !options.merges,
        maxCommits: options.maxCommits,
      };

      // Run analysis
      const report = await analyzeRepository(config, (progress) => {
        spinner.text = `${progress.phase} (${progress.current}/${progress.total})`;
      });

      spinner.succeed('Analysis complete');

      // Render output
      const format = options.output as OutputFormat;
      const renderer = createRenderer(format);
      const output = await renderer.render(report, {
        format,
        options: {
          pretty: true,
          theme: options.theme,
        },
      });

      // Save or display
      if (options.file) {
        await renderer.save(output, options.file);
        console.log(chalk.green(`\nOutput saved to: ${options.file}`));
      } else {
        console.log('\n' + output);
      }
    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Quick summary command
program
  .command('summary')
  .description('Show quick summary of a repository')
  .argument('[path]', 'Path to the repository', '.')
  .action(async (path: string) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Fetching summary...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      console.log('');
      console.log(chalk.bold.cyan(`  ${report.repository.name}`));
      console.log(chalk.gray(`  ${'─'.repeat(40)}`));
      console.log(`  ${chalk.bold('Commits:')}      ${report.summary.totalCommits.toLocaleString()}`);
      console.log(`  ${chalk.bold('Authors:')}      ${report.summary.totalAuthors}`);
      console.log(`  ${chalk.bold('Lines added:')}  ${chalk.green('+' + report.summary.totalAdditions.toLocaleString())}`);
      console.log(`  ${chalk.bold('Lines deleted:')} ${chalk.red('-' + report.summary.totalDeletions.toLocaleString())}`);
      console.log(`  ${chalk.bold('Bus factor:')}   ${report.busFactor.overall}`);
      console.log(`  ${chalk.bold('Age:')}          ${report.summary.repositoryAge} days`);
      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Authors command
program
  .command('authors')
  .description('List contributors with stats')
  .argument('[path]', 'Path to the repository', '.')
  .option('-n, --top <n>', 'Show top N authors', parseInt, 10)
  .option('--sort <field>', 'Sort by field (commits, additions, deletions)', 'commits')
  .action(async (path: string, options) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing authors...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      let authors = [...report.authors];

      // Sort by specified field
      switch (options.sort) {
        case 'additions':
          authors.sort((a, b) => b.additions - a.additions);
          break;
        case 'deletions':
          authors.sort((a, b) => b.deletions - a.deletions);
          break;
        // commits is default
      }

      authors = authors.slice(0, options.top);

      console.log('');
      console.log(chalk.bold.cyan(`  Top ${options.top} Contributors`));
      console.log(chalk.gray(`  ${'─'.repeat(60)}`));

      authors.forEach((author, i) => {
        const rank = (i + 1).toString().padStart(2);
        const name = author.author.name.substring(0, 25).padEnd(25);
        const commits = author.commits.toString().padStart(6);
        const additions = chalk.green(`+${author.additions.toLocaleString()}`);
        const deletions = chalk.red(`-${author.deletions.toLocaleString()}`);

        console.log(`  ${chalk.gray(rank)}. ${name} ${chalk.yellow(commits)} commits  ${additions} ${deletions}`);
      });

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Hotspots command
program
  .command('hotspots')
  .description('Show code hotspots (high churn files)')
  .argument('[path]', 'Path to the repository', '.')
  .option('-n, --top <n>', 'Show top N hotspots', parseInt, 15)
  .action(async (path: string, options) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing hotspots...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const hotspots = report.hotspots.files.slice(0, options.top);

      console.log('');
      console.log(chalk.bold.red(`  🔥 Code Hotspots (High Churn)`));
      console.log(chalk.gray(`  ${'─'.repeat(60)}`));

      hotspots.forEach((file, i) => {
        const rank = (i + 1).toString().padStart(2);
        const path = file.path.length > 50 ? '...' + file.path.slice(-47) : file.path.padEnd(50);
        const commits = file.commits.toString().padStart(4);
        const churn = file.churnScore.toFixed(1).padStart(6);

        const churnColor = file.churnScore > 100 ? chalk.red :
                          file.churnScore > 50 ? chalk.yellow : chalk.green;

        console.log(`  ${chalk.gray(rank)}. ${path} ${chalk.gray(commits)} commits  ${churnColor(churn)} churn`);
      });

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Bus factor command
program
  .command('busfactor')
  .description('Analyze bus factor and knowledge distribution')
  .argument('[path]', 'Path to the repository', '.')
  .action(async (path: string) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing bus factor...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const { busFactor } = report;

      console.log('');
      console.log(chalk.bold.cyan(`  🚌 Bus Factor Analysis`));
      console.log(chalk.gray(`  ${'─'.repeat(50)}`));

      const bfColor = busFactor.overall <= 1 ? chalk.red :
                      busFactor.overall <= 2 ? chalk.yellow : chalk.green;
      const bfEmoji = busFactor.overall <= 1 ? '🚨' :
                      busFactor.overall <= 2 ? '⚠️' : '✅';

      console.log(`\n  Overall Bus Factor: ${bfColor.bold(busFactor.overall.toString())} ${bfEmoji}`);

      if (busFactor.criticalAreas.length > 0) {
        const highRisk = busFactor.criticalAreas.filter(a => a.risk === 'high');
        const mediumRisk = busFactor.criticalAreas.filter(a => a.risk === 'medium');

        console.log(`\n  ${chalk.red('High risk areas:')} ${highRisk.length}`);
        console.log(`  ${chalk.yellow('Medium risk areas:')} ${mediumRisk.length}`);

        if (highRisk.length > 0) {
          console.log(chalk.gray(`\n  ${'─'.repeat(50)}`));
          console.log(chalk.bold.red('\n  Critical Files (single point of failure):'));

          highRisk.slice(0, 10).forEach((area) => {
            const path = area.path.length > 40 ? '...' + area.path.slice(-37) : area.path;
            const owner = area.soleContributor?.name || 'Unknown';
            console.log(`    ${chalk.red('●')} ${path}`);
            console.log(`      ${chalk.gray('Owner:')} ${owner}`);
          });
        }
      } else {
        console.log(chalk.green('\n  ✅ No critical risk areas detected'));
      }

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Helper function to collect multiple values
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

// Parse and execute
program.parse();
