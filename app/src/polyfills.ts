// Must be the first import in main.tsx: Solana/Anchor libraries expect a global Buffer.
import { Buffer } from "buffer/";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
