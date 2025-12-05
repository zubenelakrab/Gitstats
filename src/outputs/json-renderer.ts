import type {
  AnalysisReport,
  OutputConfig,
  OutputRenderer,
} from '../types/index.js';
import { writeFile } from 'node:fs/promises';

/**
 * Custom replacer for JSON.stringify to handle Set objects
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return Array.from(value);
  }
  return value;
}

/**
 * JSON output renderer
 */
export class JsonRenderer implements OutputRenderer {
  async render(report: AnalysisReport, config: OutputConfig): Promise<string> {
    const pretty = config.options?.pretty ?? true;
    const indent = pretty ? 2 : 0;

    return JSON.stringify(report, jsonReplacer, indent);
  }

  async save(content: string, path: string): Promise<void> {
    await writeFile(path, content, 'utf-8');
  }
}

export function createJsonRenderer(): JsonRenderer {
  return new JsonRenderer();
}
