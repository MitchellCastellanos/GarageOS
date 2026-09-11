// Email de notificación a la contadora cuando Carlos sube documentos
// La contadora recibe: qué se subió, qué categoría, link a Drive

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

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
    <Html lang="es">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Heading style={styles.shopName}>{shopName}</Heading>
            <Text style={styles.headerSubtitle}>Nuevos documentos contables</Text>
          </Section>

          {/* Content */}
          <Section style={styles.content}>
            <Text style={styles.greeting}>
              Se han subido nuevos documentos para tu revisión.
            </Text>

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
                <Text style={styles.folderText}>
                  Para ver todos los documentos de {shopName}:
                </Text>
                <Link href={driveFolderUrl} style={styles.folderLink}>
                  Abrir carpeta en Google Drive →
                </Link>
              </Section>
            )}
          </Section>

          {/* Footer */}
          <Section style={styles.footer}>
            <Hr style={styles.hr} />
            <Text style={styles.footerText}>
              Este correo fue enviado automáticamente por el sistema de gestión de {shopName}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: "#f1f5f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    margin: "0",
    padding: "20px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    maxWidth: "560px",
    margin: "0 auto",
    overflow: "hidden",
  },
  header: {
    backgroundColor: "#0f172a",
    padding: "32px 40px",
  },
  shopName: {
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: "700",
    margin: "0 0 4px 0",
  },
  headerSubtitle: {
    color: "#94a3b8",
    fontSize: "13px",
    margin: "0",
  },
  content: {
    padding: "32px 40px",
  },
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
  footer: {
    padding: "0 40px 24px",
  },
  hr: {
    borderColor: "#e2e8f0",
    margin: "0 0 16px 0",
  },
  footerText: {
    fontSize: "11px",
    color: "#94a3b8",
    textAlign: "center" as const,
    margin: "0",
  },
};
