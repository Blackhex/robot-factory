import type { Page } from '@playwright/test'
import type { ItemInstancePositions, SceneItemMeshes } from '../../types'

const ITEM_MESH_Y = 0.15
const ITEM_MESH_RADIUS = 0.1

const ITEM_INSTANCE_TRAVERSAL_SRC = `
function forEachItemInstance(scene, cb) {
  scene.traverse((obj) => {
    if (!obj.isInstancedMesh) return;
    const geom = obj.geometry;
    const params = geom && geom.parameters;
    const isItemGeometry =
      geom && geom.type === 'SphereGeometry' &&
      params &&
      Math.abs(params.radius - ${ITEM_MESH_RADIUS}) < 1e-6;
    if (!isItemGeometry) return;
    const count = obj.count;
    const arr = obj.instanceMatrix && obj.instanceMatrix.array;
    cb({ obj: obj, count: count, arr: arr, itemY: ${ITEM_MESH_Y} });
  });
}
`

const ITEM_INSTANCE_POSITION_READER_SRC = `
${ITEM_INSTANCE_TRAVERSAL_SRC}
function readItemInstancePositionsFromScene() {
  const sm = window.__sceneManager;
  const scene = sm && sm.getScene && sm.getScene();
  if (!scene) return { totalCount: 0, sumX: 0, sumZ: 0, positions: [] };
  const positions = [];
  let sumX = 0;
  let sumZ = 0;
  forEachItemInstance(scene, function (ctx) {
    const count = ctx.count;
    const arr = ctx.arr;
    const itemY = ctx.itemY;
    if (!arr) return;
    for (let i = 0; i < count; i++) {
      const y = arr[i * 16 + 13];
      if (Math.abs(y - itemY) > 1e-3) continue;
      const x = arr[i * 16 + 12];
      const z = arr[i * 16 + 14];
      positions.push({ x: x, z: z });
      sumX += x;
      sumZ += z;
    }
  });
  return { totalCount: positions.length, sumX: sumX, sumZ: sumZ, positions: positions };
}
`

export class ItemInstanceProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async readSceneItemMeshes(): Promise<SceneItemMeshes> {
    return this.page.evaluate(`(() => {
      ${ITEM_INSTANCE_TRAVERSAL_SRC}
      const sm = window.__sceneManager;
      const scene = sm && sm.getScene && sm.getScene();
      if (!scene) return { totalCount: -1, meshes: [] };
      const meshes = [];
      let totalCount = 0;
      forEachItemInstance(scene, function (ctx) {
        const count = ctx.count;
        const arr = ctx.arr;
        const itemY = ctx.itemY;
        let instancesAtItemY = 0;
        if (arr) {
          for (let i = 0; i < count; i++) {
            if (Math.abs(arr[i * 16 + 13] - itemY) < 1e-3) instancesAtItemY++;
          }
        } else {
          instancesAtItemY = count;
        }
        meshes.push({ count: count, instancesAtItemY: instancesAtItemY });
        totalCount += count;
      });
      return { totalCount: totalCount, meshes: meshes };
    })()`) as Promise<SceneItemMeshes>
  }

  async readItemInstancePositions(): Promise<ItemInstancePositions> {
    return this.page.evaluate(`(() => {
      ${ITEM_INSTANCE_POSITION_READER_SRC}
      return readItemInstancePositionsFromScene();
    })()`) as Promise<ItemInstancePositions>
  }

  async capturePositionsAcrossPause(): Promise<{
    before: ItemInstancePositions
    after: ItemInstancePositions
  }> {
    return this.page.evaluate(`(() => {
      ${ITEM_INSTANCE_POSITION_READER_SRC}
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          const before = readItemInstancePositionsFromScene();
          const btn = document.querySelector('.ui-toolbar-btn--pause');
          if (btn) btn.click();
          requestAnimationFrame(function () {
            const after = readItemInstancePositionsFromScene();
            resolve({ before: before, after: after });
          });
        });
      });
    })()`) as Promise<{ before: ItemInstancePositions; after: ItemInstancePositions }>
  }
}