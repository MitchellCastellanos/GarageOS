/** Nombre para mostrar: siempre firstName + lastName (sin invertir). Empresas pueden omitir lastName. */
export function formatClientName(client: {
  firstName: string;
  lastName?: string | null;
}): string {
  const first = client.firstName.trim();
  const last = client.lastName?.trim();
  if (!last) return first;
  return `${first} ${last}`;
}
