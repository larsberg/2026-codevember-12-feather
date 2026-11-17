// Paper grain inherited from 04-tangle-drafting; all annotations live in 3D.
import { CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, RepeatWrapping, Scene, SRGBColorSpace, Vector2 } from 'three';

export function createDrawingPlate() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), noise = ctx.createImageData(128, 128);
  let seed = 104;
  for (let i = 0; i < noise.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noise.data[i] = 64; noise.data[i + 1] = 53; noise.data[i + 2] = 32; noise.data[i + 3] = seed % 9;
  }
  ctx.putImageData(noise, 0, 0);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.minFilter = LinearFilter; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = RepeatWrapping; const size = new Vector2();
  const scene = new Scene(), camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const quad = new Mesh(new PlaneGeometry(2, 2), material); scene.add(quad);
  return {
    render(renderer, settings) {
      if (!settings.shape.construction || !settings.drafting.paper) return;
      renderer.getSize(size); texture.repeat.set(size.x / 128, size.y / 128);
      const auto = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, camera); renderer.autoClear = auto;
    },
    dispose() { texture.dispose(); quad.geometry.dispose(); material.dispose(); },
  };
}
