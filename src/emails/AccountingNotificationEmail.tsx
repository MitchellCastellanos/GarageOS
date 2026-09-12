// Email de notificación a la contadora cuando el dueño sube documentos
// La contadora recibe: qué se subió, qué categoría, link a Drive

import { Link, Section, Text } from "@react-email/components";
import { ShopEmailLayout } from "@/emails/layout/ShopEmailLayout";

interface UploadedFile {
  fileName: string;
  category: string;
  driveUrl?: string;
}

interface AccountingNotificationEmailProps {
  shopName: string;
  uploaderName: string;
  files: UploadedFile[];
  driveFolderUrl?: string;
}

export function AccountingNotificationEmail({
  shopName,
  uploaderName,
  files,
  driveFolderUrl,
}: AccountingNotificationEmailProps) {
  const fileCount = files.length;
  const previewText = `${shopName} subió ${fileCount} documento${fileCount !== 1 ? "s" : ""} contable${fileCount !== 1 ? "s" : ""}`;

  function fmtDate(): string {
    const now = new Date();
    const months = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    return `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
  }

  return (
    <ShopEmailLayout
      lang="es"
      previewText={previewText}
      shopName={shopName}
      headerSubtitle="Nuevos documentos contables"
      footerText={`Este correo fue enviado automáticamente por el sistema de gestión de ${shopName}.`}
      showPoweredBy={false}
    >
      <Text style={styles.greeting}>Se han subido nuevos documentos para tu revisión.</Text>

      <Text style={styles.meta}>
        📅 Fecha: {fmtDate()} · 👤 Subido por: {uploaderName}
      </Text>

      {/* File list */}
      <Section style={styles.fileList}>
        {files.map((file, i) => (
          <Section key={i} style={styles.fileRow}>
            <Text style={styles.fileName}>📄 {file.fileName}</Text>
            <Text style={styles.fileCategory}>Categoría: {file.category}</Text>
            {file.driveUrl && (
              <Link href={file.driveUrl} style={styles.driveLink}>
                Ver en Google Drive →
              </Link>
            )}
          </Section>
        ))}
      </Section>

      {/* Drive folder link */}
      {driveFolderUrl && (
        <Section style={styles.folderSection}>
          <Text style={styles.folderText}>Para ver todos los documentos de {shopName}:</Text>
          <Link href={driveFolderUrl} style={styles.folderLink}>
            Abrir carpeta en Google Drive →
          </Link>
        </Section>
      )}
    </ShopEmailLayout>
  );
}

const styles = {
  greeting: {
    fontSize: "15px",
    color: "#0f172a",
    fontWeight: "600",
    margin: "0 0 8px 0",
  },
  meta: {
    fontSize: "12px",
    color: "#64748b",
    margin: "0 0 24px 0",
  },
  fileList: {
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    padding: "16px",
    marginBottom: "24px",
  },
  fileRow: {
    marginBottom: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid #e2e8f0",
  },
  fileName: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#0f172a",
    margin: "0 0 2px 0",
  },
  fileCategory: {
    fontSize: "11px",
    color: "#64748b",
    margin: "0 0 4px 0",
  },
  driveLink: {
    fontSize: "12px",
    color: "#1d4ed8",
    textDecoration: "none",
  },
  folderSection: {
    backgroundColor: "#eff6ff",
    borderRadius: "8px",
    padding: "16px 20px",
  },
  folderText: {
    fontSize: "13px",
    color: "#475569",
    margin: "0 0 6px 0",
  },
  folderLink: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#1d4ed8",
    textDecoration: "none",
  },
};
