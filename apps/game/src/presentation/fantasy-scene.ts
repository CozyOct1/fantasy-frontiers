import { getLocalGameAssetUrl } from "./local-game-assets";

/** Layered scenery shared by the lobby and world cards. No flattened background. */
export function createFantasyScene(compact = false, variant = 0, floating = false): HTMLElement {
  const scene = document.createElement("div");
  scene.className = `fantasy-scene ${compact ? "compact" : ""} realm-${variant % 3}`;
  scene.setAttribute("aria-hidden", "true");
  scene.classList.toggle("floating-realm", floating);
  const layer = (className: string) => {
    const element = document.createElement("div");
    element.className = className;
    scene.append(element);
    return element;
  };
  layer("scene-sun");
  layer("scene-mountains far");
  layer("scene-mountains near");
  for (let i = 0; i < 3; i++) layer(`scene-cloud cloud-${i}`);
  layer("scene-valley");
  layer("scene-river");
  layer("scene-island");
  if (floating) { layer("scene-island satellite-one"); layer("scene-island satellite-two"); }
  const sprite = (id: string, className: string) => {
    const image = document.createElement("img");
    image.src = getLocalGameAssetUrl(`ff.realm.${id}`) ?? "";
    image.alt = "";
    image.className = className;
    image.draggable = false;
    scene.append(image);
  };
  for (let i = 0; i < 9; i++) sprite(variant === 1 ? "crystal" : variant === 2 ? "rock" : "tree", `scene-tree tree-${i}`);
  sprite(floating ? "castle" : variant === 1 ? "crystal" : variant === 2 ? "tower-heavy" : "castle", "scene-castle");
  sprite("tower-basic", "scene-watchtower west");
  sprite("tower-heavy", "scene-watchtower east");
  layer("scene-banner banner-west"); layer("scene-banner banner-east");
  for (let i = 0; i < 2; i++) sprite("flame", `scene-torch torch-${i}`);
  layer("scene-magic");
  if (variant === 2) layer("scene-fissure");
  if (variant === 0) for (let i = 0; i < 3; i++) layer(`scene-bird bird-${i}`);
  for (let i = 0; i < (compact ? 4 : 14); i++) {
    const particle = layer("scene-particle");
    particle.style.setProperty("--i", String(i));
  }
  return scene;
}

export function prefersReducedMotion(): boolean {
  return document.documentElement.classList.contains("reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
