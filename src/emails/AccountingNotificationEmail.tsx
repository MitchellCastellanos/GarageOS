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
  const previewText = `${shopName} uploaded ${fileCount} new accounting document${fileCount !== 1 ? "s" : ""}`;

  function fmtDate(): string {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date());
  }

  return (
    <ShopEmailLayout
      lang="en"
      previewText={previewText}
      shopName={shopName}
      headerSubtitle="New accounting documents"
      footerText={`This email was sent automatically by ${shopName}'s management system.`}
      showPoweredBy={false}
    >
      <Text style={styles.greeting}>New documents have been uploaded for your review.</Text>

      <Text style={styles.meta}>
        📅 Date: {fmtDate()} · 👤 Uploaded by: {uploaderName}
      </Text>

      <Section style={styles.fileList}>
        {files.map((file, i) => (
          <Section key={i} style={styles.fileRow}>
            <Text style={styles.fileName}>📄 {file.fileName}</Text>
            <Text style={styles.fileCategory}>Category: {file.category}</Text>
            {file.driveUrl && (
              <Link href={file.driveUrl} style={styles.driveLink}>
                View in Google Drive →
              </Link>
            )}
          </Section>
        ))}
      </Section>

      {driveFolderUrl && (
        <Section style={styles.folderSection}>
          <Text style={styles.folderText}>To view all documents for {shopName}:</Text>
          <Link href={driveFolderUrl} style={styles.folderLink}>
            Open Google Drive folder →
          </Link>
        </Section>
      )}
    </ShopEmailLayout>
  );
}

const styles = {
  greeting: { fontSize: "15px", color: "#0f172a", fontWeight: "600", margin: "0 0 8px 0" },
  meta: { fontSize: "12px", color: "#64748b", margin: "0 0 24px 0" },
  fileList: { backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", padding: "16px", marginBottom: "24px" },
  fileRow: { marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid #e2e8f0" },
  fileName: { fontSize: "13px", fontWeight: "600", color: "#0f172a", margin: "0 0 2px 0" },
  fileCategory: { fontSize: "11px", color: "#64748b", margin: "0 0 4px 0" },
  driveLink: { fontSize: "12px", color: "#1d4ed8", textDecoration: "none" },
  folderSection: { backgroundColor: "#eff6ff", borderRadius: "8px", padding: "16px 20px" },
  folderText: { fontSize: "13px", color: "#475569", margin: "0 0 6px 0" },
  folderLink: { fontSize: "14px", fontWeight: "600", color: "#1d4ed8", textDecoration: "none" },
};
