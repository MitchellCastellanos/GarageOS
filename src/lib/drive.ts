// Integración Google Drive con Service Account
//
// ¿Por qué Service Account y no OAuth?
// OAuth requiere que el usuario (Carlos) haga login con Google y apruebe permisos.
// Con Service Account: el servidor se autentica solo, sin interacción del usuario.
//
// Setup (una vez, en Google Cloud Console):
// 1. Crear Service Account → descargar JSON key
// 2. Compartir la carpeta de Drive con el email de la Service Account
// 3. Guardar las credenciales en variables de entorno
//
// NUNCA subir las credenciales al repositorio.

import { google } from "googleapis";
import { Readable } from "stream";

function getDriveClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // La private key viene con \n escapados en env vars — restaurar saltos de línea
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Google Drive credentials not configured");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

// Busca o crea una subcarpeta dentro de la carpeta raíz
async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  // Buscar si ya existe
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // Crear si no existe
  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  return folder.data.id!;
}

// Sube un archivo a Google Drive bajo la carpeta de la categoría
// Devuelve el fileId de Drive (para construir el link)
export async function uploadToDrive(
  category: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ driveFileId: string; driveFolderId: string }> {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not set");

  const drive = getDriveClient();

  // Obtener o crear la subcarpeta de la categoría
  const folderId = await getOrCreateFolder(drive, category, rootFolderId);

  // Subir el archivo
  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id",
  });

  return {
    driveFileId: file.data.id!,
    driveFolderId: folderId,
  };
}

// Construye el link de Google Drive a partir del fileId
export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** Carpeta contadora: Facturas pagadas / {invoiceNumber} / archivo */
export const PAID_INVOICES_DRIVE_FOLDER = "Facturas pagadas";

export async function uploadToPaidInvoiceFolder(
  invoiceNumber: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ driveFileId: string; driveFolderId: string }> {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not set");

  const drive = getDriveClient();
  const paidFolderId = await getOrCreateFolder(drive, PAID_INVOICES_DRIVE_FOLDER, rootFolderId);
  const invoiceFolderId = await getOrCreateFolder(drive, invoiceNumber, paidFolderId);

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [invoiceFolderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id",
  });

  return {
    driveFileId: file.data.id!,
    driveFolderId: invoiceFolderId,
  };
}
