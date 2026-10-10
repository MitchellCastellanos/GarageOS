// Sustitutos de next/cache y next/navigation fuera del runtime de Next.
export class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
export function redirect(url: string): never {
  throw new RedirectError(url);
}
export function revalidatePath() {}
export function revalidateTag() {}
// Outside Next there is no data cache: run the function every time.
export function unstable_cache<T extends (...a: never[]) => unknown>(fn: T): T { return fn; }
export class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}
export function notFound(): never {
  throw new NotFoundError();
}
