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
    <div className="hidden lg:flex lg:w-[58%] xl:w-[60%] relative overflow-hidden bg-brand-navy text-white">
      <Image
        src="/brand/auth-hero.png"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 60vw, 58vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-brand-navy/40" />
      <div className="absolute inset-0 bg-gradient-to-b from-brand-navy/70 via-brand-navy/35 to-brand-navy/90" />
      <div className="absolute inset-0 bg-gradient-to-r from-brand-navy/70 via-transparent to-brand-navy/60" />
      <div className="pointer-events-none absolute -top-24 -left-16 w-80 h-80 rounded-full bg-brand-blue/20 blur-3xl" />

      <div className="relative z-10 flex flex-col justify-center gap-6 h-full w-full p-8 xl:p-12">
        <div className="absolute top-8 left-8 xl:top-12 xl:left-12 flex items-center gap-3">
          <Image src="/brand/mark.png" alt="" width={32} height={32} className="w-8 h-8" />
          <span className="text-lg font-bold">
            Garage<span className="text-brand-blue-bright">OS</span>
          </span>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-400 mb-3">
            HECHO PARA TALLERES INDEPENDIENTES
          </p>
          <h1 className="text-3xl xl:text-4xl font-bold leading-tight mb-3">
            Controla tu taller
            <br />
            con <span className="text-brand-blue-bright">confianza.</span>
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed max-w-lg mb-5">
            GarageOS junta citas, clientes, vehículos, cotizaciones y
            facturación en un solo lugar, para que te enfoques en lo que
            mejor sabes hacer.
          </p>

          <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-brand-blue-bright" />
                </span>
                <span className="text-sm font-medium text-slate-200">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500 mb-3">
            SIMPLE DE USAR. LISTO PARA CRECER.
          </p>
          <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-3">
            {VALUE_PROPS.map(({ title, caption }) => (
              <div key={title}>
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{caption}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
