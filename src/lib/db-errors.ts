// P2034: Postgres abortó la transacción por un conflicto de escritura bajo
// aislamiento Serializable — dos escrituras concurrentes compitiendo por el
// mismo recurso (ver docs/domain-model.md invariante 8, doble-booking de
// citas). Se trata como el mismo caso que un conflicto detectado por lectura.
export function isTransactionConflictError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2034";
}
