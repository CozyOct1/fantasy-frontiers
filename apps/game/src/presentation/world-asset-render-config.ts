import type { WorldAssetManifest } from "@fantasy-frontiers/shared";
import { ISOMETRIC_DEPTH } from "./isometric-render-contract";

export type WorldAssetRenderConfig = WorldAssetManifest["render"];
export const WORLD_VISUAL_DEPTH = ISOMETRIC_DEPTH;
