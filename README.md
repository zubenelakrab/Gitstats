# GitStats

Powerful Git repository analyzer that provides comprehensive statistics, insights, and visualizations about your codebase.

## Features

- **Commit Analytics** - Total commits, lines added/deleted, activity over time
- **Contributor Stats** - Ranking by commits, additions, deletions, and file changes
- **Code Hotspots** - Identify files with high churn (potential technical debt)
- **Bus Factor Analysis** - Detect knowledge silos and single points of failure
- **Timeline Analysis** - Activity by day, week, month, year, hour of day
- **Multiple Output Formats** - CLI, JSON, HTML dashboard

## Requirements

- Node.js 22.0.0 or higher
- Git installed and accessible in PATH

## Installation

```bash
git clone https://github.com/yourusername/gitstats.git
cd gitstats
npm install
```

## Usage

```bash
gitstats <command> [path] [options]

# Or directly with Node.js
node --experimental-strip-types src/cli/index.ts <command> [path] [options]
```

### Commands

#### summary
Quick overview of a repository.

```bash
gitstats summary /path/to/repo
```

Output:
```
  my-project
  ────────────────────────────────────────
  Commits:      1,806
  Authors:      9
  Lines added:  +199,583
  Lines deleted: -62,662
  Bus factor:   1
  Age:          195 days
```

#### analyze
Full analysis with detailed statistics.

```bash
gitstats analyze /path/to/repo
```

Options:
- `-o, --output <format>` - Output format: `cli`, `json`, `html` (default: `cli`)
- `-f, --file <path>` - Save output to file
- `-b, --branch <branch>` - Analyze specific branch
- `--since <date>` - Only commits after this date (ISO format)
- `--until <date>` - Only commits before this date (ISO format)
- `--author <author>` - Filter by author (can be used multiple times)
- `--exclude <path>` - Exclude paths (glob pattern)
- `--include <path>` - Include only these paths
- `--no-merges` - Exclude merge commits
- `--max-commits <n>` - Maximum number of commits to analyze
- `--theme <theme>` - Theme for HTML output: `light`, `dark`

Examples:

```bash
# Export to HTML dashboard
gitstats analyze /path/to/repo --output html --file report.html

# Export to JSON
gitstats analyze /path/to/repo --output json --file report.json

# Analyze last 6 months
gitstats analyze /path/to/repo --since 2024-06-01

# Exclude node_modules and vendor
gitstats analyze /path/to/repo --exclude node_modules --exclude vendor
```

#### authors
List contributors with their statistics.

```bash
gitstats authors /path/to/repo --top 10
```

Options:
- `-n, --top <n>` - Show top N authors (default: 10)
- `--sort <field>` - Sort by: `commits`, `additions`, `deletions` (default: `commits`)

#### hotspots
Show files with highest churn (most frequently modified).

```bash
gitstats hotspots /path/to/repo --top 15
```

Options:
- `-n, --top <n>` - Show top N hotspots (default: 15)

#### busfactor
Analyze knowledge distribution and identify risky areas.

```bash
gitstats busfactor /path/to/repo
```

## Understanding the Metrics

### Churn Score
Measures how frequently a file is modified. High churn indicates:
- Potential technical debt
- Unstable or poorly designed code
- Files that may need refactoring

Formula: `commits × log(lines_changed)`

### Code Hotspots
Files with the highest churn scores. These are the "hot" areas of your codebase that receive constant attention and may benefit from architectural improvements.

### Bus Factor
The minimum number of contributors who would need to leave before significant knowledge is lost.

- **Bus Factor 1** - Critical risk: only one person knows this code
- **Bus Factor 2-3** - Medium risk: limited knowledge sharing
- **Bus Factor 4+** - Healthy: knowledge is well distributed

## HTML Dashboard

The HTML output generates an interactive dashboard with:
- Summary statistics cards
- Contributor bar chart
- Activity by day of week
- Activity by hour
- Monthly commit trends
- Code hotspots table
- Bus factor risk areas
- Full contributor list with progress bars

```bash
gitstats analyze /path/to/repo -o html -f dashboard.html
open dashboard.html
```

## Programmatic Usage

You can also use GitStats as a library:

```typescript
import { analyzeRepository } from 'gitstats';

const report = await analyzeRepository({
  repoPath: '/path/to/repo',
  since: new Date('2024-01-01'),
  excludeMerges: true,
});

console.log(report.summary.totalCommits);
console.log(report.authors);
console.log(report.hotspots.files);
```

## Project Structure

```
gitstats/
├── src/
│   ├── cli/
│   │   └── index.ts          # CLI entry point
│   ├── core/
│   │   └── analyzer.ts       # Main orchestrator
│   ├── parsers/
│   │   └── git-parser.ts     # Git log parsing
│   ├── analyzers/
│   │   ├── author-analyzer.ts
│   │   ├── timeline-analyzer.ts
│   │   ├── hotspot-analyzer.ts
│   │   └── busfactor-analyzer.ts
│   ├── outputs/
│   │   ├── cli-renderer.ts   # Terminal output
│   │   ├── html-renderer.ts  # HTML dashboard
│   │   └── json-renderer.ts  # JSON export
│   ├── types/
│   │   └── index.ts          # TypeScript definitions
│   └── utils/
│       ├── exec.ts           # Git command execution
│       └── date.ts           # Date utilities
├── package.json
└── tsconfig.json
```

## License

MIT
