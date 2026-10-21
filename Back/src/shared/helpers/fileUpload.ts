import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request } from "express";

// Dossier racine
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

// Types MIME autorisés
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/mpeg", "video/quicktime", "video/webm"];

// Limites de taille (en octets)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

type FileKind = "images" | "videos";

function getFileKind(mimetype: string): FileKind | null {
    if (ALLOWED_IMAGE_TYPES.includes(mimetype)) return "images";
    if (ALLOWED_VIDEO_TYPES.includes(mimetype)) return "videos";
    return null;
}

// Génère la date du jour au format YYYY-MM-DD
function getDateFolder(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// S'assure que le dossier existe (le crée récursivement sinon)
function ensureDirExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
}
}

// Stockage dynamique : uploads/{kind}/{date}/filename
const storage = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb) => {
    const kind = getFileKind(file.mimetype);
    if (!kind) {
    return cb(new Error("Type de fichier non supporté"), "");
}

const dateFolder = getDateFolder();
const destPath = path.join(UPLOAD_ROOT, kind, dateFolder);

ensureDirExists(destPath);
cb(null, destPath);
},
filename: (req: Request, file: Express.Multer.File, cb) => {
const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
const ext = path.extname(file.originalname);
cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
},
});

// Filtre de validation des fichiers
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
const kind = getFileKind(file.mimetype);
if (!kind) {
return cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`));
}
cb(null, true);
};

// Instance Multer configurée
export const uploadMedia = multer({
storage,
fileFilter,
limits: {
fileSize: MAX_VIDEO_SIZE, // limite max globale, vérification fine après upload
},
});

// Middleware de vérification post-upload (taille selon le type réel)
export function validateUploadedFileSize(req: Request, res: any, next: any) {
const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);

for (const file of files) {
const kind = getFileKind(file.mimetype);
const maxSize = kind === "images" ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;

if (file.size > maxSize) {
fs.unlink(file.path, () => {});
return res.status(400).json({
success: false,
message: `Le fichier "${file.originalname}" dépasse la taille maximale autorisée (${
kind === "images" ? "5MB" : "100MB"
})`,
});
}
}

next();
}

// Supprime un fichier à partir de son chemin relatif (ex: "images/2026-07-09/file-123.jpg")
export function deleteUploadedFile(relativePath: string): void {
const fullPath = path.join(UPLOAD_ROOT, relativePath);
if (fs.existsSync(fullPath)) {
fs.unlinkSync(fullPath);
}
}

// Supprime du disque des fichiers fraîchement uploadés (rollback en cas d'erreur/validation)
export function cleanupUploadedFiles(files: Express.Multer.File[]): void {
for (const file of files) {
fs.unlink(file.path, () => {});
}
}

// Supprime un fichier à partir de son URL publique (ex: "/uploads/images/2026-07-09/file-123.jpg")
export function deleteFileByUrl(url: string): void {
const relativePath = url.replace(/^\/?uploads\//, "");
deleteUploadedFile(relativePath);
}

// Génère l'URL publique complète à partir du chemin absolu du fichier stocké
export function getFileUrl(filePath: string): string {
const relativePath = path.relative(UPLOAD_ROOT, filePath).split(path.sep).join("/");
return `/uploads/${relativePath}`;
}
