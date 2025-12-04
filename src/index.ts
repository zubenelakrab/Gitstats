// GitStats - Git Repository Analyzer
// Main entry point for programmatic usage

export * from './types/index.ts';
export * from './core/index.ts';
export * from './parsers/index.ts';
export * from './analyzers/index.ts';
export * from './outputs/index.ts';
export * from './utils/index.ts';

import { analyzeRepository } from './core/analyzer.ts';
import { createRenderer } from './outputs/index.ts';
import type { AnalysisConfig, OutputConfig, AnalysisReport } from './types/index.ts';

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
