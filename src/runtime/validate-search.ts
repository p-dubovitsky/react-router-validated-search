/**
 * Validator detection, execution, errors, and input/output type inference.
 *
 * @module
 */
import type { StandardSchemaV1 } from '@standard-schema/spec';

/** Internal unvalidated shape, broad enough for every configured codec. */
export type UnvalidatedSearch = Record<string, unknown>;

/** Value that may be returned synchronously or asynchronously. */
export type MaybePromise<T> = T | Promise<T>;

/** Supported route contract: Standard Schema v1 or a custom function. */
export type SearchValidator = StandardSchemaV1 | CallableFunction;

type SearchObject<T> = T extends ReadonlyArray<unknown> ? never : T extends object ? T : never;

/** Parsed output produced by one validator. */
export type InferValidatedSearch<T> = T extends StandardSchemaV1
  ? SearchObject<StandardSchemaV1.InferOutput<T>>
  : T extends (...args: Array<never>) => infer Output
    ? SearchObject<Output>
    : never;

type MergeSearch<Parent, Child> = Parent extends object
  ? Child extends object
    ? Omit<Parent, keyof Child> & Child
    : Child
  : Child;

type Simplify<T> = T extends object ? { [Key in keyof T]: T[Key] } : T;

/**
 * Merge an outermost-to-local validator tuple into the route's parsed output.
 * Child fields replace parent fields with the same key.
 */
export type InferValidatedSearchChain<
  Validators extends ReadonlyArray<SearchValidator>,
  Accumulator = object,
> = Validators extends readonly [
  infer Validator extends SearchValidator,
  ...infer Rest extends ReadonlyArray<SearchValidator>,
]
  ? InferValidatedSearchChain<Rest, MergeSearch<Accumulator, InferValidatedSearch<Validator>>>
  : Simplify<Accumulator>;

type ReplaceUnknownSchemaFields<Input, Output> = Input extends object
  ? {
      [Key in keyof Input]: unknown extends Input[Key]
        ? Key extends keyof Output
          ? Output[Key]
          : never
        : Input[Key];
    }
  : Input;

/**
 * Infer typed URL input for a validator.
 *
 * Standard Schema input is used unless a field is `unknown`, in which case its
 * output field makes typed URL construction useful. Functions use return type.
 */
export type InferSearchInput<T> = T extends StandardSchemaV1
  ? ReplaceUnknownSchemaFields<StandardSchemaV1.InferInput<T>, StandardSchemaV1.InferOutput<T>>
  : T extends (...args: Array<never>) => infer Output
    ? Output
    : never;

/** Merge typed URL input across an inherited validator chain. */
export type InferSearchInputChain<
  Validators extends ReadonlyArray<SearchValidator>,
  Accumulator = object,
> = Validators extends readonly [
  infer Validator extends SearchValidator,
  ...infer Rest extends ReadonlyArray<SearchValidator>,
]
  ? InferSearchInputChain<Rest, MergeSearch<Accumulator, InferSearchInput<Validator>>>
  : Simplify<Accumulator>;

/**
 * Error raised when Standard Schema reports issues.
 *
 * Server handler integration converts this error to HTTP 400; functional
 * validator errors and responses are never wrapped in this class.
 */
export class SearchValidationError extends Error {
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;
  readonly input: UnvalidatedSearch;

  constructor(issues: ReadonlyArray<StandardSchemaV1.Issue>, input: UnvalidatedSearch) {
    super('Search parameters are invalid');
    this.name = 'SearchValidationError';
    this.issues = issues;
    this.input = input;
  }
}

/** Detect the Standard Schema v1 protocol without binding to a schema library. */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return false;
  }

  const standard: unknown = Reflect.get(value, '~standard');

  return (
    typeof standard === 'object' &&
    standard !== null &&
    typeof Reflect.get(standard, 'validate') === 'function'
  );
}

/** Detect native promises and compatible thenables. */
export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof Reflect.get(value, 'then') === 'function'
  );
}

function unwrapStandardResult<T>(result: StandardSchemaV1.Result<T>, input: UnvalidatedSearch): T {
  if (result.issues) {
    throw new SearchValidationError(result.issues, input);
  }

  return result.value;
}

/** Reject asynchronous validation before it can suspend a render. */
function requireSynchronousResult<T>(result: T): T {
  if (isPromiseLike(result)) {
    // Nothing awaits this promise, so its rejection would reach no handler and
    // Node would end the process for it. The validator is rejected either way;
    // whatever it failed with is not what the caller needs to see.
    Promise.resolve(result).catch(() => {});

    throw new Error(
      '[react-router-validated-search] validateSearch returned a promise. Search validation is synchronous; do asynchronous work in a loader, clientLoader, or middleware.',
    );
  }

  return result;
}

function requireDefinedResult<T>(result: T): Exclude<T, undefined> {
  if (result === undefined) {
    throw new TypeError(
      '[react-router-validated-search] validateSearch must return a defined value.',
    );
  }

  return result as Exclude<T, undefined>;
}

function requireSearchObject<T>(result: T): SearchObject<T> {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new TypeError('[react-router-validated-search] validateSearch must return an object.');
  }

  return result as SearchObject<T>;
}

/**
 * Execute a Standard Schema or custom validator and return its parsed output.
 *
 * @throws {SearchValidationError} When Standard Schema returns `issues`.
 * @throws {Error} When the validator returns a promise.
 * @throws Any value thrown by a custom validator.
 */
export function runSearchValidator<T extends StandardSchemaV1>(
  validator: T,
  input: UnvalidatedSearch,
): InferValidatedSearch<T>;
export function runSearchValidator<Input, Output>(
  validator: (input: Input) => Output,
  input: UnvalidatedSearch,
): SearchObject<Output>;
export function runSearchValidator(
  validator: SearchValidator,
  input: UnvalidatedSearch,
): Record<string, unknown>;
export function runSearchValidator(validator: SearchValidator, input: UnvalidatedSearch): unknown {
  if (!isStandardSchema(validator)) {
    return requireSearchObject(
      requireDefinedResult(requireSynchronousResult(Reflect.apply(validator, undefined, [input]))),
    );
  }

  const result = requireSynchronousResult(
    validator['~standard'].validate(input),
  ) as StandardSchemaV1.Result<unknown>;

  return requireSearchObject(requireDefinedResult(unwrapStandardResult(result, input)));
}
