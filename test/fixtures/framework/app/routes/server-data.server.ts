/**
 * The one module in the fixture that must never reach the browser. React Router
 * keeps a `.server` import out of the client build by dropping the `loader`
 * export and everything only it referenced, and it fails the build outright if
 * anything else still holds on to the import.
 */
export const stockSecret = 'server-only-stock-secret';

export function readStock(page: number) {
  return { page, secret: stockSecret };
}
