// Wrapper ESM para electron/binaries.cjs garantindo fonte única de verdade
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const binaries = require('../electron/binaries.cjs');

export const getBinaryPath = binaries.getBinaryPath;
export const setupBinaryEnv = binaries.setupBinaryEnv;
