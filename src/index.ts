// GitStats - Git Repository Analyzer
// Main entry point for programmatic usage

export * from './types/index.js';
export * from './core/index.js';
export * from './parsers/index.js';
export * from './analyzers/index.js';
export * from './outputs/index.js';
export * from './utils/index.js';

import { analyzeRepository } from './core/analyzer.js';
import { createRenderer } from './outputs/index.js';
import type { AnalysisConfig, OutputConfig, AnalysisReport } from './types/index.js';

/**
 * Analyze a repository and render output
 */
export async function gitstats(
  repoPath: string,
  options: {
    config?: Partial<AnalysisConfig>;
    output?: Partial<OutputConfig>;
    onProgress?: (phase: string) => void;
  } = {}
): Promise<{ report: AnalysisReport; rendered: string }> {
  const config: AnalysisConfig = {
    repoPath,
    ...options.config,
  };

  const outputConfig: OutputConfig = {
    format: 'cli',
    ...options.output,
  };

  const report = await analyzeRepository(config, (progress) => {
    if (options.onProgress) {
      options.onProgress(progress.phase);
    }
  });

  const renderer = createRenderer(outputConfig.format);
  const rendered = await renderer.render(report, outputConfig);

  return { report, rendered };
}

export default gitstats;
