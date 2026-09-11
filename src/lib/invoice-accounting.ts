import { db } from "@/lib/db";
import { uploadToStorage } from "@/lib/storage";
import { uploadToPaidInvoiceFolder, driveFileUrl } from "@/lib/drive";
import { sendAccountantEmail } from "@/lib/email";
import { shopToEmailConfig } from "@/lib/email-config";

type ArchiveFile = {
  fileName: string;
  buffer: Buffer;
  mimeType: string;
};

export type AccountantArchiveResult =
  | { status: "archived" }
  | { status: "skipped"; reason: string };

/** Archiva factura pagada y adjuntos en Drive (carpeta contadora) y registra en DB. */
export async function archivePaidInvoiceToAccountant(params: {
  shopId: string;
  invoiceId: string;
  invoiceNumber: string;
  uploaderName: string;
  files: ArchiveFile[];
}): Promise<AccountantArchiveResult> {
  const { shopId, invoiceId, invoiceNumber, uploaderName, files } = params;

  if (files.length === 0) return { status: "archived" };

  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) return { status: "archived" };

  const uploadedForEmail: { fileName: string; category: string; driveUrl?: string }[] = [];

  for (const file of files) {
    let storagePath = "";
    try {
      const stored = await uploadToStorage(
        shopId,
        `paid-invoices/${invoiceNumber}`,
        file.fileName,
        file.buffer,
        file.mimeType
      );
      storagePath = stored.storagePath;
    } catch (err) {
      console.error("Supabase backup paid invoice:", err);
    }

    let driveFileId: string | null = null;
    let driveFolderId: string | null = null;
    let driveUrl: string | undefined;

    try {
      const driveResult = await uploadToPaidInvoiceFolder(
        invoiceNumber,
        file.fileName,
        file.buffer,
        file.mimeType
      );
      driveFileId = driveResult.driveFileId;
      driveFolderId = driveResult.driveFolderId;
      driveUrl = driveFileUrl(driveFileId);
    } catch (err) {
      console.error("Drive upload paid invoice:", err);
      if (!storagePath) continue;
    }

    await db.accountingDocument.create({
      data: {
        shopId,
        category: "INVOICES",
        fileName: file.fileName,
        storagePath: storagePath || `paid/${shopId}/${invoiceNumber}/${file.fileName}`,
        driveFileId,
        driveFolderId,
        notes: `Factura pagada ${invoiceNumber} (${invoiceId})`,
      },
    });

    uploadedForEmail.push({
      fileName: file.fileName,
      category: `Facturas pagadas / ${invoiceNumber}`,
      driveUrl,
    });
  }

  try {
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    const driveFolderUrl = rootFolderId
      ? `https://drive.google.com/drive/folders/${rootFolderId}`
      : undefined;

    await sendAccountantEmail({
      shop: shopToEmailConfig(shop),
      uploaderName,
      files: uploadedForEmail,
      driveFolderUrl,
    });
  } catch (err) {
    console.error("Email contadora (factura pagada):", err);
  }

  return { status: "archived" };
}
