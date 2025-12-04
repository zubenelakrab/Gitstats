export * from './json-renderer.ts';
export * from './cli-renderer.ts';
export * from './html-renderer.ts';

import type { OutputFormat, OutputRenderer } from '../types/index.ts';
import { createJsonRenderer } from './json-renderer.ts';
import { createCliRenderer } from './cli-renderer.ts';
import { createHtmlRenderer } from './html-renderer.ts';

/**
 * Factory function to create the appropriate renderer
 */
export function createRenderer(format: OutputFormat): OutputRenderer {
  switch (format) {
    case 'json':
      return createJsonRenderer();
    case 'cli':
      return createCliRenderer();
    case 'html':
      return createHtmlRenderer();
    case 'markdown':
      // TODO: Implement markdown renderer
      throw new Error('Markdown renderer not yet implemented');
    case 'csv':
      // TODO: Implement CSV renderer
      throw new Error('CSV renderer not yet implemented');
    default:
      throw new Error(`Unknown output format: ${format}`);
  }
}
