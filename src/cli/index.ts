#!/usr/bin/env node
/**
 * Command-line entry for generating the shadow route types and registry.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { loadConfiguredCodec } from '../vite/plugin';
import { loadRouteConfig, resolveAppDirectory } from '../vite/route-config';
import { generateSearchTypes } from '../vite/typegen';

/**
 * Run the `react-router-validated-search` CLI without terminating the current process.
 *
 * @param argv - Arguments after the executable name.
 * @returns `0` on success/help and `1` for invalid input or generation errors.
 */
export async function main(argv: Array<string>): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.info('Usage: react-router-validated-search typegen [--root <directory>]');
    return 0;
  }

  const command = argv[0];

  if (command !== 'typegen') {
    console.error(
      `[react-router-validated-search] Unknown command "${command ?? ''}". Use "typegen".`,
    );
    return 1;
  }

  try {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: {
        root: { type: 'string', default: process.cwd() },
      },
    });
    const root = path.resolve(values.root);

    // The Vite plugin owns the codec; taking it from a flag here would let
    // generated input types describe a format nothing serializes with.
    const codec = await loadConfiguredCodec(root);
    const appDirectory = await resolveAppDirectory(root, {
      configFile: false,
      root,
    });
    const { routes } = await loadRouteConfig(appDirectory, {
      configFile: false,
      root,
    });
    const generated = await generateSearchTypes({
      root,
      appDirectory,
      routes,
      codec,
    });
    console.info(
      `[react-router-validated-search] Generated search types for ${generated.searchAwareRoutes.length}/${routes.length} routes.`,
    );
    return 0;
  } catch (error) {
    console.error(
      `[react-router-validated-search] Type generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

const isExecuted = process.argv[1]
  ? import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
  : false;

if (isExecuted) process.exitCode = await main(process.argv.slice(2));
