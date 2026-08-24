import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { main } from './index';

afterEach(() => vi.restoreAllMocks());

describe('CLI', () => {
  test('prints command help', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await expect(main(['--help'])).resolves.toBe(0);
    expect(info).toHaveBeenCalledWith(
      'Usage: react-router-validated-search typegen [--root <directory>]',
    );
  });

  test('rejects unknown commands with a concise diagnostic', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(main(['unknown'])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(
      '[react-router-validated-search] Unknown command "unknown". Use "typegen".',
    );
  });

  test('rejects an unknown typegen option without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(main(['typegen', '--unknown'])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(
      "[react-router-validated-search] Type generation failed: Unknown option '--unknown'",
    );
  });
});
