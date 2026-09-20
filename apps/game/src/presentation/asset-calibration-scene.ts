import Phaser from "phaser";
import { resolveWorldAssets } from "./world-asset-registry";
import type { WorldAssetName } from "./world-asset-contract";
import { ISOMETRIC_DEPTH } from "./isometric-render-contract";

export function mountAssetCalibrationPage(worldId = "frontier-outpost"): void {
  const assets = resolveWorldAssets(worldId);
  const host = document.createElement("main");
  host.id = "asset-calibration-root";
  host.setAttribute("aria-label", "World Asset Calibration");
  document.body.append(host);
  class AssetCalibrationScene extends Phaser.Scene {
    preload(): void { for (const name of Object.keys(assets.manifest.assets) as WorldAssetName[]) this.load.image(assets.textureKey(name), assets.assetUrl(name)); }
    create(): void {
      this.cameras.main.setBackgroundColor("#101817");
      const names = Object.keys(assets.manifest.assets) as WorldAssetName[];
      const tileWidth = 92; const tileHeight = 52; const cellWidth = 250; const cellHeight = 180;
      names.forEach((name, index) => {
        const column = index % 4; const row = Math.floor(index / 4);
        const groundX = 135 + column * cellWidth; const groundY = 190 + row * cellHeight;
        const metadata = assets.manifest.render[name]; const graphics = this.add.graphics().setDepth(ISOMETRIC_DEPTH.debug);
        graphics.lineStyle(1, 0x508c82, 1).strokePoints([
          new Phaser.Geom.Point(groundX, groundY - tileHeight / 2), new Phaser.Geom.Point(groundX + tileWidth / 2, groundY),
          new Phaser.Geom.Point(groundX, groundY + tileHeight / 2), new Phaser.Geom.Point(groundX - tileWidth / 2, groundY),
        ], true);
        const footprintW = tileWidth * metadata.footprintWidthTiles; const footprintH = tileHeight * metadata.footprintHeightTiles;
        graphics.lineStyle(1, 0x64e98a, .9).strokePoints([
          new Phaser.Geom.Point(groundX, groundY - footprintH / 2), new Phaser.Geom.Point(groundX + footprintW / 2, groundY),
          new Phaser.Geom.Point(groundX, groundY + footprintH / 2), new Phaser.Geom.Point(groundX - footprintW / 2, groundY),
        ], true);
        const displaySize = tileHeight * metadata.scale;
        const depth = ISOMETRIC_DEPTH.objectBase + groundY + metadata.depthBias;
        const sprite = this.add.image(groundX, groundY, assets.textureKey(name)).setOrigin(metadata.originX, metadata.originY).setDisplaySize(displaySize, displaySize).setDepth(depth);
        const bounds = sprite.getBounds();
        graphics.lineStyle(1, 0xff607d, .95).strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        graphics.fillStyle(0xffdf68, 1).fillCircle(groundX, groundY, 4);
        this.add.text(groundX - 105, groundY + 35, `${name}\nscale ${metadata.scale} · origin ${metadata.originX},${metadata.originY}\nfootprint ${metadata.footprintWidthTiles}×${metadata.footprintHeightTiles} · y ${groundY} · depth ${depth}`, { color: "#e9eee8", fontFamily: "monospace", fontSize: "11px", lineSpacing: 2 }).setDepth(ISOMETRIC_DEPTH.debug);
      });
    }
  }
  new Phaser.Game({ type: Phaser.AUTO, parent: host, width: 1080, height: 980, backgroundColor: "#101817", scene: [AssetCalibrationScene], scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } });
}
