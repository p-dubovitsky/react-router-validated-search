/**
 * Source transform that injects validated search into native route exports.
 *
 * @module
 */
import MagicString from 'magic-string';
import { Visitor } from 'oxc-parser';

import { analyzeRouteModule, type ExportBinding, type HandlerExportName } from './analyze-route';
import type { SearchRouteTransform } from './route-config';

type NodeBase = {
  type: string;
  start: number;
  end: number;
};

type ExportSpecifier = NodeBase & {
  exported: { name: string };
};

type ExportNamedNode = NodeBase & {
  type: 'ExportNamedDeclaration';
  declaration: NodeBase | null;
  specifiers: Array<ExportSpecifier>;
  source: { value: string } | null;
};

type ExportDefaultNode = NodeBase & {
  type: 'ExportDefaultDeclaration';
  declaration: NodeBase & {
    name?: string;
    id?: { name: string } | null;
  };
};

type TopLevelNode = NodeBase | ExportNamedNode | ExportDefaultNode;

type DeclarationNode = NodeBase & {
  id?: { type: string; name?: string } | null;
  declarations?: Array<{ id: { type: string; name?: string } }>;
};

/**
 * The top-level statement that declares `name`, but only in the forms that stay
 * a single declaration once `export` is prepended to them. Anything else — an
 * imported binding, several declarators in one statement — is left alone.
 */
function declarationStatement(body: Array<TopLevelNode>, name: string): NodeBase | undefined {
  return body.find((statement) => {
    const node = statement as DeclarationNode;

    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      return node.id?.name === name;
    }

    if (node.type !== 'VariableDeclaration' || node.declarations?.length !== 1) {
      return false;
    }

    const [declarator] = node.declarations;
    return declarator.id.type === 'Identifier' && declarator.id.name === name;
  });
}

/**
 * Every export this transform rewrites needs a binding declared in the module
 * itself: a re-export is nothing but a name pointing somewhere else.
 */
function requireLocalBinding(
  binding: ExportBinding,
  id: string,
  action: 'transformed' | 'wrapped',
): string {
  if (binding.reexported || !binding.localName) {
    throw new Error(
      `[react-router-validated-search] Route "${id}" re-exports \`${binding.exportedName}\` from another module; declare a local binding so it can be ${action}.`,
    );
  }

  return binding.localName;
}

function uniqueIdentifier(base: string, names: Set<string>): string {
  let candidate = base;
  let suffix = 1;

  while (names.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  names.add(candidate);
  return candidate;
}

/**
 * Rewrite a search-aware route module while preserving React Router chunking.
 *
 * The optional route metadata enables inherited validator lookup. Without it,
 * the helper transforms a standalone module using its local validator only.
 *
 * @returns Transformed source and map, or `null` when no wrapper is required.
 * @throws {Error} For re-exported or otherwise unsupported route bindings.
 */
export function transformRouteModule(
  source: string,
  id: string,
  route?: SearchRouteTransform,
): { code: string; map: ReturnType<MagicString['generateMap']> } | null {
  const analysis = analyzeRouteModule(source, id);

  if (!analysis.validateSearch && !route) return null;

  const validateSearchName = analysis.validateSearch
    ? requireLocalBinding(analysis.validateSearch, id, 'transformed')
    : undefined;

  // analyzeRouteModule already parsed this source with identical options.
  const parsed = analysis.parsed;
  const body = parsed.program.body as Array<TopLevelNode>;
  const names = new Set<string>();
  new Visitor({
    Identifier(node) {
      names.add(node.name);
    },
  }).visit(parsed.program);

  const magic = new MagicString(source);
  const wrappedByExport = new Map<
    number,
    Array<[HandlerExportName | 'middleware' | 'clientMiddleware', string]>
  >();

  const wrapExport = (
    exportedName: HandlerExportName | 'middleware' | 'clientMiddleware',
    binding: ExportBinding,
  ): void => {
    const entries = wrappedByExport.get(binding.exportStart) ?? [];
    entries.push([exportedName, requireLocalBinding(binding, id, 'wrapped')]);
    wrappedByExport.set(binding.exportStart, entries);
  };

  for (const [exportedName, binding] of analysis.handlers) {
    wrapExport(exportedName, binding);
  }

  if (analysis.middleware && analysis.validateSearch) {
    wrapExport('middleware', analysis.middleware);
  }

  if (analysis.clientMiddleware && analysis.validateSearch) {
    wrapExport('clientMiddleware', analysis.clientMiddleware);
  }

  const wrappers: Array<string> = [];
  const runtimeImports: Array<string> = [];
  const createMiddlewareName = uniqueIdentifier('__reactRouterSearchCreateMiddleware', names);
  const createClientMiddlewareName = uniqueIdentifier(
    '__reactRouterSearchCreateClientMiddleware',
    names,
  );
  const getContextSearchName = uniqueIdentifier('__reactRouterSearchGetContextSearch', names);
  const middlewareExpression = analysis.validateSearch
    ? `${createMiddlewareName}(${JSON.stringify(route?.routeId ?? id)}, ${route?.parentValidatedSearchRouteId ? JSON.stringify(route.parentValidatedSearchRouteId) : 'undefined'}, ${validateSearchName})`
    : undefined;
  const clientMiddlewareExpression = analysis.validateSearch
    ? `${createClientMiddlewareName}(${JSON.stringify(route?.routeId ?? id)}, ${route?.parentValidatedSearchRouteId ? JSON.stringify(route.parentValidatedSearchRouteId) : 'undefined'}, ${validateSearchName})`
    : undefined;

  for (const [exportStart, handlers] of wrappedByExport) {
    const node = body.find(
      (candidate): candidate is ExportNamedNode =>
        candidate.type === 'ExportNamedDeclaration' && candidate.start === exportStart,
    );

    if (!node || node.source) {
      const [handlerName] = handlers[0] ?? ['loader'];
      throw new Error(
        `[react-router-validated-search] Route "${id}" has an unsupported \`${handlerName}\` export form.`,
      );
    }

    const targetNames = new Set(handlers.map(([name]) => name));

    if (node.declaration) {
      magic.remove(node.start, node.declaration.start);

      const staticExport = parsed.module.staticExports.find((entry) => entry.start === node.start);
      const preserved = (staticExport?.entries ?? []).filter((entry) => {
        const name = entry.exportName.name;
        return (
          name !== null &&
          !targetNames.has(name as HandlerExportName | 'middleware' | 'clientMiddleware')
        );
      });

      for (const entry of preserved) {
        if (!entry.localName.name || !entry.exportName.name) continue;
        wrappers.push(`export { ${entry.localName.name} as ${entry.exportName.name} };`);
      }
    } else {
      const remaining = node.specifiers.filter(
        (specifier) =>
          !targetNames.has(
            specifier.exported.name as HandlerExportName | 'middleware' | 'clientMiddleware',
          ),
      );

      if (remaining.length === 0) {
        magic.remove(node.start, node.end);
      } else {
        magic.overwrite(
          node.start,
          node.end,
          `export { ${remaining
            .map((specifier) => source.slice(specifier.start, specifier.end))
            .join(', ')} };`,
        );
      }
    }

    for (const [exportedName, localName] of handlers) {
      if (exportedName === 'middleware') {
        wrappers.push(`export const middleware = [${middlewareExpression}, ...${localName}];`);
        continue;
      }

      if (exportedName === 'clientMiddleware') {
        wrappers.push(
          `export const clientMiddleware = [${clientMiddlewareExpression}, ...${localName}];`,
        );
        continue;
      }

      const wrapperName = uniqueIdentifier(`__reactRouterSearch_${exportedName}`, names);
      const searchExpression = `${getContextSearchName}(args.context, ${JSON.stringify(route?.validatedSearchRouteId ?? id)})`;
      const wrapper = `async (args) => {
  const search = ${searchExpression};
  return ${localName}({ ...args, search });
}`;
      // React Router reads configuration off the handler itself — a route with a
      // server loader only runs its `clientLoader` on hydration while
      // `clientLoader.hydrate` is true — and it reads it from the export, which
      // is now the wrapper. Whatever the route put on its own handler is copied
      // over: the wrappers are appended after every top-level statement of the
      // module, so this also picks up properties set next to the declaration.
      //
      // Only client handlers get it. The copy has to stay inside the
      // declaration, because React Router builds the client bundle by dropping
      // the `loader` and `action` exports and everything only they referenced —
      // that is what keeps a `.server` import out of the client graph. A
      // separate `Object.assign(wrapper, loader);` statement would survive that
      // removal, keep the route's own handler referenced, and fail the build.
      const declaration =
        exportedName === 'clientLoader' || exportedName === 'clientAction'
          ? `Object.assign(${wrapper}, ${localName})`
          : wrapper;
      wrappers.push(`
const ${wrapperName} = ${declaration};
export { ${wrapperName} as ${exportedName} };`);
    }
  }

  if (analysis.validateSearch) {
    runtimeImports.push(
      `createSearchValidationMiddleware as ${createMiddlewareName}`,
      `createClientSearchValidationMiddleware as ${createClientMiddlewareName}`,
    );
  }

  if (analysis.handlers.size > 0) {
    runtimeImports.push(`requireValidatedSearch as ${getContextSearchName}`);
  }

  if (analysis.validateSearch && !analysis.middleware) {
    wrappers.push(`export const middleware = [${middlewareExpression}];`);
  }

  if (analysis.validateSearch && !analysis.clientMiddleware) {
    wrappers.push(`export const clientMiddleware = [${clientMiddlewareExpression}];`);
  }

  if (analysis.defaultExport) {
    const binding = analysis.defaultExport;

    if (binding.reexported) {
      throw new Error(
        `[react-router-validated-search] Route "${id}" re-exports its default component from another module; declare it locally so it can be wrapped.`,
      );
    }

    const node = body.find(
      (candidate): candidate is ExportDefaultNode =>
        candidate.type === 'ExportDefaultDeclaration' && candidate.start === binding.exportStart,
    );

    if (!node) {
      throw new Error(
        `[react-router-validated-search] Route "${id}" has an unsupported default component export form.`,
      );
    }

    const declaration = node.declaration;
    let componentName = binding.localName;

    // The component stays declared inside an export statement instead of
    // becoming a plain top-level declaration. React Router splits an export into
    // its own chunk only while the statements it depends on belong to no other
    // export, and it walks to those statements through every reference to a
    // shared binding — the JSX runtime import alone links each component in the
    // file to all the others. Statements it reaches that way still drop out of
    // the comparison when they are import or export declarations, so a bare
    // declaration is what would make `HydrateFallback` unsplittable, and an
    // `export { Component }` specifier is not enough: the declaration itself has
    // to carry the `export`.
    if (
      (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
      declaration.id
    ) {
      componentName = declaration.id.name;
      magic.overwrite(node.start, declaration.start, 'export ');
    } else if (declaration.type === 'Identifier' && declaration.name) {
      componentName = declaration.name;
      magic.remove(node.start, node.end);

      const declared = declarationStatement(body, componentName);
      if (declared) magic.prependLeft(declared.start, 'export ');
    } else {
      componentName = uniqueIdentifier('__reactRouterSearchComponent', names);
      magic.overwrite(node.start, declaration.start, `export const ${componentName} = `);
    }

    const withSearchName = uniqueIdentifier('__reactRouterSearchWithValidatedSearch', names);
    runtimeImports.push(`withValidatedSearch as ${withSearchName}`);
    wrappers.push(
      route
        ? `export default ${withSearchName}(${componentName}, { registryRouteId: ${JSON.stringify(route.routeId)}, validatedSearchRouteId: ${JSON.stringify(route.validatedSearchRouteId)} });`
        : `export default ${withSearchName}(${componentName}, ${validateSearchName});`,
    );
  }

  if (wrappers.length === 0) return null;

  magic.prepend(
    `import { ${runtimeImports.join(', ')} } from 'react-router-validated-search/internal';\n`,
  );
  magic.append(`\n${wrappers.join('\n')}\n`);

  return {
    code: magic.toString(),
    map: magic.generateMap({
      source: id,
      includeContent: true,
      hires: true,
    }),
  };
}
