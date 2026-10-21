import { vi } from "vitest";

// ─────────────────────────────────────────────
//  Mock global du logger Winston.
//  Évite le bruit en console et la création du dossier logs/ pendant les tests.
//  Les contrôleurs importent "../shared/logger/logger.js" : l'alias @src pointe
//  sur le même fichier résolu, donc le mock s'applique partout.
// ─────────────────────────────────────────────
vi.mock("@src/shared/logger/logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
  },
}));

process.env.NODE_ENV = "test";
