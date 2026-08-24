import { describe, expect, test } from 'vite-plus/test';

import { analyzeRouteModule } from './analyze-route';

describe('analyzeRouteModule', () => {
  test('finds validator, middleware, handlers, and a named default component', () => {
    const analysis = analyzeRouteModule(
      `
        export const validateSearch = schema;
        export async function loader() {}
        export const action = async () => {};
        export const middleware = [existingMiddleware];
        export const clientMiddleware = [existingClientMiddleware];
        const localClientLoader = () => {};
        export { localClientLoader as clientLoader };
        export default function Page() { return <div />; }
      `,
      'route.tsx',
    );

    expect(analysis.validateSearch).toMatchObject({
      exportedName: 'validateSearch',
      localName: 'validateSearch',
      reexported: false,
    });
    expect(analysis.middleware).toMatchObject({
      exportedName: 'middleware',
      localName: 'middleware',
      reexported: false,
    });
    expect(analysis.clientMiddleware).toMatchObject({
      exportedName: 'clientMiddleware',
      localName: 'clientMiddleware',
      reexported: false,
    });
    expect([...analysis.handlers]).toEqual([
      ['loader', expect.objectContaining({ localName: 'loader' })],
      ['action', expect.objectContaining({ localName: 'action' })],
      ['clientLoader', expect.objectContaining({ localName: 'localClientLoader' })],
    ]);
    expect(analysis.defaultExport).toMatchObject({ localName: 'Page' });
  });

  test('supports an aliased validateSearch export', () => {
    const analysis = analyzeRouteModule(
      `const contract = schema; export { contract as validateSearch };`,
      'route.ts',
    );

    expect(analysis.validateSearch).toMatchObject({
      exportedName: 'validateSearch',
      localName: 'contract',
    });
  });

  test('does not treat comments and strings as exports', () => {
    const analysis = analyzeRouteModule(
      `
        // export const validateSearch = fake
        const text = "export function loader() {}";
        export default () => <span>{text}</span>;
      `,
      'route.tsx',
    );

    expect(analysis.validateSearch).toBeUndefined();
    expect(analysis.handlers.size).toBe(0);
  });

  test('marks non-local re-exports for diagnostics', () => {
    const analysis = analyzeRouteModule(
      `export { clientMiddleware, loader, middleware, validateSearch } from './shared';`,
      'route.ts',
    );

    expect(analysis.validateSearch?.reexported).toBe(true);
    expect(analysis.handlers.get('loader')?.reexported).toBe(true);
    expect(analysis.middleware?.reexported).toBe(true);
    expect(analysis.clientMiddleware?.reexported).toBe(true);
  });

  test('keeps correct spans after Unicode text', () => {
    const source = `const label = 'страница';\nexport const validateSearch = schema;`;
    const analysis = analyzeRouteModule(source, 'route.ts');
    const binding = analysis.validateSearch;

    expect(binding && source.slice(binding.exportStart)).toBe(
      'export const validateSearch = schema;',
    );
  });
});
