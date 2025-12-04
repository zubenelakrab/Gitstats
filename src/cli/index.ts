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

      // Directory hotspots
      if (report.hotspots.directoryHotspots && report.hotspots.directoryHotspots.length > 0) {
        console.log('');
        console.log(chalk.bold.yellow(`  📁 Directory Hotspots`));
        console.log(chalk.gray(`  ${'─'.repeat(60)}`));

        report.hotspots.directoryHotspots.slice(0, 8).forEach(dir => {
          const riskColor = dir.riskLevel === 'critical' ? chalk.red :
                           dir.riskLevel === 'high' ? chalk.yellow :
                           dir.riskLevel === 'medium' ? chalk.cyan : chalk.green;
          const riskBadge = riskColor(`[${dir.riskLevel.toUpperCase()}]`);

          console.log(`    ${dir.path.padEnd(30)} ${riskBadge} ${dir.commits} commits, ${dir.fileCount} files`);
        });
      }

      // Risk map
      if (report.hotspots.riskMap && report.hotspots.riskMap.length > 0) {
        console.log('');
        console.log(chalk.bold.red(`  🎯 Risk Map (highest risk files)`));
        console.log(chalk.gray(`  ${'─'.repeat(60)}`));

        report.hotspots.riskMap.slice(0, 5).forEach(entry => {
          const riskColor = entry.riskLevel === 'critical' ? chalk.red :
                           entry.riskLevel === 'high' ? chalk.yellow : chalk.cyan;
          const path = entry.path.length > 40 ? '...' + entry.path.slice(-37) : entry.path;

          console.log(`    ${riskColor('●')} ${path.padEnd(42)} ${riskColor(`${entry.combinedRisk.toFixed(0)}%`)}`);
          console.log(`      ${chalk.gray(entry.recommendation)}`);
        });
      }

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

// Velocity command
program
  .command('velocity')
  .description('Analyze development velocity and trends')
  .argument('[path]', 'Path to the repository', '.')
  .action(async (path: string) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing velocity...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const velocity = report.velocity;
      if (!velocity) {
        console.log(chalk.yellow('No velocity data available'));
        return;
      }

      console.log('');
      console.log(chalk.bold.cyan(`  🚀 Development Velocity`));
      console.log(chalk.gray(`  ${'─'.repeat(50)}`));

      const trendEmoji = velocity.trend === 'accelerating' ? '📈' :
                         velocity.trend === 'decelerating' ? '📉' : '➡️';
      const trendColor = velocity.trend === 'accelerating' ? chalk.green :
                         velocity.trend === 'decelerating' ? chalk.red : chalk.yellow;

      console.log(`\n  ${chalk.bold('Commits per day:')}    ${velocity.commitsPerDay.toFixed(2)}`);
      console.log(`  ${chalk.bold('Commits per week:')}   ${velocity.commitsPerWeek.toFixed(2)}`);
      console.log(`  ${chalk.bold('Commits per month:')}  ${velocity.commitsPerMonth.toFixed(2)}`);
      console.log(`\n  ${chalk.bold('Trend:')} ${trendColor(velocity.trend)} ${trendEmoji} (${velocity.trendPercentage > 0 ? '+' : ''}${velocity.trendPercentage.toFixed(1)}%)`);
      console.log(`  ${chalk.bold('Consistency score:')} ${velocity.consistencyScore.toFixed(0)}%`);
      console.log(`  ${chalk.bold('Avg time between commits:')} ${velocity.averageTimeBetweenCommits.toFixed(1)} hours`);

      // MTBLC (Mean Time Between Large Commits)
      if (velocity.mtblc && velocity.mtblc > 0) {
        console.log(`  ${chalk.bold('Large commit frequency:')} ${velocity.largeCommitFrequency}`);
      }

      if (velocity.busiestWeek) {
        console.log(`\n  ${chalk.bold('Busiest week:')}  ${velocity.busiestWeek.week} (${velocity.busiestWeek.commits} commits)`);
      }
      if (velocity.slowestWeek) {
        console.log(`  ${chalk.bold('Slowest week:')}  ${velocity.slowestWeek.week} (${velocity.slowestWeek.commits} commits)`);
      }

      // Release rhythm
      if (velocity.releaseRhythm && velocity.releaseRhythm.releases.length > 0) {
        console.log(chalk.bold(`\n  📦 Release Rhythm:`));
        console.log(`    Frequency: ${chalk.cyan(velocity.releaseRhythm.releaseFrequency)}`);
        console.log(`    Avg days between releases: ${velocity.releaseRhythm.averageDaysBetweenReleases}`);
        if (velocity.releaseRhythm.lastRelease) {
          console.log(`    Days since last release: ${velocity.releaseRhythm.daysSinceLastRelease}`);
        }
      }

      // Velocity by day of week
      if (velocity.velocityByDayOfWeek) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const max = Math.max(...velocity.velocityByDayOfWeek);
        console.log(chalk.bold(`\n  📅 Commits by Day of Week:`));
        velocity.velocityByDayOfWeek.forEach((count, i) => {
          const bar = max > 0 ? '█'.repeat(Math.round((count / max) * 20)) : '';
          console.log(`    ${days[i].padEnd(4)} ${chalk.cyan(bar.padEnd(20))} ${count}`);
        });
      }

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Complexity command
program
  .command('complexity')
  .description('Analyze code complexity and identify problematic files')
  .argument('[path]', 'Path to the repository', '.')
  .option('-n, --top <n>', 'Show top N items', parseInt, 10)
  .action(async (path: string, options) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing complexity...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const complexity = report.complexity;
      if (!complexity) {
        console.log(chalk.yellow('No complexity data available'));
        return;
      }

      console.log('');
      console.log(chalk.bold.magenta(`  🧩 Code Complexity Analysis`));
      console.log(chalk.gray(`  ${'─'.repeat(60)}`));

      console.log(`\n  ${chalk.bold('Average file growth:')} ${complexity.averageFileGrowth.toFixed(1)} lines`);
      console.log(`  ${chalk.bold('High churn files:')} ${complexity.filesWithHighChurn}`);

      // Technical debt score
      if (complexity.technicalDebtScore !== undefined) {
        const debtColor = complexity.technicalDebtScore < 30 ? chalk.green :
                          complexity.technicalDebtScore < 60 ? chalk.yellow : chalk.red;
        console.log(`  ${chalk.bold('Technical Debt Score:')} ${debtColor(complexity.technicalDebtScore.toString())}/100`);

        if (complexity.debtTrend) {
          const trendEmoji = complexity.debtTrend === 'increasing' ? '📈' :
                            complexity.debtTrend === 'decreasing' ? '📉' : '➡️';
          console.log(`  ${chalk.bold('Debt Trend:')} ${complexity.debtTrend} ${trendEmoji}`);
        }
      }

      // Debt indicators
      if (complexity.debtIndicators && complexity.debtIndicators.length > 0) {
        console.log(chalk.bold(`\n  💳 Debt Indicators:`));
        for (const indicator of complexity.debtIndicators) {
          const statusEmoji = indicator.status === 'good' ? '✅' :
                              indicator.status === 'warning' ? '⚠️' : '❌';
          const statusColor = indicator.status === 'good' ? chalk.green :
                              indicator.status === 'warning' ? chalk.yellow : chalk.red;
          console.log(`    ${statusEmoji} ${indicator.name.padEnd(18)} ${statusColor(indicator.value.toString().padStart(5))}`);
          console.log(`       ${chalk.gray(indicator.description)}`);
        }
      }

      // Debt by module
      if (complexity.debtByModule && complexity.debtByModule.length > 0) {
        console.log(chalk.bold(`\n  📁 Debt by Module:`));
        complexity.debtByModule.slice(0, 5).forEach(mod => {
          const scoreColor = mod.debtScore < 30 ? chalk.green :
                            mod.debtScore < 60 ? chalk.yellow : chalk.red;
          console.log(`    ${mod.path.padEnd(25)} ${scoreColor(mod.debtScore.toString() + '%')} (${mod.filesWithDebt}/${mod.totalFiles} files)`);
          if (mod.topIssues.length > 0) {
            console.log(`      ${chalk.gray(mod.topIssues.join(', '))}`);
          }
        });
      }

      if (complexity.godFiles.length > 0) {
        console.log(chalk.bold.red(`\n  ⚠️  God Files (too many changes):`));
        complexity.godFiles.slice(0, options.top).forEach(file => {
          const path = file.path.length > 45 ? '...' + file.path.slice(-42) : file.path.padEnd(45);
          console.log(`    ${chalk.red('●')} ${path} ${chalk.gray(file.reason)}`);
        });
      }

      if (complexity.growingFiles.length > 0) {
        console.log(chalk.bold.yellow(`\n  📈 Rapidly Growing Files:`));
        complexity.growingFiles.slice(0, options.top).forEach(file => {
          const path = file.path.length > 45 ? '...' + file.path.slice(-42) : file.path.padEnd(45);
          console.log(`    ${chalk.yellow('●')} ${path} +${file.netGrowth} lines (${file.trend})`);
        });
      }

      if (complexity.refactoringCandidates.length > 0) {
        console.log(chalk.bold.blue(`\n  🔧 Refactoring Candidates:`));
        complexity.refactoringCandidates.slice(0, options.top).forEach(file => {
          const path = file.path.length > 45 ? '...' + file.path.slice(-42) : file.path.padEnd(45);
          console.log(`    ${chalk.blue('●')} ${path}`);
          console.log(`      ${chalk.gray(file.suggestion)}`);
        });
      }

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Work patterns command
program
  .command('workpatterns')
  .description('Analyze work patterns and team habits')
  .argument('[path]', 'Path to the repository', '.')
  .action(async (path: string) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing work patterns...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const patterns = report.workPatterns;
      if (!patterns) {
        console.log(chalk.yellow('No work patterns data available'));
        return;
      }

      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const peakHourFormatted = `${patterns.peakHour.toString().padStart(2, '0')}:00`;

      console.log('');
      console.log(chalk.bold.cyan(`  ⏰ Work Patterns Analysis`));
      console.log(chalk.gray(`  ${'─'.repeat(50)}`));

      console.log(`\n  ${chalk.bold('Peak hour:')}           ${peakHourFormatted}`);
      console.log(`  ${chalk.bold('Peak day:')}            ${days[patterns.peakDay]}`);
      console.log(`  ${chalk.bold('Night owl %:')}         ${patterns.nightOwlPercentage.toFixed(1)}%`);
      console.log(`  ${chalk.bold('Weekend commits %:')}   ${patterns.weekendPercentage.toFixed(1)}%`);
      console.log(`  ${chalk.bold('Work-life balance:')}   ${patterns.workLifeBalance.toFixed(0)}/100`);

      // Hour distribution - grouped by time periods
      console.log(chalk.bold(`\n  Hourly Distribution:`));
      const hourRanges = [
        { label: 'Night   00-06', start: 0, end: 6, color: chalk.blue },
        { label: 'Morning 06-12', start: 6, end: 12, color: chalk.yellow },
        { label: 'Afternoon 12-18', start: 12, end: 18, color: chalk.green },
        { label: 'Evening 18-24', start: 18, end: 24, color: chalk.magenta },
      ];

      const totalCommits = patterns.hourlyDistribution.reduce((a, b) => a + b, 0);
      const maxRange = Math.max(...hourRanges.map(r =>
        patterns.hourlyDistribution.slice(r.start, r.end).reduce((a, b) => a + b, 0)
      ));

      for (const range of hourRanges) {
        const count = patterns.hourlyDistribution.slice(range.start, range.end).reduce((a, b) => a + b, 0);
        const pct = totalCommits > 0 ? (count / totalCommits * 100) : 0;
        const barWidth = maxRange > 0 ? Math.round((count / maxRange) * 25) : 0;
        const bar = '█'.repeat(barWidth);
        console.log(`    ${range.label.padEnd(16)} ${range.color(bar.padEnd(25))} ${count.toString().padStart(4)} (${pct.toFixed(0)}%)`);
      }

      if (patterns.crunchPeriods.length > 0) {
        console.log(chalk.bold.red(`\n  🔥 Crunch Periods Detected:`));
        patterns.crunchPeriods.slice(0, 5).forEach(period => {
          const severityColor = period.severity === 'high' ? chalk.red :
                               period.severity === 'medium' ? chalk.yellow : chalk.gray;
          console.log(`    ${severityColor('●')} ${period.startDate} to ${period.endDate} (${period.severity})`);
        });
      }

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Commits quality command
program
  .command('commits')
  .description('Analyze commit quality and patterns')
  .argument('[path]', 'Path to the repository', '.')
  .action(async (path: string) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing commit quality...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const quality = report.commitQuality;
      if (!quality) {
        console.log(chalk.yellow('No commit quality data available'));
        return;
      }

      console.log('');
      console.log(chalk.bold.cyan(`  📝 Commit Quality Analysis`));
      console.log(chalk.gray(`  ${'─'.repeat(50)}`));

      const qualityColor = quality.qualityScore >= 80 ? chalk.green :
                          quality.qualityScore >= 60 ? chalk.yellow : chalk.red;

      console.log(`\n  ${chalk.bold('Quality Score:')}        ${qualityColor(quality.qualityScore.toFixed(0) + '/100')}`);
      console.log(`  ${chalk.bold('Atomic Score:')}         ${quality.atomicCommitScore.toFixed(0)}/100`);
      console.log(`  ${chalk.bold('Avg message length:')}   ${quality.averageMessageLength.toFixed(0)} chars`);
      console.log(`  ${chalk.bold('Conventional commits:')} ${quality.conventionalPercentage.toFixed(1)}%`);
      console.log(`  ${chalk.bold('Fix/bugfix commits:')}   ${quality.fixPercentage.toFixed(1)}%`);

      // Commit types breakdown
      const types = Object.entries(quality.commitTypes).sort((a, b) => b[1] - a[1]);
      if (types.length > 0) {
        console.log(chalk.bold(`\n  Commit Types:`));
        types.slice(0, 8).forEach(([type, count]) => {
          const bar = '█'.repeat(Math.min(20, Math.round((count / types[0][1]) * 20)));
          console.log(`    ${type.padEnd(12)} ${chalk.cyan(bar)} ${count}`);
        });
      }

      if (quality.wipCommits.length > 0) {
        console.log(chalk.bold.yellow(`\n  ⚠️  WIP/Incomplete Commits: ${quality.wipCommits.length}`));
        quality.wipCommits.slice(0, 5).forEach(commit => {
          console.log(`    ${chalk.gray(commit.hash.slice(0, 7))} ${commit.message.slice(0, 50)}`);
        });
      }

      if (quality.largeCommits.length > 0) {
        console.log(chalk.bold.yellow(`\n  📦 Large Commits (${quality.largeCommits.length} total):`));
        quality.largeCommits.slice(0, 5).forEach(commit => {
          console.log(`    ${chalk.gray(commit.hash.slice(0, 7))} ${commit.filesChanged} files changed`);
        });
      }

      // Author breakdown by type
      if (quality.authorBreakdown && quality.authorBreakdown.length > 0) {
        console.log(chalk.bold(`\n  👥 Author Contribution Breakdown:`));
        quality.authorBreakdown.slice(0, 5).forEach(author => {
          console.log(`    ${author.author.padEnd(20)} ${chalk.cyan(author.totalCommits + ' commits')} (${chalk.yellow(author.primaryType)})`);
          const typeStr = Object.entries(author.types)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([t, c]) => `${t}:${c}`)
            .join(' ');
          console.log(`      ${chalk.gray(typeStr)}`);
        });
      }

      // Type evolution (last 6 months)
      if (quality.typeEvolution && quality.typeEvolution.length > 0) {
        console.log(chalk.bold(`\n  📈 Commit Type Evolution (recent months):`));
        quality.typeEvolution.slice(-6).forEach(entry => {
          const top3 = Object.entries(entry.types)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([t, c]) => `${t}:${c}`)
            .join(' ');
          console.log(`    ${entry.month} ${chalk.gray('|')} ${entry.totalCommits.toString().padStart(4)} commits ${chalk.gray('|')} ${top3}`);
        });
      }

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Collaboration command
program
  .command('collaboration')
  .description('Analyze team collaboration patterns')
  .argument('[path]', 'Path to the repository', '.')
  .option('-n, --top <n>', 'Show top N items', parseInt, 10)
  .action(async (path: string, options) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing collaboration...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const collab = report.collaboration;
      if (!collab) {
        console.log(chalk.yellow('No collaboration data available'));
        return;
      }

      console.log('');
      console.log(chalk.bold.cyan(`  🤝 Collaboration Analysis`));
      console.log(chalk.gray(`  ${'─'.repeat(50)}`));

      const scoreColor = collab.collaborationScore >= 70 ? chalk.green :
                        collab.collaborationScore >= 40 ? chalk.yellow : chalk.red;

      console.log(`\n  ${chalk.bold('Collaboration Score:')} ${scoreColor(collab.collaborationScore.toFixed(0) + '/100')}`);

      if (collab.collaborationPairs.length > 0) {
        console.log(chalk.bold(`\n  Top Collaboration Pairs:`));
        collab.collaborationPairs.slice(0, options.top).forEach(pair => {
          console.log(`    ${chalk.green('●')} ${pair.author1} ↔ ${pair.author2}`);
          console.log(`      ${chalk.gray(`${pair.sharedFiles} shared files`)}`);
        });
      }

      if (collab.sharedFiles.length > 0) {
        console.log(chalk.bold(`\n  Most Shared Files:`));
        collab.sharedFiles.slice(0, options.top).forEach(file => {
          const path = file.path.length > 40 ? '...' + file.path.slice(-37) : file.path;
          console.log(`    ${path.padEnd(42)} ${chalk.cyan(file.authorCount + ' authors')}`);
        });
      }

      if (collab.loneWolves.length > 0) {
        console.log(chalk.bold.yellow(`\n  🐺 Lone Wolves (low collaboration):`));
        collab.loneWolves.slice(0, 5).forEach(wolf => {
          console.log(`    ${wolf.name.padEnd(25)} ${chalk.yellow(wolf.soloPercentage.toFixed(1) + '% solo')}`);
        });
      }

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Coupling command
program
  .command('coupling')
  .description('Analyze file coupling and dependencies')
  .argument('[path]', 'Path to the repository', '.')
  .option('-n, --top <n>', 'Show top N items', parseInt, 10)
  .action(async (path: string, options) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing coupling...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const coupling = report.coupling;
      if (!coupling) {
        console.log(chalk.yellow('No coupling data available'));
        return;
      }

      console.log('');
      console.log(chalk.bold.magenta(`  🔗 Coupling Analysis`));
      console.log(chalk.gray(`  ${'─'.repeat(60)}`));

      console.log(`\n  ${chalk.bold('Coupling Score:')} ${coupling.couplingScore.toFixed(0)}/100`);

      if (coupling.temporalCoupling.length > 0) {
        console.log(chalk.bold(`\n  Temporal Coupling (files changed together):`));
        coupling.temporalCoupling.slice(0, options.top).forEach(pair => {
          const file1 = pair.file1.length > 30 ? '...' + pair.file1.slice(-27) : pair.file1;
          const file2 = pair.file2.length > 30 ? '...' + pair.file2.slice(-27) : pair.file2;
          const strength = Math.min(100, Math.round(pair.couplingStrength)); // Already in %, cap at 100
          const color = strength > 80 ? chalk.red : strength > 50 ? chalk.yellow : chalk.green;
          console.log(`    ${color('●')} ${file1}`);
          console.log(`      ↔ ${file2} ${color(`(${strength}%)`)}`);
        });
      }

      if (coupling.highImpactCommits.length > 0) {
        console.log(chalk.bold.yellow(`\n  ⚡ High Impact Commits:`));
        coupling.highImpactCommits.slice(0, 5).forEach(commit => {
          console.log(`    ${chalk.gray(commit.hash.slice(0, 7))} ${commit.filesChanged} files (impact: ${commit.impactScore.toFixed(0)})`);
        });
      }

      if (coupling.hiddenDependencies.length > 0) {
        console.log(chalk.bold.red(`\n  🕵️  Hidden Dependencies:`));
        coupling.hiddenDependencies.slice(0, options.top).forEach(dep => {
          const file1 = dep.file1.length > 35 ? '...' + dep.file1.slice(-32) : dep.file1;
          const file2 = dep.file2.length > 35 ? '...' + dep.file2.slice(-32) : dep.file2;
          console.log(`    ${chalk.red('●')} ${file1} ↔ ${file2}`);
          console.log(`      ${chalk.gray(dep.reason)}`);
        });
      }

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Health command
program
  .command('health')
  .description('Analyze repository health and code freshness')
  .argument('[path]', 'Path to the repository', '.')
  .action(async (path: string) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing health...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const health = report.health;
      if (!health) {
        console.log(chalk.yellow('No health data available'));
        return;
      }

      console.log('');
      console.log(chalk.bold.cyan(`  🏥 Repository Health`));
      console.log(chalk.gray(`  ${'─'.repeat(50)}`));

      const scoreColor = health.healthScore >= 80 ? chalk.green :
                        health.healthScore >= 60 ? chalk.yellow : chalk.red;
      const scoreEmoji = health.healthScore >= 80 ? '💚' :
                        health.healthScore >= 60 ? '💛' : '❤️';

      console.log(`\n  ${chalk.bold('Health Score:')} ${scoreColor(health.healthScore.toString())} ${scoreEmoji}`);

      // Health indicators
      console.log(chalk.bold(`\n  Health Indicators:`));
      health.indicators.forEach(indicator => {
        const statusEmoji = indicator.status === 'good' ? '✅' :
                           indicator.status === 'warning' ? '⚠️' : '❌';
        const statusColor = indicator.status === 'good' ? chalk.green :
                           indicator.status === 'warning' ? chalk.yellow : chalk.red;
        console.log(`    ${statusEmoji} ${indicator.name.padEnd(20)} ${statusColor(indicator.value.padStart(8))}`);
        console.log(`       ${chalk.gray(indicator.description)}`);
      });

      // Age distribution
      const total = Object.values(health.ageDistribution).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log(chalk.bold(`\n  File Age Distribution:`));
        const dist = health.ageDistribution;
        const labels = [
          { name: 'Fresh (<30d)', value: dist.fresh, color: chalk.green },
          { name: 'Recent (30-90d)', value: dist.recent, color: chalk.cyan },
          { name: 'Aging (90-180d)', value: dist.aging, color: chalk.yellow },
          { name: 'Old (180-365d)', value: dist.old, color: chalk.magenta },
          { name: 'Ancient (>365d)', value: dist.ancient, color: chalk.red },
        ];
        labels.forEach(({ name, value, color }) => {
          const pct = ((value / total) * 100).toFixed(1);
          const bar = '█'.repeat(Math.round((value / total) * 30));
          console.log(`    ${name.padEnd(18)} ${color(bar.padEnd(30))} ${value} (${pct}%)`);
        });
      }

      if (health.zombieFiles.length > 0) {
        // Get total count from indicator
        const zombieIndicator = health.indicators.find(i => i.name === 'Zombie Files');
        const totalZombies = zombieIndicator ? parseInt(zombieIndicator.value) : health.zombieFiles.length;

        console.log(chalk.bold.red(`\n  🧟 Zombie Files (single commit, 6+ months old):`));
        health.zombieFiles.slice(0, 5).forEach(file => {
          const path = file.path.length > 45 ? '...' + file.path.slice(-42) : file.path;
          console.log(`    ${chalk.red('●')} ${path} (${file.daysSinceModified} days)`);
        });
        if (totalZombies > 5) {
          console.log(chalk.gray(`    ... and ${totalZombies - 5} more`));
        }
      }

      if (health.abandonedDirs.length > 0) {
        console.log(chalk.bold.yellow(`\n  📂 Abandoned Directories:`));
        health.abandonedDirs.slice(0, 5).forEach(dir => {
          console.log(`    ${chalk.yellow('●')} ${dir.path} (${dir.daysSinceActivity} days, ${dir.fileCount} files)`);
        });
      }

      // Test metrics
      if (health.testMetrics) {
        const tm = health.testMetrics;
        console.log(chalk.bold(`\n  🧪 Test Metrics:`));
        console.log(`    Test files: ${chalk.cyan(tm.testFiles.toString())}`);
        console.log(`    Source files: ${tm.sourceFiles}`);
        console.log(`    Test/Code ratio: ${chalk.cyan((tm.testToCodeRatio * 100).toFixed(0) + '%')}`);
        console.log(`    Estimated coverage: ${chalk.cyan(tm.testCoverage)}`);
        console.log(`    Recent test activity: ${tm.recentTestActivity} files`);

        if (Object.keys(tm.testTypes).length > 0) {
          const typeStr = Object.entries(tm.testTypes)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          console.log(`    Test types: ${chalk.gray(typeStr)}`);
        }

        if (tm.modulesWithoutTests.length > 0) {
          console.log(chalk.bold.yellow(`\n  ⚠️  Modules Without Tests:`));
          tm.modulesWithoutTests.slice(0, 5).forEach(mod => {
            console.log(`    ${chalk.yellow('●')} ${mod.path} (${mod.sourceFiles} source files)`);
          });
        }
      }

      console.log('');
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Branches command
program
  .command('branches')
  .description('Analyze branch health and patterns')
  .argument('[path]', 'Path to the repository', '.')
  .action(async (path: string) => {
    showBanner();
    const repoPath = resolve(path);

    const isRepo = await isGitRepository(repoPath);
    if (!isRepo) {
      console.error(chalk.red(`Error: Not a git repository: ${repoPath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing branches...').start();

    try {
      const report = await analyzeRepository({ repoPath });
      spinner.stop();

      const branchStats = report.branchAnalysis;
      if (!branchStats) {
        console.log(chalk.yellow('No branch data available'));
        return;
      }

      console.log('');
      console.log(chalk.bold.cyan(`  🌿 Branch Analysis`));
      console.log(chalk.gray(`  ${'─'.repeat(50)}`));

      const scoreColor = branchStats.branchHealthScore >= 80 ? chalk.green :
                        branchStats.branchHealthScore >= 60 ? chalk.yellow : chalk.red;

      console.log(`\n  ${chalk.bold('Branch Health Score:')} ${scoreColor(branchStats.branchHealthScore.toString())}/100`);
      console.log(`  ${chalk.bold('Total branches:')}       ${branchStats.totalBranches}`);
      console.log(`  ${chalk.bold('Average branch age:')}   ${branchStats.averageBranchAge} days`);

      if (branchStats.oldestBranch) {
        console.log(`  ${chalk.bold('Oldest branch:')}        ${branchStats.oldestBranch.name} (${branchStats.oldestBranch.age} days)`);
      }
      if (branchStats.newestBranch) {
        console.log(`  ${chalk.bold('Newest branch:')}        ${branchStats.newestBranch.name} (${branchStats.newestBranch.age} days)`);
      }

      // Naming patterns
      if (branchStats.namingPatterns.length > 0) {
        console.log(chalk.bold(`\n  Naming Patterns:`));
        branchStats.namingPatterns.forEach(pattern => {
          console.log(`    ${pattern.pattern.padEnd(15)} ${chalk.cyan(pattern.count.toString())} - ${chalk.gray(pattern.description)}`);
        });
      }

      // Stale branches
      if (branchStats.staleBranches.length > 0) {
        console.log(chalk.bold.yellow(`\n  ⚠️  Stale Branches (${branchStats.staleBranches.length} total):`));
        branchStats.staleBranches.slice(0, 10).forEach(branch => {
          const name = branch.name.length > 35 ? '...' + branch.name.slice(-32) : branch.name;
          console.log(`    ${chalk.yellow('●')} ${name.padEnd(38)} ${chalk.gray(branch.daysSinceCommit + ' days')}`);
          console.log(`      ${chalk.gray(branch.recommendation)}`);
        });
      }

      // Orphan branches
      if (branchStats.orphanBranches.length > 0) {
        console.log(chalk.bold.red(`\n  👻 Orphan Branches (${branchStats.orphanBranches.length} total):`));
        branchStats.orphanBranches.slice(0, 5).forEach(branch => {
          const name = branch.name.length > 35 ? '...' + branch.name.slice(-32) : branch.name;
          console.log(`    ${chalk.red('●')} ${name}`);
          console.log(`      ${chalk.gray(branch.reason)}`);
        });
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
