export default function BookingNotFound() {
  return (
    <div className="min-h-full bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold text-slate-900">Reservas no disponibles</h1>
        <p className="text-slate-500 mt-2 text-sm">
          Este taller no tiene reservas en línea activas o el enlace no es válido.
        </p>
      </div>
    </div>
  );
}
