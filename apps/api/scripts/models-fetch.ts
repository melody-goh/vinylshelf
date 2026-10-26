/**
 * Downloads the embedding model's weights into apps/api/.models (git-ignored), once per
 * machine and once per catalogue build (ADR 0012 §6). The API itself never downloads.
 *
 *   pnpm --filter @vinylshelf/api models:fetch
 */
import { createModelEmbedder } from '../src/taste/embedder.js';

const embedder = await createModelEmbedder({ allowDownload: true });
const [vector] = await embedder.embed(['warming up']);
console.log(`${embedder.model.id} ready (${String(vector?.length ?? 0)} dimensions)`);
