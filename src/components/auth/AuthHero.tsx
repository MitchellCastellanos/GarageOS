import Image from "next/image";
import { Calendar, Users, Car, FileText, Bell, BarChart3 } from "lucide-react";

const FEATURES = [
  { icon: Calendar, label: "Citas y agenda" },
  { icon: Users, label: "Gestión de clientes" },
  { icon: Car, label: "Historial de vehículos" },
  { icon: FileText, label: "Cotizaciones y facturación" },
  { icon: Bell, label: "Recordatorios de servicio" },
  { icon: BarChart3, label: "Reportes y caja" },
];

const VALUE_PROPS = [
  { title: "Menos papeleo", caption: "Más tiempo en el taller" },
  { title: "Clientes al día", caption: "Recordatorios automáticos" },
  { title: "Todo en un lugar", caption: "Citas, cotizaciones y caja" },
];

// Panel izquierdo de /admin/login y /admin/signup — mismo contenido en
// ambas pantallas, solo cambia el formulario del lado derecho.
export function AuthHero() {
  return (
    <div className="hidden lg:flex lg:w-[46%] xl:w-[42%] relative overflow-hidden bg-brand-navy text-white">
      <div className="absolute inset-0 brand-pattern opacity-[0.08]" />
      <div className="pointer-events-none absolute -top-24 -left-16 w-80 h-80 rounded-full bg-brand-blue/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-96 h-96 rounded-full bg-brand-blue-bright/20 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-b from-brand-navy/40 via-transparent to-brand-navy" />

      <div className="relative z-10 flex flex-col justify-between h-full w-full p-10 xl:p-14">
        <div className="flex items-center gap-3">
          <Image src="/brand/mark.png" alt="" width={36} height={36} className="w-9 h-9" />
          <span className="text-xl font-bold">
            Garage<span className="text-brand-blue-bright">OS</span>
          </span>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-400 mb-4">
            HECHO PARA TALLERES INDEPENDIENTES
          </p>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-5">
            Controla tu taller
            <br />
            con <span className="text-brand-blue-bright">confianza.</span>
          </h1>
          <p className="text-slate-300 text-base leading-relaxed max-w-md mb-8">
            GarageOS junta todo en un solo lugar — citas, clientes, vehículos,
            cotizaciones y facturación. Para que te enfoques en lo que mejor
            sabes hacer.
          </p>

          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-brand-blue-bright" />
                </span>
                <span className="text-sm font-medium text-slate-200">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 mb-5">
            SIMPLE DE USAR. LISTO PARA CRECER.
          </p>
          <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-5">
            {VALUE_PROPS.map(({ title, caption }) => (
              <div key={title}>
                <p className="text-base font-bold text-white">{title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{caption}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
