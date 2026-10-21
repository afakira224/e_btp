import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { mockRequest, mockResponse } from "../../../helpers/express.mock.js";

// fs est entièrement simulé : aucun accès disque pendant les tests.
vi.mock("fs", () => {
  const fsMock = {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    unlink: vi.fn((_p: string, cb?: () => void) => cb?.()),
  };
  return { default: fsMock, ...fsMock };
});

import fs from "fs";
import {
  cleanupUploadedFiles,
  deleteFileByUrl,
  deleteUploadedFile,
  getFileUrl,
  validateUploadedFileSize,
} from "../../../../src/shared/helpers/fileUpload.js";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

/** Fabrique un faux fichier Multer. */
const makeFile = (over: Partial<Express.Multer.File> = {}): Express.Multer.File =>
  ({
    fieldname: "images",
    originalname: "photo.jpg",
    encoding: "7bit",
    mimetype: "image/jpeg",
    size: 1024,
    destination: path.join(UPLOAD_ROOT, "images", "2026-01-01"),
    filename: "images-123.jpg",
    path: path.join(UPLOAD_ROOT, "images", "2026-01-01", "images-123.jpg"),
    buffer: Buffer.alloc(0),
    stream: null as any,
    ...over,
  }) as Express.Multer.File;

beforeEach(() => {
  vi.mocked(fs.existsSync).mockReturnValue(false);
});

describe("getFileUrl", () => {
  it("construit une URL publique à partir du chemin absolu", () => {
    const abs = path.join(UPLOAD_ROOT, "images", "2026-01-01", "photo.jpg");

    expect(getFileUrl(abs)).toBe("/uploads/images/2026-01-01/photo.jpg");
  });

  it("utilise toujours des slashs, quel que soit le séparateur de la plateforme", () => {
    const abs = path.join(UPLOAD_ROOT, "videos", "2026-02-14", "clip.mp4");

    const url = getFileUrl(abs);

    expect(url).not.toContain("\\");
    expect(url.startsWith("/uploads/")).toBe(true);
  });

  it("gère un fichier placé directement à la racine des uploads", () => {
    expect(getFileUrl(path.join(UPLOAD_ROOT, "seul.png"))).toBe("/uploads/seul.png");
  });
});

describe("deleteUploadedFile", () => {
  it("supprime le fichier quand il existe", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    deleteUploadedFile("images/2026-01-01/photo.jpg");

    expect(fs.unlinkSync).toHaveBeenCalledWith(
      path.join(UPLOAD_ROOT, "images/2026-01-01/photo.jpg")
    );
  });

  it("ne fait rien quand le fichier n'existe pas", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    deleteUploadedFile("images/introuvable.jpg");

    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});

describe("deleteFileByUrl", () => {
  it("convertit une URL publique en chemin disque puis supprime", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    deleteFileByUrl("/uploads/images/2026-01-01/photo.jpg");

    expect(fs.unlinkSync).toHaveBeenCalledWith(
      path.join(UPLOAD_ROOT, "images/2026-01-01/photo.jpg")
    );
  });

  it("accepte une URL sans slash initial", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    deleteFileByUrl("uploads/videos/2026-01-01/clip.mp4");

    expect(fs.unlinkSync).toHaveBeenCalledWith(
      path.join(UPLOAD_ROOT, "videos/2026-01-01/clip.mp4")
    );
  });

  it("ne supprime rien si le fichier ciblé n'existe pas", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    deleteFileByUrl("/uploads/images/absent.jpg");

    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});

describe("cleanupUploadedFiles", () => {
  it("supprime chaque fichier de la liste (rollback)", () => {
    const a = makeFile({ path: "/tmp/a.jpg" });
    const b = makeFile({ path: "/tmp/b.jpg" });

    cleanupUploadedFiles([a, b]);

    expect(fs.unlink).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fs.unlink).mock.calls[0]![0]).toBe("/tmp/a.jpg");
    expect(vi.mocked(fs.unlink).mock.calls[1]![0]).toBe("/tmp/b.jpg");
  });

  it("ne fait rien sur une liste vide", () => {
    cleanupUploadedFiles([]);

    expect(fs.unlink).not.toHaveBeenCalled();
  });
});

describe("validateUploadedFileSize", () => {
  const next = () => vi.fn();

  it("laisse passer une image sous la limite de 5 Mo", () => {
    const req = mockRequest();
    (req as any).files = [makeFile({ size: 4 * 1024 * 1024 })];
    const res = mockResponse();
    const n = next();

    validateUploadedFileSize(req, res, n);

    expect(n).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejette une image au-dessus de 5 Mo avec un message explicite", () => {
    const req = mockRequest();
    (req as any).files = [makeFile({ size: 6 * 1024 * 1024, originalname: "grosse.jpg" })];
    const res = mockResponse();
    const n = next();

    validateUploadedFileSize(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("grosse.jpg");
    expect(res.body.message).toContain("5MB");
  });

  it("supprime du disque le fichier rejeté", () => {
    const req = mockRequest();
    (req as any).files = [makeFile({ size: 6 * 1024 * 1024, path: "/tmp/trop-gros.jpg" })];

    validateUploadedFileSize(req, mockResponse(), next());

    expect(fs.unlink).toHaveBeenCalledWith("/tmp/trop-gros.jpg", expect.any(Function));
  });

  it("laisse passer une vidéo sous la limite de 100 Mo", () => {
    const req = mockRequest();
    (req as any).files = [makeFile({ mimetype: "video/mp4", size: 90 * 1024 * 1024 })];
    const n = next();

    validateUploadedFileSize(req, mockResponse(), n);

    expect(n).toHaveBeenCalledOnce();
  });

  it("rejette une vidéo au-dessus de 100 Mo", () => {
    const req = mockRequest();
    (req as any).files = [
      makeFile({ mimetype: "video/mp4", size: 120 * 1024 * 1024, originalname: "film.mp4" }),
    ];
    const res = mockResponse();

    validateUploadedFileSize(req, res, next());

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("100MB");
  });

  it("gère aussi le cas d'un fichier unique (req.file)", () => {
    const req = mockRequest();
    (req as any).file = makeFile({ size: 6 * 1024 * 1024 });
    const res = mockResponse();

    validateUploadedFileSize(req, res, next());

    expect(res.statusCode).toBe(400);
  });

  it("appelle next() quand aucun fichier n'est envoyé", () => {
    const n = next();

    validateUploadedFileSize(mockRequest(), mockResponse(), n);

    expect(n).toHaveBeenCalledOnce();
  });

  it("s'arrête au premier fichier trop volumineux", () => {
    const req = mockRequest();
    (req as any).files = [
      makeFile({ size: 6 * 1024 * 1024, originalname: "premier.jpg" }),
      makeFile({ size: 7 * 1024 * 1024, originalname: "second.jpg" }),
    ];
    const res = mockResponse();

    validateUploadedFileSize(req, res, next());

    expect(res.body.message).toContain("premier.jpg");
    expect(res.json).toHaveBeenCalledOnce();
  });

  // Comportement actuel : un mimetype inconnu (normalement filtre par multer en amont)
  // retombe sur la limite video de 100 Mo. Le test documente cette tolerance.
  it("applique la limite vidéo à un type inconnu qui aurait franchi le filtre", () => {
    const req = mockRequest();
    (req as any).files = [makeFile({ mimetype: "application/pdf", size: 6 * 1024 * 1024 })];
    const n = next();

    validateUploadedFileSize(req, mockResponse(), n);

    expect(n).toHaveBeenCalledOnce();
  });
});
