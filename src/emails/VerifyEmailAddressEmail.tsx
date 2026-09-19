import { Text, Link } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";

export interface VerifyEmailAddressEmailProps {
  name: string;
  verifyUrl: string;
}

export function VerifyEmailAddressEmail({ name, verifyUrl }: VerifyEmailAddressEmailProps) {
  return (
    <PlatformEmailLayout previewText="Confirma tu correo para GarageOS" headerSubtitle="Confirma tu correo">
      <Text style={s.bodyText}>Hola {name},</Text>
      <Text style={s.bodyText}>
        Confirma que este correo es el tuyo para poder usarlo en el inicio de sesión, recuperación de contraseña y
        notificaciones importantes de tu cuenta.
      </Text>
      <Text style={s.bodyText}>
        <Link
          href={verifyUrl}
          style={{
            display: "inline-block",
            backgroundColor: "#0f172a",
            color: "#ffffff",
            fontWeight: 600,
            padding: "10px 20px",
            borderRadius: "8px",
            textDecoration: "none",
          }}
        >
          Confirmar mi correo
        </Link>
      </Text>
      <Text style={{ ...s.bodyText, fontSize: "12px", color: "#94a3b8" }}>
        Este link vence en 24 horas. Si no reconoces esta cuenta, ignora este correo.
      </Text>
    </PlatformEmailLayout>
  );
}
