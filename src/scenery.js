import * as THREE from 'three';
import {
  COURSE,
  createDistantMountains,
  DISTANT_MOUNTAIN_CONFIGS,
  distantMountainRidgeAt,
  normalAtCourse,
  pointAt,
  tangentAt,
  rightAt,
  vistaAmountAt,
  wallInfoAt,
} from './course.js';
import { ACTIVE_STAGE, isTunnelAt, seededRandom } from './stage.js';
import { ACTIVE_TRACK } from './track-manifest.js';


const TMP_POINT = new THREE.Vector3();
const TMP_NORMAL = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_MATRIX = new THREE.Matrix4();
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const BASE_STAGE_LENGTH = 1500;
const TREE_ATLAS_WIDTH = 3157;
const TREE_ATLAS_HEIGHT = 1024;
// The source atlas is not a regular sprite sheet. Each photographed tree has
// a different crop width, so equal-width UV cells cut several trunks in half.
// These boundaries sit in the transparent valleys between the seven trees.
const TREE_ATLAS_RANGES = [
  [0, 496],
  [496, 934],
  [934, 1471],
  [1471, 1980],
  [1980, 2441],
  [2441, 2733],
  [2733, TREE_ATLAS_WIDTH],
];
const SNOWY_TREE_VARIANTS = [0, 1, 2, 4, 6];
const TREE_ATLAS_URL = new URL('../textures/tree/tree-atlas.png', import.meta.url).href;
const TREE_ATLAS_NORMAL_URL = new URL('../textures/tree/tree-atlas-normal.png', import.meta.url).href;
const ROCK_COLOR_URL = new URL('../textures/rock/rock-color.png', import.meta.url).href;
const ROCK_NORMAL_URL = new URL('../textures/rock/rock-normal.png', import.meta.url).href;
const ROCK_ROUGHNESS_URL = new URL('../textures/rock/rock-roughness.png', import.meta.url).href;

function createTreeCardGeometry(atlasColumn) {
  const height = 5.55;
  const [cropStart, cropEnd] = TREE_ATLAS_RANGES[atlasColumn];
  const inset = 1;
  const u0 = (cropStart + inset) / TREE_ATLAS_WIDTH;
  const u1 = (cropEnd - inset) / TREE_ATLAS_WIDTH;
  const halfWidth = height * ((cropEnd - cropStart) / TREE_ATLAS_HEIGHT) * 0.5;
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -halfWidth, 0, 0, halfWidth, 0, 0, halfWidth, height, 0, -halfWidth, height, 0,
    0, 0, -halfWidth, 0, 0, halfWidth, 0, height, halfWidth, 0, height, -halfWidth,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    u0, 0, u1, 0, u1, 1, u0, 1,
    u0, 0, u1, 0, u1, 1, u0, 1,
  ], 2));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function placeUpright(dummy, s, d, yOffset, scaleX, scaleY, scaleZ, yaw = 0) {
  pointAt(s, d, TMP_POINT);
  dummy.position.copy(TMP_POINT);
  dummy.position.y += yOffset;
  dummy.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  dummy.scale.set(scaleX, scaleY, scaleZ);
  dummy.updateMatrix();
}

function placeOnSlope(dummy, s, d, yOffset, scaleX, scaleY, scaleZ, yaw = 0) {
  pointAt(s, d, TMP_POINT);
  normalAtCourse(s, d, TMP_NORMAL);
  TMP_FORWARD.set(Math.sin(yaw), 0, Math.cos(yaw));
  TMP_FORWARD.addScaledVector(TMP_NORMAL, -TMP_FORWARD.dot(TMP_NORMAL)).normalize();
  TMP_RIGHT.crossVectors(TMP_NORMAL, TMP_FORWARD).normalize();
  TMP_MATRIX.makeBasis(TMP_RIGHT, TMP_NORMAL, TMP_FORWARD);
  TMP_QUAT.setFromRotationMatrix(TMP_MATRIX);

  dummy.position.copy(TMP_POINT).addScaledVector(TMP_NORMAL, yOffset);
  dummy.quaternion.copy(TMP_QUAT);
  dummy.scale.set(scaleX, scaleY, scaleZ);
  dummy.updateMatrix();
}

function createRockMaterials(maxAnisotropy = 1) {
  const loader = new THREE.TextureLoader();
  const colorMap = loader.load(ROCK_COLOR_URL);
  const normalMap = loader.load(ROCK_NORMAL_URL);
  const roughnessMap = loader.load(ROCK_ROUGHNESS_URL);
  for (const texture of [colorMap, normalMap, roughnessMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(maxAnisotropy, 8);
  }
  colorMap.colorSpace = THREE.SRGBColorSpace;

  const common = {
    map: colorMap,
    normalMap,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughnessMap,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  };
  return {
    object: new THREE.MeshStandardMaterial({
      ...common,
      color: 0xaeb5b8,
      vertexColors: true,
    }),
    exterior: new THREE.MeshStandardMaterial({
      ...common,
      color: 0x929a9e,
      side: THREE.DoubleSide,
    }),
    interior: new THREE.MeshStandardMaterial({
      ...common,
      color: 0x465158,
      normalScale: new THREE.Vector2(0.3, 0.3),
      side: THREE.DoubleSide,
    }),
  };
}

function createTrees({ groomedCourse = false, maxAnisotropy = 1 } = {}) {
  const rand = seededRandom(ACTIVE_STAGE.seeds.trees);
  const variantRand = seededRandom(ACTIVE_STAGE.seeds.trees ^ 0x5f3759df);
  const lengthScale = COURSE.length / BASE_STAGE_LENGTH;
  const nearCount = Math.round(390 * ACTIVE_STAGE.scenery.nearTreeScale * lengthScale);
  const sideCount = Math.round(850 * ACTIVE_STAGE.scenery.sideTreeScale * lengthScale);
  const total = nearCount + sideCount;

  const loader = new THREE.TextureLoader();
  const treeAtlas = loader.load(TREE_ATLAS_URL);
  const treeAtlasNormal = loader.load(TREE_ATLAS_NORMAL_URL);
  treeAtlas.colorSpace = THREE.SRGBColorSpace;
  treeAtlas.anisotropy = Math.min(maxAnisotropy, 8);
  treeAtlasNormal.anisotropy = Math.min(maxAnisotropy, 8);
  const crownMat = new THREE.MeshStandardMaterial({
    map: treeAtlas,
    normalMap: treeAtlasNormal,
    normalScale: new THREE.Vector2(0.16, 0.16),
    // Preserve the atlas' antialiased alpha fringe instead of cutting every
    // needle at a hard threshold. A very low cutoff only rejects effectively
    // invisible pixels; normal blending softens the remaining silhouette.
    transparent: true,
    alphaTest: 0.06,
    alphaToCoverage: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    roughness: 0.94,
    metalness: 0,
  });
  const dummy = new THREE.Object3D();
  const positions = [];
  const treeRecords = [];

  for (let i = 0; i < total; i++) {
    let s = 28 + rand() * (COURSE.length - 48);
    for (let retry = 0; retry < 24 && isTunnelAt(s, 10); retry++) {
      s = 28 + rand() * (COURSE.length - 48);
    }
    if (isTunnelAt(s, 10)) {
      continue;
    }
    const side = rand() < 0.5 ? -1 : 1; // -1 left, +1 right in course coordinates
    const wall = wallInfoAt(s);
    const vista = vistaAmountAt(s);
    const shoulder = side < 0 ? wall.leftShoulder : wall.rightShoulder;
    const wallStrength = side < 0 ? wall.leftStrength : wall.rightStrength;

    let lateral;
    let scale;
    if (i < nearCount) {
      const r = rand();
      if (vista > 0.55 && r < 0.34) {
        // A vista is a broad overlook, not a completely empty sound stage.
        // Small clusters on the low outer shoulder soften the transition into
        // the distant mountains and hide their extreme edges on wide screens.
        lateral = shoulder + 0.8 + rand() * 9.5;
      } else if (!groomedCourse && r < ACTIVE_STAGE.scenery.nearTreeBias && vista < 0.55) {
        // Edge trees sit just inside the snow shoulder. They are intentionally
        // close enough to whip through peripheral vision during a fast carve.
        lateral = Math.max(6.8, shoulder - (3.5 + rand() * 7.5));
      } else if (r < 0.78) {
        // Most trees climb the bank itself.
        lateral = shoulder + 1.5 + rand() * (20 + vista * 22);
      } else {
        lateral = Math.min(COURSE.renderHalfWidth - 5, shoulder + 28 + rand() * 42);
      }
      scale = 1.08 + rand() * 1.18;
    } else {
      lateral = Math.min(
        COURSE.renderHalfWidth - 4,
        Math.max(shoulder + 34, 48) + rand() * (54 + vista * 18)
      );
      scale = 0.92 + rand() * 1.02;
    }

    // Never place near-world objects outside the rendered terrain ribbon.
    lateral = Math.min(COURSE.renderHalfWidth - 4, lateral);
    const d = side * lateral;
    const densityScale = THREE.MathUtils.lerp(0.85, 1.12, wallStrength);
    const treeScale = scale * densityScale;
    const yaw = (rand() - 0.5) * 0.5;

    // The photographed silhouette already includes its own trunk. A separate
    // cylinder cannot follow every leaning source tree and causes a visible
    // double trunk, so the card is now the complete tree.
    placeUpright(dummy, s, d, 0.03, treeScale, treeScale, treeScale, yaw);
    const crownMatrix = dummy.matrix.clone();
    const variant = SNOWY_TREE_VARIANTS[
      Math.floor(variantRand() * SNOWY_TREE_VARIANTS.length)
    ];
    treeRecords.push({ crownMatrix, variant });

    if (!groomedCourse && i < nearCount && lateral < shoulder - 0.8) {
      pointAt(s, d, TMP_POINT);
      positions.push({ type: 'tree', x: TMP_POINT.x, z: TMP_POINT.z, radius: 0.58 * treeScale, s, d });
    }
  }

  const group = new THREE.Group();
  for (const variant of SNOWY_TREE_VARIANTS) {
    const records = treeRecords.filter((record) => record.variant === variant);
    if (records.length === 0) continue;
    const crowns = new THREE.InstancedMesh(
      createTreeCardGeometry(variant),
      crownMat,
      records.length
    );
    records.forEach((record, index) => crowns.setMatrixAt(index, record.crownMatrix));
    crowns.instanceMatrix.needsUpdate = true;
    crowns.frustumCulled = false;
    crowns.renderOrder = 1;
    group.add(crowns);
  }
  return { group, positions };
}

function createRocks({ groomedCourse = false, material } = {}) {
  if (groomedCourse) return { mesh: new THREE.Group(), positions: [] };
  const rand = seededRandom(ACTIVE_STAGE.seeds.rocks);
  const colorRand = seededRandom(ACTIVE_STAGE.seeds.rocks ^ 0x27d4eb2d);
  const count = Math.round(
    68 * ACTIVE_STAGE.scenery.rockScale * COURSE.length / BASE_STAGE_LENGTH
  );
  const geometry = new THREE.DodecahedronGeometry(0.9, 0);
  const normals = geometry.getAttribute('normal');
  const rockBase = new THREE.Color(0xb5babd);
  const snowTop = new THREE.Color(0xf1f7f8);
  const vertexColors = [];
  for (let i = 0; i < normals.count; i++) {
    const snowAmount = THREE.MathUtils.smoothstep(normals.getY(i), 0.28, 0.78);
    const color = rockBase.clone().lerp(snowTop, snowAmount * 0.82);
    vertexColors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const positions = [];

  for (let i = 0; i < count; i++) {
    let s = 45 + rand() * (COURSE.length - 75);
    for (let retry = 0; retry < 18 && isTunnelAt(s, 5); retry++) {
      s = 45 + rand() * (COURSE.length - 75);
    }
    if (isTunnelAt(s, 5)) {
      dummy.position.set(0, -1000, 0); dummy.scale.setScalar(0); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      continue;
    }
    const side = rand() < 0.5 ? -1 : 1;
    const wall = wallInfoAt(s);
    const vista = wall.vista;
    const shoulder = side < 0 ? wall.leftShoulder : wall.rightShoulder;
    // Rocks belong on the run or at the foot of a bank, not pasted high on
    // the snow wall. Keep every rock just inside the shoulder.
    const inside = 2.0 + rand() * Math.min(12, Math.max(4, shoulder - 4));
    const lateral = Math.max(6.5, shoulder - inside);
    const d = side * lateral;
    const scale = 0.45 + rand() * 1.65;

    placeOnSlope(
      dummy,
      s,
      d,
      0.42 * scale,
      scale * (0.8 + rand() * 0.5),
      scale,
      scale * (0.8 + rand() * 0.5),
      rand() * Math.PI
    );
    mesh.setMatrixAt(i, dummy.matrix);
    const tint = 0.88 + colorRand() * 0.12;
    mesh.setColorAt(i, new THREE.Color(tint * 0.94, tint * 0.98, tint));

    if (lateral < shoulder + 4) {
      pointAt(s, d, TMP_POINT);
      positions.push({ type: 'rock', x: TMP_POINT.x, z: TMP_POINT.z, radius: 0.7 * scale, s, d });
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh, positions };
}


function createTunnels({ snowMaterial, rockMaterial, interiorRockMaterial }) {
  const group = new THREE.Group();

  // Find the point on each snow bank where the surface reaches the desired
  // roof height. The tunnel shell joins those actual terrain surfaces rather
  // than spanning arbitrary lateral positions.
  function findWallJoin(s, side, targetY, shoulder) {
    let bestD = side * Math.min(COURSE.renderHalfWidth - 3, shoulder + 8);
    let bestY = -Infinity;
    const start = shoulder + 1.5;
    const end = COURSE.renderHalfWidth - 2.8;
    for (let lateral = start; lateral <= end; lateral += 0.65) {
      const d = side * lateral;
      pointAt(s, d, TMP_NORMAL);
      bestD = d;
      bestY = TMP_NORMAL.y;
      if (TMP_NORMAL.y >= targetY) break;
    }
    return { d: bestD, y: bestY };
  }

  for (const tunnel of ACTIVE_STAGE.tunnels || []) {
    const step = 3.0;
    const sections = Math.max(8, Math.ceil((tunnel.end - tunnel.start) / step) + 1);
    const across = 13;
    const vertices = [];
    const uvs = [];
    const interiorIndices = [];
    const snowIndices = [];
    const rockIndices = [];

    for (let i = 0; i < sections; i++) {
      const t = i / (sections - 1);
      const s = THREE.MathUtils.lerp(tunnel.start, tunnel.end, t);
      const wall = wallInfoAt(s);
      pointAt(s, 0, TMP_POINT);
      const centerGround = TMP_POINT.y;

      // Tie the ceiling to a physical height above the run. Search outward
      // until each side bank reaches that height, then span those join points.
      const targetEdgeY = centerGround + tunnel.roofHeight;
      const leftJoin = findWallJoin(s, -1, targetEdgeY, wall.leftShoulder);
      const rightJoin = findWallJoin(s, 1, targetEdgeY, wall.rightShoulder);
      const edgeBase = Math.max(targetEdgeY, Math.min(leftJoin.y, rightJoin.y));
      const archHeight = tunnel.roofArch + 1.3;
      const thickness = 4.8;

      for (let j = 0; j < across; j++) {
        const u = j / (across - 1);
        const d = THREE.MathUtils.lerp(leftJoin.d, rightJoin.d, u);
        pointAt(s, d, TMP_NORMAL);

        const edgeY = THREE.MathUtils.lerp(leftJoin.y, rightJoin.y, u);
        const arch = Math.pow(Math.sin(u * Math.PI), 0.78);
        const lowerY = Math.max(edgeY + 0.10, edgeBase + arch * archHeight);
        const upperY = lowerY + thickness + arch * 1.1;

        vertices.push(TMP_NORMAL.x, lowerY, TMP_NORMAL.z); // underside
        vertices.push(TMP_NORMAL.x, upperY, TMP_NORMAL.z); // outer snow mass
        const alongUv = (s - tunnel.start) / 6;
        const acrossUv = (d - leftJoin.d) / 6;
        uvs.push(alongUv, acrossUv, alongUv, acrossUv);
      }
    }

    const stride = across * 2;
    const v = (i, j, layer) => i * stride + j * 2 + layer;

    for (let i = 0; i < sections - 1; i++) {
      for (let j = 0; j < across - 1; j++) {
        const l00=v(i,j,0), l01=v(i,j+1,0), l10=v(i+1,j,0), l11=v(i+1,j+1,0);
        const u00=v(i,j,1), u01=v(i,j+1,1), u10=v(i+1,j,1), u11=v(i+1,j+1,1);
        interiorIndices.push(l00,l01,l10, l01,l11,l10); // tunnel ceiling
        snowIndices.push(u00,u10,u01, u01,u10,u11);     // snow top
      }
    }

    // Solid side seams at the exact wall-join curves.
    for (let i = 0; i < sections - 1; i++) {
      for (const j of [0, across - 1]) {
        const a=v(i,j,0), b=v(i+1,j,0), c=v(i,j,1), d=v(i+1,j,1);
        rockIndices.push(a,b,c, c,b,d);
      }
    }

    // Keep the longitudinal end faces limited to the true roof thickness. The
    // entrance facade below supplies the readable front silhouette.
    const duplicateEndVertex = (sourceIndex) => {
      const source = sourceIndex * 3;
      const x = vertices[source];
      const y = vertices[source + 1];
      const z = vertices[source + 2];
      const duplicate = vertices.length / 3;
      vertices.push(x, y, z);
      // End faces need a frontal projection. Reusing the shell's longitudinal
      // UV makes every vertex at one end share the same U and collapses the
      // rock texture into vertical bars.
      uvs.push(x / 6, y / 6);
      return duplicate;
    };
    for (const i of [0, sections - 1]) {
      for (let j = 0; j < across - 1; j++) {
        const a=v(i,j,0), b=v(i,j+1,0), c=v(i,j,1), d=v(i,j+1,1);
        rockIndices.push(
          duplicateEndVertex(a), duplicateEndVertex(c), duplicateEndVertex(b),
          duplicateEndVertex(b), duplicateEndVertex(c), duplicateEndVertex(d)
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex([...interiorIndices, ...snowIndices, ...rockIndices]);
    geometry.addGroup(0, interiorIndices.length, 0);
    geometry.addGroup(interiorIndices.length, snowIndices.length, 1);
    geometry.addGroup(interiorIndices.length + snowIndices.length, rockIndices.length, 2);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, [interiorRockMaterial, snowMaterial, rockMaterial]);
    mesh.frustumCulled = true;
    group.add(createTunnelEntrancePortal(tunnel, rockMaterial, interiorRockMaterial));
    group.add(mesh);
  }
  return group;
}

function createTunnelEntrancePortal(tunnel, rockMaterial, interiorRockMaterial) {
  const sFront = tunnel.start + 1.5;
  const wall = wallInfoAt(sFront);
  pointAt(sFront, 0, TMP_POINT);
  const centerGround = TMP_POINT.y;

  const maxShoulder = Math.max(wall.leftShoulder, wall.rightShoulder);
  const minShoulder = Math.min(wall.leftShoulder, wall.rightShoulder);
  const outerHalf = THREE.MathUtils.clamp(maxShoulder + 15, 18, COURSE.renderHalfWidth - 5);
  const holeHalf = THREE.MathUtils.clamp(minShoulder - 1.6, 6.8, outerHalf - 5.5);

  pointAt(sFront, -outerHalf, TMP_NORMAL);
  const leftWallTop = Math.max(5.5, TMP_NORMAL.y - centerGround + 1.8);
  pointAt(sFront, outerHalf, TMP_NORMAL);
  const rightWallTop = Math.max(5.5, TMP_NORMAL.y - centerGround + 1.8);

  const crownHeight = Math.max(leftWallTop, rightWallTop, tunnel.roofHeight + tunnel.roofArch + 4.8);
  // Keep the narrow bridge required by Shape triangulation below the course.
  // At y=0 it becomes a visible rock threshold across the rideable opening.
  const outerBase = -3.2;
  const holeBase = -3.0;
  const holeShoulder = Math.max(3.6, tunnel.roofHeight * 0.58);
  const holeCrown = Math.min(crownHeight - 1.55, tunnel.roofHeight + tunnel.roofArch * 1.05 + 1.0);
  const depth = Math.min(11, Math.max(7, (tunnel.end - tunnel.start) * 0.10));

  const shape = new THREE.Shape();
  shape.moveTo(-outerHalf, outerBase);
  shape.lineTo(-outerHalf, leftWallTop * 0.34);
  shape.quadraticCurveTo(-outerHalf * 0.96, leftWallTop * 0.90, -outerHalf * 0.74, leftWallTop);
  shape.quadraticCurveTo(-outerHalf * 0.32, crownHeight * 0.98, 0, crownHeight);
  shape.quadraticCurveTo(outerHalf * 0.32, crownHeight * 0.98, outerHalf * 0.74, rightWallTop);
  shape.quadraticCurveTo(outerHalf * 0.96, rightWallTop * 0.90, outerHalf, rightWallTop * 0.34);
  shape.lineTo(outerHalf, outerBase);
  shape.lineTo(-outerHalf, outerBase);

  const hole = new THREE.Path();
  hole.moveTo(-holeHalf, holeBase);
  hole.lineTo(-holeHalf, holeShoulder);
  hole.quadraticCurveTo(-holeHalf * 0.90, holeCrown * 0.98, 0, holeCrown);
  hole.quadraticCurveTo(holeHalf * 0.90, holeCrown * 0.98, holeHalf, holeShoulder);
  hole.lineTo(holeHalf, holeBase);
  hole.lineTo(-holeHalf, holeBase);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 12,
  });
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (const group of geometry.groups) {
    const isExtrudedSide = group.materialIndex === 1;
    const end = group.start + group.count;
    for (let i = group.start; i < end; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      if (isExtrudedSide) {
        // ExtrudeGeometry's default side UV repeats the full texture on every
        // narrow arch segment, producing conspicuous vertical bars. Project
        // each side from its dominant tangent plane instead, with tunnel depth
        // as the other axis, so the rock grain continues around the opening.
        const tangent = Math.abs(normals.getX(i)) > Math.abs(normals.getY(i))
          ? y
          : x;
        uv.setXY(i, tangent * 0.16, z * 0.16);
      } else {
        uv.setXY(i, x * 0.16, y * 0.16);
      }
    }
  }
  uv.needsUpdate = true;

  const mesh = new THREE.Mesh(geometry, [rockMaterial, interiorRockMaterial]);
  const right = rightAt(sFront, new THREE.Vector3());
  const forward = tangentAt(sFront, new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4().makeBasis(right, up, forward);
  basis.setPosition(TMP_POINT.x, centerGround, TMP_POINT.z);
  mesh.applyMatrix4(basis);
  mesh.position.y -= 0.15;
  mesh.frustumCulled = true;
  return mesh;
}

function createDistantForestBand() {
  const rand = seededRandom(ACTIVE_STAGE.seeds.farForest);
  const group = new THREE.Group();
  const layers = [
    { mountain: DISTANT_MOUNTAIN_CONFIGS[1], widthScale: 0.94, count: 320, color: 0x7397a2, scale: 1.0 },
    { mountain: DISTANT_MOUNTAIN_CONFIGS[2], widthScale: 0.94, count: 400, color: 0x86a7b2, scale: 0.82 },
  ];

  for (const layer of layers) {
    const width = layer.mountain.width * layer.widthScale;
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    for (let i = 0; i < layer.count; i++) {
      const x = (rand() - 0.5) * width;
      const h = (8 + rand() * 18) * layer.scale;
      const w = h * (0.24 + rand() * 0.12);
      // Trees share the exact ridge function used by their backing mountain.
      // Keeping them a few metres in front and embedding the base slightly in
      // the snow guarantees that no detached treetop can float against the sky.
      const y = distantMountainRidgeAt(layer.mountain, x) - 1.2 - rand() * 1.6;
      const z = layer.mountain.z - 4 - rand() * 12;
      const base = vertices.length / 3;
      vertices.push(x - w, y, z, x + w, y, z, x, y + h, z);
      indices.push(base, base + 1, base + 2);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    const material = new THREE.MeshBasicMaterial({ color: layer.color, side: THREE.DoubleSide, fog: true });
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

function createRadialTexture(coreStop, fadeStop) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(coreStop, 'rgba(255,255,255,1)');
  gradient.addColorStop(fadeStop, 'rgba(255,255,255,.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSunBillboard() {
  const group = new THREE.Group();
  const haloMaterial = new THREE.SpriteMaterial({
    map: createRadialTexture(0.02, 0.18),
    color: 0xffaa72,
    transparent: true,
    opacity: 0.30,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const discMaterial = new THREE.SpriteMaterial({
    map: createRadialTexture(0.16, 0.58),
    color: 0xffedc4,
    transparent: true,
    opacity: 0.84,
    depthTest: true,
    depthWrite: false,
    fog: false,
  });
  const halo = new THREE.Sprite(haloMaterial);
  const disc = new THREE.Sprite(discMaterial);
  halo.scale.set(380, 380, 1);
  disc.scale.set(64, 64, 1);
  halo.renderOrder = 0;
  disc.renderOrder = 1;
  group.add(halo, disc);
  return { group, haloMaterial, discMaterial };
}

function createSkyDome() {
  const uniforms = {
    zenithColor: { value: new THREE.Color(0x101a31) },
    horizonColor: { value: new THREE.Color(0x29384d) },
    horizonGlowColor: { value: new THREE.Color(0xc76f64) },
    horizonGlowDirection: { value: new THREE.Vector3(-0.3, 0, 0.95).normalize() },
    horizonGlowStrength: { value: 0.72 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 zenithColor;
      uniform vec3 horizonColor;
      uniform vec3 horizonGlowColor;
      uniform vec3 horizonGlowDirection;
      uniform float horizonGlowStrength;
      varying vec3 vDirection;

      void main() {
        vec3 direction = normalize(vDirection);
        float skyHeight = smoothstep(-0.10, 0.72, direction.y);
        vec3 color = mix(horizonColor, zenithColor, skyHeight);

        vec2 horizontal = normalize(direction.xz + vec2(0.00001));
        vec2 glowDirection = normalize(horizonGlowDirection.xz + vec2(0.00001));
        float facingGlow = pow(max(dot(horizontal, glowDirection), 0.0), 9.0);
        float lowHorizon = exp(-pow((direction.y - 0.015) / 0.14, 2.0));
        float horizonGlow = clamp(
          facingGlow * lowHorizon * horizonGlowStrength,
          0.0,
          1.0
        );
        color = mix(color, horizonGlowColor, horizonGlow);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1900, 40, 20), material);
  mesh.renderOrder = -10000;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export class Scenery {
  constructor(scene, farScene, { maxAnisotropy = 1 } = {}) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rockMaterials = createRockMaterials(maxAnisotropy);

    const groomedCourse = ACTIVE_TRACK.visualProfile?.nightLighting?.groomedCourse ?? false;
    const trees = createTrees({ groomedCourse, maxAnisotropy });
    this.group.add(trees.group);
    this.treeObstacles = trees.positions;

    const rocks = createRocks({
      groomedCourse,
      material: this.rockMaterials.object,
    });
    this.group.add(rocks.mesh);
    this.rockObstacles = rocks.positions;
    this.obstacles = [...this.treeObstacles, ...this.rockObstacles]
      .sort((a, b) => a.s - b.s);

    this.tunnelSnowMaterial = new THREE.MeshLambertMaterial({
      color: 0xeaf4f7,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this.tunnelGroup = createTunnels({
      snowMaterial: this.tunnelSnowMaterial,
      rockMaterial: this.rockMaterials.exterior,
      interiorRockMaterial: this.rockMaterials.interior,
    });
    this.group.add(this.tunnelGroup);

    this.farGroup = new THREE.Group();
    this.farGroup.add(createDistantForestBand());
    this.farGroup.add(createDistantMountains());
    this.sun = createSunBillboard();
    this.farGroup.add(this.sun.group);
    this.sky = createSkyDome();
    farScene.add(this.sky.mesh);

    // Far snow is only a fallback below the horizon. It now lives in a separate
    // render pass, so it can never cover the real course in front of the rider.
    this.farSnowMaterial = new THREE.MeshBasicMaterial({ color: 0xdcebef, fog: true });
    const farSnow = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 1900),
      this.farSnowMaterial
    );
    farSnow.rotation.x = -Math.PI / 2;
    farSnow.position.set(0, -125, 850);
    this.farGroup.add(farSnow);
    farScene.add(this.farGroup);
  }

  setEnvironment(environment, playerHeading = 0, glowWorldAzimuth = 0) {
    this.farSnowMaterial.color.set(environment.snowColor);
    this.tunnelSnowMaterial.color.set(environment.snowColor);
    // The sky dome is visible through a tunnel exit, so it must retain the
    // track atmosphere. A player-position-driven dark tint made the outside
    // world turn into night until the instant the rider crossed the portal.
    this.sky.uniforms.zenithColor.value.set(environment.skyZenithColor);
    this.sky.uniforms.horizonColor.value.set(environment.skyHorizonColor);
    this.sky.uniforms.horizonGlowColor.value.set(environment.horizonGlowColor);
    this.sky.uniforms.horizonGlowDirection.value.set(
      Math.sin(glowWorldAzimuth),
      0,
      Math.cos(glowWorldAzimuth)
    );
    this.sky.uniforms.horizonGlowStrength.value = environment.horizonGlowStrength;
    this.sun.discMaterial.color.set(environment.sunDiscColor);
    this.sun.haloMaterial.color.set(environment.sunHaloColor);
    this.sun.discMaterial.opacity = environment.sunOpacity;
    this.sun.haloMaterial.opacity = environment.sunOpacity * 0.55;

    const distance = 1450;
    const azimuth = glowWorldAzimuth - playerHeading;
    const elevation = THREE.MathUtils.degToRad(environment.sunElevationDeg);
    this.sun.group.position.set(
      Math.sin(azimuth) * distance,
      88 + Math.tan(elevation) * distance,
      Math.cos(azimuth) * distance
    );
  }

  collisionAt(player) {
    if (player.state !== 'GROUND') return null;
    const riderRadius = 0.48;
    const searchRadius = 3.0;
    let best = null;
    let bestScore = Infinity;

    let lo = 0;
    let hi = this.obstacles.length;
    const searchStart = player.courseS - searchRadius;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.obstacles[mid].s < searchStart) lo = mid + 1;
      else hi = mid;
    }

    for (let i = lo; i < this.obstacles.length; i++) {
      const obstacle = this.obstacles[i];
      if (obstacle.s > player.courseS + searchRadius) break;
      const ds = Math.abs(obstacle.s - player.courseS);
      if (ds > obstacle.radius + 1.15) continue;
      const dd = Math.abs(obstacle.d - player.courseD);
      const limit = obstacle.radius + riderRadius;
      if (dd > limit) continue;
      const score = ds * ds + dd * dd;
      if (score < bestScore) {
        best = obstacle;
        bestScore = score;
      }
    }
    return best;
  }

  update(camera, player) {
    // Distant scenery is a stage set: it follows the viewer and turns with the
    // ride direction so a real horizontal bend never exposes the edge of the sky.
    this.farGroup.position.x = camera.position.x;
    this.farGroup.position.z = camera.position.z;
    this.farGroup.position.y = camera.position.y - 88;
    this.farGroup.rotation.y = player.heading;
    this.sky.mesh.position.copy(camera.position);
  }
}
