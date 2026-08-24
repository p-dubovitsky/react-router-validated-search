import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, test } from 'vite-plus/test';
import { z } from 'zod';

import { SearchValidationError, runSearchValidator } from './validate-search';

describe('runSearchValidator', () => {
  test('returns a synchronous Standard Schema value synchronously', () => {
    const result = runSearchValidator(z.object({ page: z.coerce.number() }), {
      page: '2',
    });

    expect(result).toEqual({ page: 2 });
    expect(result).not.toBeInstanceOf(Promise);
  });

  // Suspending on validation would force validated search into a cache that
  // outlives the request that produced it.
  test('rejects an asynchronous Standard Schema', () => {
    const schema: StandardSchemaV1<{ page: string }, { page: number }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (input) => {
          const value = input as { page: string };

          return { value: { page: Number(value.page) } };
        },
      },
    };

    expect(() => runSearchValidator(schema, { page: '3' })).toThrow(
      /validateSearch returned a promise/,
    );
  });

  test('rejects an asynchronous function validator', () => {
    expect(() =>
      runSearchValidator(async (input: Record<string, unknown>) => input, {
        page: '3',
      }),
    ).toThrow(/validateSearch returned a promise/);
  });

  // The rejection reaches no handler, so leaving it alone ends the Node
  // process. Vitest reports an unhandled rejection here as a failed run.
  test('rejects a failing asynchronous validator without an unhandled rejection', async () => {
    expect(() =>
      runSearchValidator(() => Promise.reject(new Error('boom')), {
        page: '3',
      }),
    ).toThrow(/validateSearch returned a promise/);

    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test('throws SearchValidationError with issues and original input', () => {
    const input = { page: 'invalid' };

    expect(() => runSearchValidator(z.object({ page: z.coerce.number() }), input)).toThrow(
      expect.objectContaining({ name: 'SearchValidationError', input }),
    );

    try {
      runSearchValidator(z.object({ page: z.coerce.number() }), input);
    } catch (error) {
      expect(error).toBeInstanceOf(SearchValidationError);
      expect((error as SearchValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  test('returns function output', () => {
    expect(
      runSearchValidator((input: Record<string, unknown>) => ({ q: input.q ?? '' }), {}),
    ).toEqual({ q: '' });
  });

  test('rejects undefined from a function validator', () => {
    expect(() => runSearchValidator(() => undefined, {})).toThrow(
      /validateSearch must return a defined value/,
    );
  });

  test('rejects undefined from Standard Schema', () => {
    const schema: StandardSchemaV1<unknown, undefined> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ value: undefined }),
      },
    };

    expect(() => runSearchValidator(schema, {})).toThrow(
      /validateSearch must return a defined value/,
    );
  });

  test.each([null, 1, []])('rejects a non-object validator result: %p', (result) => {
    expect(() => runSearchValidator(() => result, {})).toThrow(
      /validateSearch must return an object/,
    );
  });

  test('rejects a non-object Standard Schema result', () => {
    const schema: StandardSchemaV1<unknown, null> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ value: null }),
      },
    };

    expect(() => runSearchValidator(schema, {})).toThrow(/validateSearch must return an object/);
  });

  test('preserves functional validator exceptions by identity', () => {
    const response = new Response('invalid', { status: 422 });
    const error = new Error('broken');

    expect(() =>
      runSearchValidator(() => {
        throw response;
      }, {}),
    ).toThrow(response);
    expect(() =>
      runSearchValidator(() => {
        throw error;
      }, {}),
    ).toThrow(error);
  });
});
