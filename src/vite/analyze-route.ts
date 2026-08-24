/**
 * OXC-based static analysis of route exports consumed by the Vite transform.
 *
 * @module
 */
import { parseSync } from 'oxc-parser';

/** Route data-handler exports that receive generated `search`. */
export const HANDLER_EXPORTS = ['loader', 'action', 'clientLoader', 'clientAction'] as const;

/** Supported route data-handler export name. */
export type HandlerExportName = (typeof HANDLER_EXPORTS)[number];

/** Static metadata needed to rewrite one exported binding. */
export type ExportBinding = {
  exportedName: string;
  localName?: string;
  exportStart: number;
  reexported: boolean;
};

/** Parsed OXC module retained for reuse by the transformer. */
export type ParsedRouteModule = ReturnType<typeof parseSync>;

/** Route exports relevant to validated search transformation. */
export type RouteAnalysis = {
  validateSearch?: ExportBinding;
  middleware?: ExportBinding;
  clientMiddleware?: ExportBinding;
  handlers: Map<HandlerExportName, ExportBinding>;
  defaultExport?: ExportBinding;
  /** Reused by the transform so a route module is parsed once, not twice. */
  parsed: ParsedRouteModule;
};

function languageFor(filename: string): 'js' | 'jsx' | 'ts' | 'tsx' {
  if (filename.endsWith('.tsx')) return 'tsx';
  if (filename.endsWith('.jsx')) return 'jsx';
  if (filename.endsWith('.ts') || filename.endsWith('.mts')) return 'ts';
  return 'js';
}

/**
 * Parse a route module and collect supported static exports.
 *
 * @throws {SyntaxError} When OXC reports a fatal parse error.
 */
export function analyzeRouteModule(source: string, filename: string): RouteAnalysis {
  const result = parseSync(filename, source, {
    lang: languageFor(filename),
    sourceType: 'module',
    range: true,
  });

  const fatalErrors = result.errors.filter((error) => error.severity === 'Error');

  if (fatalErrors.length > 0) {
    throw new SyntaxError(
      `[react-router-validated-search] Failed to parse ${filename}: ${fatalErrors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }

  const analysis: RouteAnalysis = { handlers: new Map(), parsed: result };

  for (const exported of result.module.staticExports) {
    for (const entry of exported.entries) {
      if (entry.isType) continue;

      const exportedName = entry.exportName.kind === 'Default' ? 'default' : entry.exportName.name;

      if (!exportedName) continue;

      const binding: ExportBinding = {
        exportedName,
        localName: entry.localName.name ?? undefined,
        exportStart: exported.start,
        reexported: entry.moduleRequest !== null,
      };

      if (exportedName === 'validateSearch') {
        analysis.validateSearch = binding;
      } else if (exportedName === 'middleware') {
        analysis.middleware = binding;
      } else if (exportedName === 'clientMiddleware') {
        analysis.clientMiddleware = binding;
      } else if (HANDLER_EXPORTS.includes(exportedName as HandlerExportName)) {
        analysis.handlers.set(exportedName as HandlerExportName, binding);
      } else if (exportedName === 'default') {
        analysis.defaultExport = binding;
      }
    }
  }

  return analysis;
}
