export * from './json-renderer.js';
export * from './cli-renderer.js';
export * from './html-renderer.js';

import type { OutputFormat, OutputRenderer } from '../types/index.js';
import { createJsonRenderer } from './json-renderer.js';
import { createCliRenderer } from './cli-renderer.js';
import { createHtmlRenderer } from './html-renderer.js';

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
