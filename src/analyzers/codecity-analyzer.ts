import type {
  Commit,
  AnalysisConfig,
  Analyzer,
} from '../types/index.js';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative, dirname } from 'node:path';

export interface CodeCityStats {
  // The city structure
  city: District[];

  // Summary metrics
  summary: CodeCitySummary;

  // File details for drill-down
  buildings: Building[];

  // District metrics
  districts: DistrictMetrics[];

  // Health indicators
  healthIndicators: CityHealthIndicator[];
}

export interface CodeCitySummary {
  totalDistricts: number;
  totalBuildings: number;
  totalLOC: number;
  avgBuildingHeight: number;
  maxBuildingHeight: number;
  healthyBuildings: number;
  warningBuildings: number;
  criticalBuildings: number;
  overallHealth: number; // 0-100
}

export interface District {
  name: string;
  path: string;
  buildings: Building[];
  subDistricts: District[];
  metrics: DistrictMetrics;
  position: { x: number; y: number }; // For layout
  size: { width: number; depth: number };
  color: string; // Based on health
}

export interface Building {
  name: string;
  path: string;
  district: string;

  // Visual properties
  height: number; // Based on LOC or complexity
  width: number; // Based on number of functions/classes
  depth: number; // Based on number of imports
  color: string; // Based on health

  // Metrics
  metrics: BuildingMetrics;

  // Position within district
  position: { x: number; y: number; z: number };

  // Health status
  health: 'healthy' | 'warning' | 'critical';
  healthScore: number;
  healthReasons: string[];
}

export interface BuildingMetrics {
  loc: number;
  functions: number;
  classes: number;
  imports: number;
  exports: number;
  complexity: number; // Estimated cyclomatic complexity
  churnScore: number;
  authors: number;
  lastModified: Date | null;
  daysSinceModified: number;
  commitCount: number;
}

export interface DistrictMetrics {
  totalLOC: number;
  totalFiles: number;
  avgLOC: number;
  avgComplexity: number;
  healthScore: number;
  authors: number;
  activityLevel: 'hot' | 'warm' | 'cold';
}

export interface CityHealthIndicator {
  name: string;
  value: number;
  status: 'good' | 'warning' | 'critical';
  description: string;
}

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];

export class CodeCityAnalyzer implements Analyzer<CodeCityStats> {
  name = 'codecity-analyzer';
  description = 'Generates data for Code City visualization';

  async analyze(commits: Commit[], config: AnalysisConfig): Promise<CodeCityStats> {
    const repoPath = config.repoPath;

    // Get file tree
    const fileTree = await this.buildFileTree(repoPath);

    // Get commit data for files
    const fileCommitData = this.getFileCommitData(commits);

    // Build buildings with metrics
    const buildings = await this.buildBuildings(repoPath, fileTree, fileCommitData);

    // Organize into districts
    const districts = this.organizeDistricts(buildings);

    // Calculate layout positions
    this.calculateLayout(districts);

    // Generate summary
    const summary = this.generateSummary(districts, buildings);

    // Extract district metrics
    const districtMetrics = this.extractDistrictMetrics(districts);

    // Generate health indicators
    const healthIndicators = this.generateHealthIndicators(buildings, districts);

    return {
      city: districts,
      summary,
      buildings,
      districts: districtMetrics,
      healthIndicators,
    };
  }

  private async buildFileTree(repoPath: string): Promise<Map<string, string[]>> {
    const tree = new Map<string, string[]>(); // directory -> files

    const walk = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        const relativePath = relative(repoPath, dir) || '.';
        const files: string[] = [];

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', 'vendor'].includes(entry.name)) {
              continue;
            }
            await walk(fullPath);
          } else {
            const ext = extname(entry.name);
            if (CODE_EXTENSIONS.includes(ext)) {
              files.push(relative(repoPath, fullPath));
            }
          }
        }

        if (files.length > 0) {
          tree.set(relativePath, files);
        }
      } catch {
        // Directory unreadable
      }
    };

    await walk(repoPath);
    return tree;
  }

  private getFileCommitData(commits: Commit[]): Map<string, {
    commitCount: number;
    authors: Set<string>;
    lastModified: Date;
    churnScore: number;
  }> {
    const data = new Map<string, {
      commitCount: number;
      authors: Set<string>;
      lastModified: Date;
      churnScore: number;
      totalChanges: number;
    }>();

    for (const commit of commits) {
      for (const file of commit.files) {
        if (!data.has(file.path)) {
          data.set(file.path, {
            commitCount: 0,
            authors: new Set(),
            lastModified: commit.date,
            churnScore: 0,
            totalChanges: 0,
          });
        }

        const fileData = data.get(file.path)!;
        fileData.commitCount++;
        fileData.authors.add(commit.author.email);
        fileData.totalChanges += file.additions + file.deletions;

        if (commit.date > fileData.lastModified) {
          fileData.lastModified = commit.date;
        }
      }
    }

    // Calculate churn scores
    for (const [_, fileData] of data.entries()) {
      fileData.churnScore = Math.log(fileData.commitCount + 1) * Math.log(fileData.totalChanges + 1);
    }

    return data;
  }

  private async buildBuildings(
    repoPath: string,
    fileTree: Map<string, string[]>,
    commitData: Map<string, {
      commitCount: number;
      authors: Set<string>;
      lastModified: Date;
      churnScore: number;
    }>
  ): Promise<Building[]> {
    const buildings: Building[] = [];
    const now = new Date();

    for (const [dir, files] of fileTree.entries()) {
      for (const file of files) {
        try {
          const content = await readFile(join(repoPath, file), 'utf-8');
          const metrics = this.analyzeFile(content);
          const fileCommitData = commitData.get(file);

          // Calculate days since modified
          const lastModified = fileCommitData?.lastModified || null;
          const daysSinceModified = lastModified
            ? Math.floor((now.getTime() - lastModified.getTime()) / (1000 * 60 * 60 * 24))
            : 999;

          // Combine metrics
          const fullMetrics: BuildingMetrics = {
            ...metrics,
            churnScore: fileCommitData?.churnScore || 0,
            authors: fileCommitData?.authors.size || 0,
            lastModified,
            daysSinceModified,
            commitCount: fileCommitData?.commitCount || 0,
          };

          // Calculate health
          const { health, healthScore, healthReasons } = this.calculateBuildingHealth(fullMetrics);

          // Calculate visual properties
          const height = Math.max(1, Math.log(metrics.loc + 1) * 5);
          const width = Math.max(1, Math.sqrt(metrics.functions + metrics.classes + 1) * 2);
          const depth = Math.max(1, Math.sqrt(metrics.imports + 1) * 1.5);

          buildings.push({
            name: file.split('/').pop() || file,
            path: file,
            district: dir,
            height,
            width,
            depth,
            color: this.healthToColor(health),
            metrics: fullMetrics,
            position: { x: 0, y: 0, z: 0 },
            health,
            healthScore,
            healthReasons,
          });
        } catch {
          // File unreadable
        }
      }
    }

    return buildings;
  }

  private analyzeFile(content: string): {
    loc: number;
    functions: number;
    classes: number;
    imports: number;
    exports: number;
    complexity: number;
  } {
    const lines = content.split('\n');
    const loc = lines.filter(l => l.trim().length > 0).length;

    // Count functions
    const functionMatches = content.match(/function\s+\w+|=>\s*{|=>\s*\(/g) || [];
    const functions = functionMatches.length;

    // Count classes
    const classMatches = content.match(/class\s+\w+/g) || [];
    const classes = classMatches.length;

    // Count imports
    const importMatches = content.match(/import\s+/g) || [];
    const imports = importMatches.length;

    // Count exports
    const exportMatches = content.match(/export\s+/g) || [];
    const exports = exportMatches.length;

    // Estimate complexity (simplified)
    const ifMatches = content.match(/\bif\s*\(/g) || [];
    const forMatches = content.match(/\bfor\s*\(/g) || [];
    const whileMatches = content.match(/\bwhile\s*\(/g) || [];
    const switchMatches = content.match(/\bswitch\s*\(/g) || [];
    const caseMatches = content.match(/\bcase\s+/g) || [];
    const ternaryMatches = content.match(/\?[^:]+:/g) || [];
    const andOrMatches = content.match(/&&|\|\|/g) || [];

    const complexity = 1 +
      ifMatches.length +
      forMatches.length +
      whileMatches.length +
      switchMatches.length +
      caseMatches.length +
      ternaryMatches.length +
      Math.floor(andOrMatches.length / 2);

    return { loc, functions, classes, imports, exports, complexity };
  }

  private calculateBuildingHealth(metrics: BuildingMetrics): {
    health: 'healthy' | 'warning' | 'critical';
    healthScore: number;
    healthReasons: string[];
  } {
    let score = 100;
    const reasons: string[] = [];

    // LOC check
    if (metrics.loc > 500) {
      score -= 15;
      reasons.push('Large file (>500 LOC)');
    } else if (metrics.loc > 300) {
      score -= 5;
      reasons.push('Medium-large file (>300 LOC)');
    }

    // Complexity check
    if (metrics.complexity > 30) {
      score -= 20;
      reasons.push('Very high complexity');
    } else if (metrics.complexity > 15) {
      score -= 10;
      reasons.push('High complexity');
    }

    // Churn check
    if (metrics.churnScore > 20) {
      score -= 15;
      reasons.push('High churn (frequently modified)');
    } else if (metrics.churnScore > 10) {
      score -= 5;
      reasons.push('Moderate churn');
    }

    // Age check
    if (metrics.daysSinceModified > 365) {
      score -= 10;
      reasons.push('Not modified in over a year');
    }

    // Single author check
    if (metrics.authors === 1 && metrics.commitCount > 5) {
      score -= 5;
      reasons.push('Single author (knowledge silo)');
    }

    // Many imports check
    if (metrics.imports > 20) {
      score -= 10;
      reasons.push('Many dependencies (>20 imports)');
    }

    score = Math.max(0, score);

    let health: 'healthy' | 'warning' | 'critical';
    if (score >= 70) health = 'healthy';
    else if (score >= 40) health = 'warning';
    else health = 'critical';

    return { health, healthScore: score, healthReasons: reasons };
  }

  private healthToColor(health: 'healthy' | 'warning' | 'critical'): string {
    switch (health) {
      case 'healthy': return '#4CAF50'; // Green
      case 'warning': return '#FFC107'; // Yellow
      case 'critical': return '#F44336'; // Red
    }
  }

  private organizeDistricts(buildings: Building[]): District[] {
    // Group buildings by top-level directory
    const districtMap = new Map<string, Building[]>();

    for (const building of buildings) {
      const parts = building.district.split('/');
      const topLevel = parts[0] || 'root';

      if (!districtMap.has(topLevel)) {
        districtMap.set(topLevel, []);
      }
      districtMap.get(topLevel)!.push(building);
    }

    // Create districts
    const districts: District[] = [];

    for (const [name, districtBuildings] of districtMap.entries()) {
      const metrics = this.calculateDistrictMetrics(districtBuildings);

      // Create sub-districts for nested directories
      const subDistricts = this.createSubDistricts(name, districtBuildings);

      districts.push({
        name,
        path: name,
        buildings: districtBuildings.filter(b => {
          const parts = b.district.split('/');
          return parts.length === 1 || parts[0] === name && parts.length === 1;
        }),
        subDistricts,
        metrics,
        position: { x: 0, y: 0 },
        size: { width: 0, depth: 0 },
        color: this.healthScoreToColor(metrics.healthScore),
      });
    }

    return districts.sort((a, b) => b.metrics.totalFiles - a.metrics.totalFiles);
  }

  private createSubDistricts(parentName: string, buildings: Building[]): District[] {
    const subDistrictMap = new Map<string, Building[]>();

    for (const building of buildings) {
      const parts = building.district.split('/');
      if (parts.length > 1 && parts[0] === parentName) {
        const subName = parts[1];
        if (!subDistrictMap.has(subName)) {
          subDistrictMap.set(subName, []);
        }
        subDistrictMap.get(subName)!.push(building);
      }
    }

    const subDistricts: District[] = [];

    for (const [name, subBuildings] of subDistrictMap.entries()) {
      const metrics = this.calculateDistrictMetrics(subBuildings);

      subDistricts.push({
        name,
        path: `${parentName}/${name}`,
        buildings: subBuildings,
        subDistricts: [], // Could recurse for deeper nesting
        metrics,
        position: { x: 0, y: 0 },
        size: { width: 0, depth: 0 },
        color: this.healthScoreToColor(metrics.healthScore),
      });
    }

    return subDistricts;
  }

  private calculateDistrictMetrics(buildings: Building[]): DistrictMetrics {
    if (buildings.length === 0) {
      return {
        totalLOC: 0,
        totalFiles: 0,
        avgLOC: 0,
        avgComplexity: 0,
        healthScore: 100,
        authors: 0,
        activityLevel: 'cold',
      };
    }

    const totalLOC = buildings.reduce((sum, b) => sum + b.metrics.loc, 0);
    const totalComplexity = buildings.reduce((sum, b) => sum + b.metrics.complexity, 0);
    const avgHealthScore = buildings.reduce((sum, b) => sum + b.healthScore, 0) / buildings.length;
    const allAuthors = new Set<number>();
    buildings.forEach(b => { for (let i = 0; i < b.metrics.authors; i++) allAuthors.add(i); });

    // Activity level based on recent modifications
    const recentlyModified = buildings.filter(b => b.metrics.daysSinceModified < 30).length;
    const activityRatio = recentlyModified / buildings.length;

    let activityLevel: 'hot' | 'warm' | 'cold';
    if (activityRatio > 0.5) activityLevel = 'hot';
    else if (activityRatio > 0.2) activityLevel = 'warm';
    else activityLevel = 'cold';

    return {
      totalLOC,
      totalFiles: buildings.length,
      avgLOC: totalLOC / buildings.length,
      avgComplexity: totalComplexity / buildings.length,
      healthScore: avgHealthScore,
      authors: Math.max(...buildings.map(b => b.metrics.authors)),
      activityLevel,
    };
  }

  private healthScoreToColor(score: number): string {
    if (score >= 70) return '#4CAF50';
    if (score >= 40) return '#FFC107';
    return '#F44336';
  }

  private calculateLayout(districts: District[]): void {
    // Simple grid layout for districts
    const columns = Math.ceil(Math.sqrt(districts.length));
    const spacing = 50;

    districts.forEach((district, i) => {
      const row = Math.floor(i / columns);
      const col = i % columns;

      district.position = {
        x: col * spacing,
        y: row * spacing,
      };

      // Calculate district size based on buildings
      const buildingCount = district.buildings.length +
        district.subDistricts.reduce((sum, sd) => sum + sd.buildings.length, 0);
      const size = Math.sqrt(buildingCount) * 10 + 10;
      district.size = { width: size, depth: size };

      // Layout buildings within district
      this.layoutBuildingsInDistrict(district);
    });
  }

  private layoutBuildingsInDistrict(district: District): void {
    const allBuildings = [
      ...district.buildings,
      ...district.subDistricts.flatMap(sd => sd.buildings),
    ];

    const gridSize = Math.ceil(Math.sqrt(allBuildings.length));
    const spacing = 5;

    allBuildings.forEach((building, i) => {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;

      building.position = {
        x: district.position.x + col * spacing,
        y: 0, // Ground level
        z: district.position.y + row * spacing,
      };
    });
  }

  private generateSummary(districts: District[], buildings: Building[]): CodeCitySummary {
    const totalLOC = buildings.reduce((sum, b) => sum + b.metrics.loc, 0);
    const avgHeight = buildings.reduce((sum, b) => sum + b.height, 0) / (buildings.length || 1);
    const maxHeight = Math.max(...buildings.map(b => b.height));

    const healthyCount = buildings.filter(b => b.health === 'healthy').length;
    const warningCount = buildings.filter(b => b.health === 'warning').length;
    const criticalCount = buildings.filter(b => b.health === 'critical').length;

    const overallHealth = buildings.reduce((sum, b) => sum + b.healthScore, 0) / (buildings.length || 1);

    return {
      totalDistricts: districts.length,
      totalBuildings: buildings.length,
      totalLOC,
      avgBuildingHeight: avgHeight,
      maxBuildingHeight: maxHeight,
      healthyBuildings: healthyCount,
      warningBuildings: warningCount,
      criticalBuildings: criticalCount,
      overallHealth: Math.round(overallHealth),
    };
  }

  private extractDistrictMetrics(districts: District[]): DistrictMetrics[] {
    return districts.map(d => d.metrics);
  }

  private generateHealthIndicators(buildings: Building[], districts: District[]): CityHealthIndicator[] {
    const indicators: CityHealthIndicator[] = [];

    // Large files indicator
    const largeFiles = buildings.filter(b => b.metrics.loc > 500);
    indicators.push({
      name: 'Large Files',
      value: largeFiles.length,
      status: largeFiles.length > 5 ? 'critical' : largeFiles.length > 2 ? 'warning' : 'good',
      description: `${largeFiles.length} files have more than 500 lines of code`,
    });

    // Complex files indicator
    const complexFiles = buildings.filter(b => b.metrics.complexity > 20);
    indicators.push({
      name: 'Complex Files',
      value: complexFiles.length,
      status: complexFiles.length > 5 ? 'critical' : complexFiles.length > 2 ? 'warning' : 'good',
      description: `${complexFiles.length} files have high cyclomatic complexity`,
    });

    // Stale files indicator
    const staleFiles = buildings.filter(b => b.metrics.daysSinceModified > 180);
    indicators.push({
      name: 'Stale Files',
      value: staleFiles.length,
      status: staleFiles.length > buildings.length * 0.3 ? 'warning' : 'good',
      description: `${staleFiles.length} files haven't been modified in 6+ months`,
    });

    // High churn indicator
    const highChurnFiles = buildings.filter(b => b.metrics.churnScore > 15);
    indicators.push({
      name: 'High Churn',
      value: highChurnFiles.length,
      status: highChurnFiles.length > 5 ? 'warning' : 'good',
      description: `${highChurnFiles.length} files are modified very frequently`,
    });

    // Critical buildings
    const criticalBuildings = buildings.filter(b => b.health === 'critical');
    indicators.push({
      name: 'Critical Files',
      value: criticalBuildings.length,
      status: criticalBuildings.length > 0 ? 'critical' : 'good',
      description: `${criticalBuildings.length} files need immediate attention`,
    });

    return indicators;
  }

  private emptyStats(): CodeCityStats {
    return {
      city: [],
      summary: {
        totalDistricts: 0,
        totalBuildings: 0,
        totalLOC: 0,
        avgBuildingHeight: 0,
        maxBuildingHeight: 0,
        healthyBuildings: 0,
        warningBuildings: 0,
        criticalBuildings: 0,
        overallHealth: 100,
      },
      buildings: [],
      districts: [],
      healthIndicators: [],
    };
  }
}

export function createCodeCityAnalyzer(): CodeCityAnalyzer {
  return new CodeCityAnalyzer();
}
