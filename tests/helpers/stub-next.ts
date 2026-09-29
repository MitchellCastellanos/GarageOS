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
