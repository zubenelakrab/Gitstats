import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';
import { readdir, readFile } from 'node:fs/promises';
import { join, extname, dirname, relative } from 'node:path';

export interface DependencyStats {
  // Summary
  summary: DependencySummary;

  // Full dependency graph
  graph: DependencyNode[];

  // Analysis results
  circularDependencies: CircularDependency[];
  hubFiles: HubFile[];
  orphanModules: OrphanModule[];
  layerViolations: LayerViolation[];
  clusters: DependencyCluster[];

  // Metrics
  metrics: DependencyMetrics;

  // Recommendations
  recommendations: DependencyRecommendation[];
}

export interface DependencySummary {
  totalFiles: number;
  totalDependencies: number;
  avgDependenciesPerFile: number;
  maxDependencies: number;
  circularCount: number;
  hubCount: number;
  orphanCount: number;
  healthScore: number; // 0-100
}

export interface DependencyNode {
  path: string;
  imports: string[];
  importedBy: string[];
  fanIn: number; // How many files import this
  fanOut: number; // How many files this imports
  instability: number; // fanOut / (fanIn + fanOut) - 0=stable, 1=unstable
  isHub: boolean;
  isOrphan: boolean;
  depth: number; // Distance from entry points
  cluster?: string;
}

export interface CircularDependency {
  cycle: string[];
  length: number;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

export interface HubFile {
  path: string;
  fanIn: number;
  fanOut: number;
  totalConnections: number;
  type: 'hub-in' | 'hub-out' | 'hub-both';
  risk: string;
  suggestion: string;
}

export interface OrphanModule {
  path: string;
  reason: string;
  lastModified?: Date;
  suggestion: string;
}

export interface LayerViolation {
  from: string;
  to: string;
  fromLayer: string;
  toLayer: string;
  violation: string;
  suggestion: string;
}

export interface DependencyCluster {
  name: string;
  files: string[];
  internalDependencies: number;
  externalDependencies: number;
  cohesion: number; // 0-1, higher = more cohesive
  coupling: number; // 0-1, lower = less coupled
}

export interface DependencyMetrics {
  totalEdges: number;
  avgFanIn: number;
  avgFanOut: number;
  maxFanIn: { file: string; value: number };
  maxFanOut: { file: string; value: number };
  avgInstability: number;
  avgDepth: number;
  maxDepth: number;
}

export interface DependencyRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  files: string[];
  impact: string;
  action: string;
}

// Common architectural layers (can be customized)
const LAYER_PATTERNS: { name: string; patterns: RegExp[] }[] = [
  { name: 'ui', patterns: [/components?\//, /views?\//, /pages?\//] },
  { name: 'application', patterns: [/services?\//, /use-?cases?\//, /application\//] },
  { name: 'domain', patterns: [/domain\//, /models?\//, /entities?\//] },
  { name: 'infrastructure', patterns: [/infra(structure)?\//, /repositories?\//, /adapters?\//] },
  { name: 'utils', patterns: [/utils?\//, /helpers?\//, /lib\//] },
];

// Allowed layer dependencies (from -> to)
const ALLOWED_LAYER_DEPS: Record<string, string[]> = {
  'ui': ['ui', 'application', 'domain', 'utils'],
  'application': ['application', 'domain', 'infrastructure', 'utils'],
  'domain': ['domain', 'utils'],
  'infrastructure': ['infrastructure', 'domain', 'utils'],
  'utils': ['utils'],
};

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];

export class DependencyAnalyzer implements Analyzer<DependencyStats> {
  name = 'dependency-analyzer';
  description = 'Analyzes file dependencies and detects architectural issues';

  async analyze(commits: Commit[], config: AnalysisConfig): Promise<DependencyStats> {
    const repoPath = config.repoPath;

    // Get current files
    const currentFiles = await this.getCurrentFiles(repoPath);

    if (currentFiles.size === 0) {
      return this.emptyStats();
    }

    // Build dependency graph
    const graph = await this.buildDependencyGraph(repoPath, currentFiles);

    // Find entry points (files with no importers that look like entry points)
    const entryPoints = this.findEntryPoints(graph);

    // Calculate depths from entry points
    this.calculateDepths(graph, entryPoints);

    // Detect circular dependencies
    const circularDependencies = this.detectCircularDependencies(graph);

    // Find hub files
    const hubFiles = this.findHubFiles(graph);

    // Find orphan modules
    const orphanModules = this.findOrphanModules(graph);

    // Detect layer violations
    const layerViolations = this.detectLayerViolations(graph);

    // Identify clusters
    const clusters = this.identifyClusters(graph);

    // Calculate metrics
    const metrics = this.calculateMetrics(graph);

    // Generate summary
    const summary = this.generateSummary(graph, circularDependencies, hubFiles, orphanModules);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      circularDependencies,
      hubFiles,
      orphanModules,
      layerViolations
    );

    return {
      summary,
      graph: Array.from(graph.values()),
      circularDependencies,
      hubFiles,
      orphanModules,
      layerViolations,
      clusters,
      metrics,
      recommendations,
    };
  }

  private async getCurrentFiles(repoPath: string): Promise<Set<string>> {
    const files = new Set<string>();

    const walk = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = relative(repoPath, fullPath);

          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', 'vendor'].includes(entry.name)) {
              continue;
            }
            await walk(fullPath);
          } else {
            const ext = extname(entry.name);
            if (CODE_EXTENSIONS.includes(ext)) {
              files.add(relativePath);
            }
          }
        }
      } catch {
        // Directory unreadable
      }
    };

    await walk(repoPath);
    return files;
  }

  private async buildDependencyGraph(
    repoPath: string,
    files: Set<string>
  ): Promise<Map<string, DependencyNode>> {
    const graph = new Map<string, DependencyNode>();

    // Initialize nodes
    for (const file of files) {
      graph.set(file, {
        path: file,
        imports: [],
        importedBy: [],
        fanIn: 0,
        fanOut: 0,
        instability: 0,
        isHub: false,
        isOrphan: false,
        depth: -1,
      });
    }

    // Parse imports
    for (const file of files) {
      try {
        const content = await readFile(join(repoPath, file), 'utf-8');
        const imports = this.extractImports(content, file, files);
        const node = graph.get(file)!;
        node.imports = imports;
        node.fanOut = imports.length;

        // Update importedBy for each import
        for (const imp of imports) {
          const importedNode = graph.get(imp);
          if (importedNode) {
            importedNode.importedBy.push(file);
            importedNode.fanIn++;
          }
        }
      } catch {
        // File unreadable
      }
    }

    // Calculate instability
    for (const node of graph.values()) {
      const total = node.fanIn + node.fanOut;
      node.instability = total > 0 ? node.fanOut / total : 0;
    }

    return graph;
  }

  private extractImports(content: string, currentFile: string, allFiles: Set<string>): string[] {
    const imports: string[] = [];
    const currentDir = dirname(currentFile);

    const importPatterns = [
      /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /export\s+(?:[\w\s{},*]+\s+from\s+)['"]([^'"]+)['"]/g,
    ];

    const seenImports = new Set<string>();

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];

        // Skip external modules
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          continue;
        }

        // Resolve relative path
        let resolvedPath = importPath;
        if (importPath.startsWith('.')) {
          resolvedPath = join(currentDir, importPath).replace(/\\/g, '/');
        }

        // Try to match with actual files
        const resolved = this.resolveImport(resolvedPath, allFiles);
        if (resolved && !seenImports.has(resolved)) {
          seenImports.add(resolved);
          imports.push(resolved);
        }
      }
    }

    return imports;
  }

  private resolveImport(importPath: string, allFiles: Set<string>): string | null {
    // Remove extension if present
    const withoutExt = importPath.replace(/\.[jt]sx?$/, '');

    // Try various possibilities
    const possibilities = [
      importPath,
      withoutExt + '.ts',
      withoutExt + '.tsx',
      withoutExt + '.js',
      withoutExt + '.jsx',
      withoutExt + '/index.ts',
      withoutExt + '/index.tsx',
      withoutExt + '/index.js',
      withoutExt + '/index.jsx',
    ];

    for (const possibility of possibilities) {
      if (allFiles.has(possibility)) {
        return possibility;
      }
    }

    return null;
  }

  private findEntryPoints(graph: Map<string, DependencyNode>): string[] {
    const entryPoints: string[] = [];

    for (const [file, node] of graph.entries()) {
      // Entry points: no importers, or matches common entry patterns
      if (node.fanIn === 0 || this.isLikelyEntryPoint(file)) {
        entryPoints.push(file);
      }
    }

    return entryPoints;
  }

  private isLikelyEntryPoint(file: string): boolean {
    const patterns = [
      /^index\.[jt]sx?$/,
      /^main\.[jt]sx?$/,
      /^app\.[jt]sx?$/,
      /^server\.[jt]sx?$/,
      /\/index\.[jt]sx?$/,
      /^src\/index\.[jt]sx?$/,
      /^src\/main\.[jt]sx?$/,
      /pages\/.*\.[jt]sx?$/,
      /routes\/.*\.[jt]sx?$/,
    ];

    return patterns.some(p => p.test(file));
  }

  private calculateDepths(graph: Map<string, DependencyNode>, entryPoints: string[]): void {
    const visited = new Set<string>();
    const queue: { file: string; depth: number }[] = [];

    // Start from entry points
    for (const entry of entryPoints) {
      queue.push({ file: entry, depth: 0 });
    }

    while (queue.length > 0) {
      const { file, depth } = queue.shift()!;

      if (visited.has(file)) continue;
      visited.add(file);

      const node = graph.get(file);
      if (!node) continue;

      node.depth = depth;

      // Add imports to queue
      for (const imp of node.imports) {
        if (!visited.has(imp)) {
          queue.push({ file: imp, depth: depth + 1 });
        }
      }
    }

    // Mark orphans (unreachable from entry points)
    for (const node of graph.values()) {
      if (node.depth === -1) {
        node.isOrphan = true;
        node.depth = 999;
      }
    }
  }

  private detectCircularDependencies(graph: Map<string, DependencyNode>): CircularDependency[] {
    const cycles: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (file: string): void => {
      visited.add(file);
      recursionStack.add(file);
      path.push(file);

      const node = graph.get(file);
      if (node) {
        for (const imp of node.imports) {
          if (!visited.has(imp)) {
            dfs(imp);
          } else if (recursionStack.has(imp)) {
            // Found a cycle
            const cycleStart = path.indexOf(imp);
            const cycle = path.slice(cycleStart);
            cycle.push(imp); // Complete the cycle

            // Check if we already have this cycle
            const cycleKey = [...cycle].sort().join('->');
            const exists = cycles.some(c => [...c.cycle].sort().join('->') === cycleKey);

            if (!exists) {
              cycles.push({
                cycle,
                length: cycle.length - 1,
                severity: cycle.length <= 2 ? 'low' : cycle.length <= 4 ? 'medium' : 'high',
                suggestion: this.getCycleSuggestion(cycle),
              });
            }
          }
        }
      }

      path.pop();
      recursionStack.delete(file);
    };

    for (const file of graph.keys()) {
      if (!visited.has(file)) {
        dfs(file);
      }
    }

    return cycles.sort((a, b) => b.length - a.length);
  }

  private getCycleSuggestion(cycle: string[]): string {
    if (cycle.length <= 2) {
      return 'Consider extracting shared logic to a separate module';
    } else if (cycle.length <= 4) {
      return 'Review dependencies and consider introducing an interface/abstraction';
    } else {
      return 'Major architectural issue - consider refactoring to break this cycle';
    }
  }

  private findHubFiles(graph: Map<string, DependencyNode>): HubFile[] {
    const hubs: HubFile[] = [];
    const nodes = Array.from(graph.values());

    // Calculate thresholds
    const avgFanIn = nodes.reduce((sum, n) => sum + n.fanIn, 0) / nodes.length;
    const avgFanOut = nodes.reduce((sum, n) => sum + n.fanOut, 0) / nodes.length;
    const hubThresholdIn = Math.max(5, avgFanIn * 2);
    const hubThresholdOut = Math.max(5, avgFanOut * 2);

    for (const node of nodes) {
      const isHubIn = node.fanIn >= hubThresholdIn;
      const isHubOut = node.fanOut >= hubThresholdOut;

      if (isHubIn || isHubOut) {
        node.isHub = true;

        let type: HubFile['type'];
        let risk: string;
        let suggestion: string;

        if (isHubIn && isHubOut) {
          type = 'hub-both';
          risk = 'Very high - central point of failure with many dependencies';
          suggestion = 'Consider breaking into smaller, focused modules';
        } else if (isHubIn) {
          type = 'hub-in';
          risk = 'Medium - many files depend on this, changes are risky';
          suggestion = 'Keep stable, ensure good test coverage';
        } else {
          type = 'hub-out';
          risk = 'Medium - knows too much about the system';
          suggestion = 'Consider dependency injection or splitting responsibilities';
        }

        hubs.push({
          path: node.path,
          fanIn: node.fanIn,
          fanOut: node.fanOut,
          totalConnections: node.fanIn + node.fanOut,
          type,
          risk,
          suggestion,
        });
      }
    }

    return hubs.sort((a, b) => b.totalConnections - a.totalConnections);
  }

  private findOrphanModules(graph: Map<string, DependencyNode>): OrphanModule[] {
    const orphans: OrphanModule[] = [];

    for (const node of graph.values()) {
      // Skip test files
      if (/\.(test|spec)\.[jt]sx?$/.test(node.path)) continue;

      // Orphan: not imported by anyone and not an entry point
      if (node.fanIn === 0 && !this.isLikelyEntryPoint(node.path)) {
        orphans.push({
          path: node.path,
          reason: 'Not imported by any other file',
          suggestion: 'Verify if this is an entry point, otherwise consider removing',
        });
      }
    }

    return orphans;
  }

  private detectLayerViolations(graph: Map<string, DependencyNode>): LayerViolation[] {
    const violations: LayerViolation[] = [];

    for (const node of graph.values()) {
      const fromLayer = this.getLayer(node.path);
      if (!fromLayer) continue;

      for (const imp of node.imports) {
        const toLayer = this.getLayer(imp);
        if (!toLayer) continue;

        const allowed = ALLOWED_LAYER_DEPS[fromLayer] || [];
        if (!allowed.includes(toLayer)) {
          violations.push({
            from: node.path,
            to: imp,
            fromLayer,
            toLayer,
            violation: `${fromLayer} should not depend on ${toLayer}`,
            suggestion: `Move the dependency or restructure the code`,
          });
        }
      }
    }

    return violations;
  }

  private getLayer(file: string): string | null {
    for (const { name, patterns } of LAYER_PATTERNS) {
      if (patterns.some(p => p.test(file))) {
        return name;
      }
    }
    return null;
  }

  private identifyClusters(graph: Map<string, DependencyNode>): DependencyCluster[] {
    const clusters = new Map<string, Set<string>>();

    // Group by top-level directory
    for (const node of graph.values()) {
      const parts = node.path.split('/');
      const clusterName = parts.length > 1 ? parts[0] : 'root';

      if (!clusters.has(clusterName)) {
        clusters.set(clusterName, new Set());
      }
      clusters.get(clusterName)!.add(node.path);
    }

    const result: DependencyCluster[] = [];

    for (const [name, files] of clusters.entries()) {
      let internalDeps = 0;
      let externalDeps = 0;

      for (const file of files) {
        const node = graph.get(file);
        if (!node) continue;

        for (const imp of node.imports) {
          if (files.has(imp)) {
            internalDeps++;
          } else {
            externalDeps++;
          }
        }
      }

      const totalDeps = internalDeps + externalDeps;
      const cohesion = totalDeps > 0 ? internalDeps / totalDeps : 1;
      const coupling = totalDeps > 0 ? externalDeps / totalDeps : 0;

      // Assign cluster to nodes
      for (const file of files) {
        const node = graph.get(file);
        if (node) node.cluster = name;
      }

      result.push({
        name,
        files: Array.from(files),
        internalDependencies: internalDeps,
        externalDependencies: externalDeps,
        cohesion,
        coupling,
      });
    }

    return result.sort((a, b) => b.files.length - a.files.length);
  }

  private calculateMetrics(graph: Map<string, DependencyNode>): DependencyMetrics {
    const nodes = Array.from(graph.values());

    let totalEdges = 0;
    let totalFanIn = 0;
    let totalFanOut = 0;
    let totalInstability = 0;
    let totalDepth = 0;
    let maxFanIn = { file: '', value: 0 };
    let maxFanOut = { file: '', value: 0 };
    let maxDepth = 0;

    for (const node of nodes) {
      totalEdges += node.fanOut;
      totalFanIn += node.fanIn;
      totalFanOut += node.fanOut;
      totalInstability += node.instability;
      totalDepth += node.depth === 999 ? 0 : node.depth;

      if (node.fanIn > maxFanIn.value) {
        maxFanIn = { file: node.path, value: node.fanIn };
      }
      if (node.fanOut > maxFanOut.value) {
        maxFanOut = { file: node.path, value: node.fanOut };
      }
      if (node.depth !== 999 && node.depth > maxDepth) {
        maxDepth = node.depth;
      }
    }

    const count = nodes.length || 1;

    return {
      totalEdges,
      avgFanIn: totalFanIn / count,
      avgFanOut: totalFanOut / count,
      maxFanIn,
      maxFanOut,
      avgInstability: totalInstability / count,
      avgDepth: totalDepth / count,
      maxDepth,
    };
  }

  private generateSummary(
    graph: Map<string, DependencyNode>,
    circularDeps: CircularDependency[],
    hubs: HubFile[],
    orphans: OrphanModule[]
  ): DependencySummary {
    const nodes = Array.from(graph.values());
    const totalDeps = nodes.reduce((sum, n) => sum + n.fanOut, 0);
    const maxDeps = Math.max(...nodes.map(n => n.fanOut));

    // Calculate health score
    let healthScore = 100;
    healthScore -= circularDeps.length * 10; // -10 per circular dep
    healthScore -= hubs.filter(h => h.type === 'hub-both').length * 5; // -5 per major hub
    healthScore -= Math.min(20, orphans.length * 2); // Up to -20 for orphans

    return {
      totalFiles: nodes.length,
      totalDependencies: totalDeps,
      avgDependenciesPerFile: totalDeps / (nodes.length || 1),
      maxDependencies: maxDeps,
      circularCount: circularDeps.length,
      hubCount: hubs.length,
      orphanCount: orphans.length,
      healthScore: Math.max(0, Math.round(healthScore)),
    };
  }

  private generateRecommendations(
    circularDeps: CircularDependency[],
    hubs: HubFile[],
    orphans: OrphanModule[],
    layerViolations: LayerViolation[]
  ): DependencyRecommendation[] {
    const recommendations: DependencyRecommendation[] = [];

    // Circular dependencies
    if (circularDeps.length > 0) {
      const highSeverity = circularDeps.filter(c => c.severity === 'high');
      if (highSeverity.length > 0) {
        recommendations.push({
          priority: 'critical',
          category: 'Circular Dependencies',
          description: `${highSeverity.length} complex circular dependencies detected`,
          files: highSeverity.flatMap(c => c.cycle),
          impact: 'Can cause runtime issues, testing difficulties, and maintenance headaches',
          action: 'Break cycles by extracting shared logic or using dependency injection',
        });
      }
    }

    // Hub files
    const majorHubs = hubs.filter(h => h.type === 'hub-both');
    if (majorHubs.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Hub Files',
        description: `${majorHubs.length} files are both heavily imported and import many others`,
        files: majorHubs.map(h => h.path),
        impact: 'Single points of failure, hard to modify without side effects',
        action: 'Split responsibilities into focused modules',
      });
    }

    // Layer violations
    if (layerViolations.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'Architecture',
        description: `${layerViolations.length} layer dependency violations detected`,
        files: [...new Set(layerViolations.map(v => v.from))],
        impact: 'Breaks architectural boundaries, can lead to spaghetti code',
        action: 'Restructure imports to follow architectural layers',
      });
    }

    // Orphan modules
    if (orphans.length > 5) {
      recommendations.push({
        priority: 'low',
        category: 'Dead Code',
        description: `${orphans.length} potentially unused modules detected`,
        files: orphans.slice(0, 10).map(o => o.path),
        impact: 'Increases bundle size and maintenance burden',
        action: 'Verify if entry points, otherwise remove',
      });
    }

    return recommendations;
  }

  private emptyStats(): DependencyStats {
    return {
      summary: {
        totalFiles: 0,
        totalDependencies: 0,
        avgDependenciesPerFile: 0,
        maxDependencies: 0,
        circularCount: 0,
        hubCount: 0,
        orphanCount: 0,
        healthScore: 100,
      },
      graph: [],
      circularDependencies: [],
      hubFiles: [],
      orphanModules: [],
      layerViolations: [],
      clusters: [],
      metrics: {
        totalEdges: 0,
        avgFanIn: 0,
        avgFanOut: 0,
        maxFanIn: { file: '', value: 0 },
        maxFanOut: { file: '', value: 0 },
        avgInstability: 0,
        avgDepth: 0,
        maxDepth: 0,
      },
      recommendations: [],
    };
  }
}

export function createDependencyAnalyzer(): DependencyAnalyzer {
  return new DependencyAnalyzer();
}
