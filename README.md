# GitStats

```
   _____ _ _   _____ _        _
  / ____(_) | / ____| |      | |
 | |  __ _| |_| (___ | |_ __ _| |_ ___
 | | |_ | | __|\___ \| __/ _` | __/ __|
 | |__| | | |_ ____) | || (_| | |_\__ \
  \_____|_|\__|_____/ \__\__,_|\__|___/
```

Powerful Git repository analyzer that provides comprehensive statistics, insights, and visualizations about your codebase.

## Features

### Core Analytics
- **Commit Analytics** - Total commits, lines added/deleted, activity over time
- **Contributor Stats** - Ranking by commits, additions, deletions, and file changes
- **Code Hotspots** - Identify files with high churn (potential technical debt)
- **Bus Factor Analysis** - Detect knowledge silos and single points of failure
- **Timeline Analysis** - Activity by day, week, month, year, hour of day

### Advanced Analytics
- **Velocity Analysis** - Commits per day/week/month, trends, consistency score
- **Codebase Evolution** - LOC growth over time, largest expansions/refactors
- **Complexity Analysis** - God files, growing files, technical debt scoring
- **Critical Hotspots** - Files with high churn AND high changes (risk scoring)
- **Work Patterns** - Peak hours, night owl %, work-life balance score
- **Commit Quality** - Conventional commits %, WIP commits, large commits
- **Collaboration** - Pair programming detection, shared files, lone wolves
- **Coupling Analysis** - Files that change together (temporal coupling)
- **Health Analysis** - Zombie files, legacy code, test metrics
- **Branch Analysis** - Stale branches, orphans, workflow detection

### Output Formats
- **CLI** - Colored terminal output with charts
- **JSON** - Machine-readable export
- **HTML** - Interactive dashboard with Chart.js visualizations

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
# Using Node.js directly
node --experimental-strip-types src/cli/index.ts <command> [path] [options]

# Or create an alias
alias gitstats='node --experimental-strip-types /path/to/gitstats/src/cli/index.ts'
```

## Commands

### summary
Quick overview of a repository.

```bash
gitstats summary /path/to/repo
```

### analyze
Full analysis with all metrics.

```bash
gitstats analyze /path/to/repo

# Export to HTML dashboard
gitstats analyze /path/to/repo -o html -f report.html

# Export to JSON
gitstats analyze /path/to/repo -o json -f report.json
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

### authors
List contributors with their statistics.

```bash
gitstats authors /path/to/repo --top 10
```

### hotspots
Show files with highest churn and risk areas.

```bash
gitstats hotspots /path/to/repo --top 15
```

Includes:
- File hotspots (churn score)
- Directory hotspots (aggregated risk)
- Risk map (combined frequency + complexity + ownership)

### busfactor
Analyze knowledge distribution and identify risky areas.

```bash
gitstats busfactor /path/to/repo
```

### velocity
Analyze development velocity and trends.

```bash
gitstats velocity /path/to/repo
```

Shows:
- Commits per day/week/month
- Trend (accelerating/stable/decelerating)
- Consistency score
- Release rhythm (from tags)
- Codebase evolution (LOC growth over time)
- Sprint cycle detection

### complexity
Analyze code complexity and technical debt.

```bash
gitstats complexity /path/to/repo
```

Shows:
- Technical debt score (0-100)
- God files (too many changes/authors)
- Growing files (rapid expansion)
- Refactoring candidates
- Critical hotspots (high churn + high changes)
- Debt indicators

### commits
Analyze commit patterns and quality.

```bash
gitstats commits /path/to/repo
```

Shows:
- Commit type distribution (feat, fix, docs, etc.)
- Conventional commits percentage
- WIP commits
- Large commits (>500 LOC)
- Author breakdown by commit type
- Type evolution over time

### workpatterns
Analyze work patterns and team habits.

```bash
gitstats workpatterns /path/to/repo
```

Shows:
- Peak hour and day
- Night owl percentage
- Weekend commits
- Work-life balance score
- Timezone distribution
- Author work styles

### health
Analyze repository health and code freshness.

```bash
gitstats health /path/to/repo
```

Shows:
- Health score (0-100)
- Zombie files (single commit, old)
- Legacy files (not touched in months)
- Abandoned directories
- Test metrics (test/code ratio)

### collaboration
Analyze team collaboration patterns.

```bash
gitstats collaboration /path/to/repo
```

Shows:
- Collaboration score
- Collaboration pairs (who works together)
- Shared files
- Lone wolves (isolated contributors)
- Knowledge silos

### coupling
Analyze file coupling (files that change together).

```bash
gitstats coupling /path/to/repo
```

Shows:
- Coupled file pairs
- Coupling strength
- Potential refactoring opportunities

### branches
Analyze branch health and patterns.

```bash
gitstats branches /path/to/repo
```

Shows:
- Branch health score
- Stale branches
- Orphan branches (not merged)
- Naming patterns (GitFlow detection)
- Branch lifecycle metrics
- Workflow type detection

## Understanding the Metrics

### Churn Score
Measures how frequently a file is modified. High churn indicates:
- Potential technical debt
- Unstable or poorly designed code
- Files that may need refactoring

Formula: `commits × log(lines_changed)`

### Technical Debt Score
0-100 score based on:
- God files percentage
- Growing files percentage
- Refactoring candidates
- High churn files

### Critical Hotspots
Files with BOTH high churn AND high changes - the most dangerous areas:
- Risk score (0-100)
- Risk level (critical/high/medium)
- Risk factors (churn, changes, author concentration)

### Bus Factor
The minimum number of contributors who would need to leave before significant knowledge is lost.

- **Bus Factor 1** - Critical risk: only one person knows this code
- **Bus Factor 2-3** - Medium risk: limited knowledge sharing
- **Bus Factor 4+** - Healthy: knowledge is well distributed

### Codebase Evolution
Monthly tracking of:
- Lines added/deleted
- Net LOC change
- Files added/deleted
- Cumulative growth

### Branch Lifecycle
- **Workflow type**: gitflow, trunk-based, feature-branch, mixed
- **Merge rate**: percentage of branches that get merged
- **Average lifespan**: how long branches live

## HTML Dashboard

The HTML output generates an interactive dashboard with:
- Summary statistics cards
- Contributor charts
- Activity heatmaps (day/hour)
- Monthly commit trends
- Velocity metrics with codebase evolution table
- Health score with test metrics
- Technical debt indicators
- Branch lifecycle details
- Critical hotspots table
- Code hotspots and risk map
- Type evolution chart
- Full contributor list

```bash
gitstats analyze /path/to/repo -o html -f dashboard.html
open dashboard.html
```

## Project Structure

```
gitstats/
├── src/
│   ├── cli/
│   │   └── index.ts              # CLI entry point
│   ├── core/
│   │   └── analyzer.ts           # Main orchestrator
│   ├── parsers/
│   │   └── git-parser.ts         # Git log parsing
│   ├── analyzers/
│   │   ├── author-analyzer.ts    # Contributor stats
│   │   ├── timeline-analyzer.ts  # Time-based analysis
│   │   ├── hotspot-analyzer.ts   # Churn & risk analysis
│   │   ├── busfactor-analyzer.ts # Knowledge distribution
│   │   ├── velocity-analyzer.ts  # Speed & trends
│   │   ├── complexity-analyzer.ts # Debt & complexity
│   │   ├── commits-analyzer.ts   # Commit quality
│   │   ├── workpatterns-analyzer.ts # Work habits
│   │   ├── health-analyzer.ts    # Repo health
│   │   ├── collaboration-analyzer.ts # Team patterns
│   │   ├── coupling-analyzer.ts  # File coupling
│   │   └── branches-analyzer.ts  # Branch health
│   ├── outputs/
│   │   ├── cli-renderer.ts       # Terminal output
│   │   ├── html-renderer.ts      # HTML dashboard
│   │   └── json-renderer.ts      # JSON export
│   ├── types/
│   │   └── index.ts              # TypeScript definitions
│   └── utils/
│       ├── exec.ts               # Git command execution
│       └── date.ts               # Date utilities
├── package.json
└── tsconfig.json
```

## License

MIT
