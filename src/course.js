import * as THREE from 'three';
import { ACTIVE_STAGE } from './stage.js';

const snowBaseColorUrl = new URL('../textures/snow-ground/base-color.jpg', import.meta.url).href;
const snowNormalUrl = new URL('../textures/snow-ground/normal.jpg', import.meta.url).href;
// The source roughness averages around 0.62, which reads as wet ice under the
// game's deliberately strong sun. This remapped copy preserves its variation
// in the snow-like 0.85-1.0 range.
const snowRoughnessUrl = new URL('../textures/snow-ground/roughness-snow.jpg', import.meta.url).href;

export const COURSE = {
  length: ACTIVE_STAGE.length,
  startHeight: ACTIVE_STAGE.startHeight,
  renderHalfWidth: ACTIVE_STAGE.renderHalfWidth,
};

// ---------------------------------------------------------------------------
// CURVED COURSE MODEL
// ---------------------------------------------------------------------------
// s = distance travelled along the authored centre line (metres)
// d = signed lateral offset from that line (metres; +d is rider's right)
//
// The old prototype used world Z as "progress" and world X as "lane offset".
// That made every run fundamentally straight. This build instead precomputes a
// 2D centre line from an authored heading profile. Player velocity is world-space
// and is projected back into (s,d), so turning changes the actual travel direction.

const GRADE_KEYS = ACTIVE_STAGE.gradeKeys;

// Positive heading bends toward world +X. At the start, the camera looks +Z,
// so +X appears on the rider's left. Angles are deliberately large enough that
// corners must actually be followed, not merely sidestepped through.
const HEADING_KEYS = ACTIVE_STAGE.headingKeysDeg.map(([s, deg]) => [s, THREE.MathUtils.degToRad(deg)]);

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smooth01(v) {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  return smooth01((x - edge0) / (edge1 - edge0));
}

function sampleKeys(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [s0, v0] = keys[i];
    const [s1, v1] = keys[i + 1];
    if (s <= s1) {
      const t = smooth01((s - s0) / (s1 - s0));
      return THREE.MathUtils.lerp(v0, v1, t);
    }
  }
  return keys[keys.length - 1][1];
}

export function gradeAt(s) {
  return sampleKeys(GRADE_KEYS, THREE.MathUtils.clamp(s, 0, COURSE.length));
}

export function courseHeadingAt(s) {
  return sampleKeys(HEADING_KEYS, THREE.MathUtils.clamp(s, 0, COURSE.length));
}

const PROFILE_STEP = 1;
const SAMPLE_COUNT = Math.ceil(COURSE.length / PROFILE_STEP) + 2;
const CENTER_X = new Float32Array(SAMPLE_COUNT);
const CENTER_Z = new Float32Array(SAMPLE_COUNT);
const CENTER_Y = new Float32Array(SAMPLE_COUNT);
const CENTER_HEADING = new Float32Array(SAMPLE_COUNT);

CENTER_X[0] = 0;
CENTER_Z[0] = 0;
CENTER_Y[0] = COURSE.startHeight;
CENTER_HEADING[0] = courseHeadingAt(0);

for (let i = 1; i < SAMPLE_COUNT; i++) {
  const s0 = (i - 1) * PROFILE_STEP;
  const s1 = i * PROFILE_STEP;
  const h0 = courseHeadingAt(s0);
  const h1 = courseHeadingAt(s1);
  const h = (h0 + h1) * 0.5;
  const g = (gradeAt(s0) + gradeAt(s1)) * 0.5;

  CENTER_X[i] = CENTER_X[i - 1] + Math.sin(h) * PROFILE_STEP;
  CENTER_Z[i] = CENTER_Z[i - 1] + Math.cos(h) * PROFILE_STEP;
  CENTER_Y[i] = CENTER_Y[i - 1] - g * PROFILE_STEP;
  CENTER_HEADING[i] = h1;
}

function sampleArray(arr, s) {
  const clamped = THREE.MathUtils.clamp(s, 0, COURSE.length);
  const f = clamped / PROFILE_STEP;
  const i = Math.floor(f);
  const t = f - i;
  const a = arr[Math.min(i, SAMPLE_COUNT - 1)];
  const b = arr[Math.min(i + 1, SAMPLE_COUNT - 1)];
  return THREE.MathUtils.lerp(a, b, t);
}

export function centerAt(s, target = new THREE.Vector3()) {
  const y = sampleArray(CENTER_Y, s)
    + Math.sin(s * 0.010 + 0.4) * 0.58
    + Math.sin(s * 0.0039 + 1.9) * 0.95;
  return target.set(sampleArray(CENTER_X, s), y, sampleArray(CENTER_Z, s));
}

export function tangentAt(s, target = new THREE.Vector3()) {
  const h = courseHeadingAt(s);
  return target.set(Math.sin(h), 0, Math.cos(h)).normalize();
}

export function rightAt(s, target = new THREE.Vector3()) {
  const h = courseHeadingAt(s);
  // For a rider looking down the course this is screen-right.
  return target.set(-Math.cos(h), 0, Math.sin(h)).normalize();
}

// ---------------------------------------------------------------------------
// ENCLOSURE / VISTA RHYTHM
// ---------------------------------------------------------------------------
function pulse(s, start, end, feather = 50) {
  const rise = smoothstep(start - feather, start, s);
  const fall = 1 - smoothstep(end, end + feather, s);
  return rise * fall;
}

export function vistaAmountAt(s) {
  let amount = 0;
  for (const vista of ACTIVE_STAGE.vistas) {
    amount = Math.max(amount, pulse(s, vista.start, vista.end, vista.feather));
  }
  return amount;
}

export function wallInfoAt(s) {
  const vista = vistaAmountAt(s);
  const p = ACTIVE_STAGE.personality;
  const cfg = ACTIVE_STAGE.wall;

  // Stage personality controls how close the everyday banks feel. Seeded phases
  // make left/right pressure vary independently so an enclosed seed does not
  // collapse into a symmetric half-pipe.
  const leftWave = Math.sin(s * 0.016 + cfg.leftPhaseA) * 2.7
    + Math.sin(s * 0.0061 + cfg.leftPhaseB) * 1.45;
  const rightWave = Math.sin(s * 0.014 + cfg.rightPhaseA) * 3.0
    + Math.sin(s * 0.0053 + cfg.rightPhaseB) * 1.55;

  const openness = 1 - p.enclosure;
  const leftBase = cfg.baseShoulder + leftWave + cfg.asymmetry * 0.45 + openness * 2.4;
  const rightBase = cfg.baseShoulder + 1.8 + rightWave - cfg.asymmetry * 0.45 + openness * 2.8;
  const leftMin = THREE.MathUtils.lerp(10.0, 7.6, p.enclosure);
  const rightMin = THREE.MathUtils.lerp(10.8, 8.1, p.enclosure);
  // Vistas remain broad, but no longer flatten all the way to the edge of the
  // rendered terrain. A low outer shoulder frames the distant stage set and
  // prevents ultra-wide views from exposing its sides.
  const leftShoulder = THREE.MathUtils.lerp(Math.max(leftMin, leftBase), 46 + p.vista * 5, vista);
  const rightShoulder = THREE.MathUtils.lerp(Math.max(rightMin, rightBase), 50 + p.vista * 5, vista);

  const sidePulseA = 0.76 + Math.sin(s * 0.010 + cfg.leftPhaseB) * 0.18;
  const sidePulseB = 0.76 + Math.sin(s * 0.011 + cfg.rightPhaseA) * 0.18;
  const vistaCut = 1 - vista * 0.76;
  const leftStrength = Math.max(0.18, cfg.strength * sidePulseA) * vistaCut;
  const rightStrength = Math.max(0.18, cfg.strength * sidePulseB) * vistaCut;

  return {
    leftStrength,
    rightStrength,
    leftShoulder,
    rightShoulder,
    vista,
    leftLimit: leftShoulder + THREE.MathUtils.lerp(3.5, 7.0, vista),
    rightLimit: rightShoulder + THREE.MathUtils.lerp(3.5, 7.0, vista),
  };
}

function sideWallRise(d, s) {
  const info = wallInfoAt(s);
  const left = d < 0;
  const shoulder = left ? info.leftShoulder : info.rightShoulder;
  const strength = left ? info.leftStrength : info.rightStrength;
  const beyond = Math.abs(d) - shoulder;
  if (beyond <= 0 || strength <= 0.001) return 0;

  // A readable nearby bank first, then a broad mountain shoulder farther out.
  const q = Math.min(46, beyond);
  return strength * Math.min(62, q * 0.48 + q * q * 0.082);
}


// ---------------------------------------------------------------------------
// MICRO TERRAIN: rollers and jumpable crests
// ---------------------------------------------------------------------------
// These features are intentionally small compared with the macro slope profile.
// Their job is to create readable contact/separation events without turning
// the course into a motocross track. They are generated from the same height
// function used by both Three.js and Rapier, so visual and physical snow agree.
const TERRAIN_FEATURES = ACTIVE_STAGE.terrainFeatures;

function cosineBump01(x) {
  if (Math.abs(x) >= 1) return 0;
  return 0.5 + 0.5 * Math.cos(Math.PI * x);
}

// A snowboard jump needs a launch lip, not a symmetric round hill. The rider
// climbs a long face whose slope is still positive at the lip, then the snow
// drops away quickly. That produces a real loss of contact under the existing
// ballistic takeoff test instead of merely following a rounded mound.
function launchRamp01(x) {
  if (x <= -1 || x >= 0.62) return 0;
  const lipX = 0.28;
  if (x <= lipX) {
    const u = THREE.MathUtils.clamp((x + 1) / (lipX + 1), 0, 1);
    return Math.pow(u, 1.35);
  }
  const u = THREE.MathUtils.clamp((x - lipX) / (0.62 - lipX), 0, 1);
  return 1 - smooth01(u);
}

export function terrainFeatureRiseAt(s, d = 0) {
  let rise = 0;
  for (const feature of TERRAIN_FEATURES) {
    const along = (s - feature.centerS) / feature.halfLength;
    const alongShape = feature.kind === 'jump'
      ? launchRamp01(along)
      : cosineBump01(along);
    if (alongShape <= 0) continue;

    const across = Math.abs(d) / feature.halfWidth;
    if (across >= 1) continue;
    const acrossShape = 1 - smoothstep(0.62, 1.0, across);
    rise += feature.height * alongShape * acrossShape;
  }
  return rise;
}

export function terrainFeatureContextAt(s) {
  let nearestIndex = -1;
  let best = Infinity;
  for (let index = 0; index < TERRAIN_FEATURES.length; index += 1) {
    const feature = TERRAIN_FEATURES[index];
    const distance = Math.abs(s - feature.centerS);
    if (distance < best) {
      best = distance;
      nearestIndex = index;
    }
  }
  if (nearestIndex < 0) return null;

  const feature = TERRAIN_FEATURES[nearestIndex];
  const next = TERRAIN_FEATURES[nearestIndex + 1] ?? null;
  return {
    feature: { ...feature, distance: best },
    // nearestTerrainFeatureAt changes ownership at the midpoint between two
    // feature centres. Lead-rider flights use this boundary to finish safely
    // before a following feature can replace the current one.
    nextSwitchS: next
      ? (feature.centerS + next.centerS) * 0.5
      : Infinity,
  };
}

export function nearestTerrainFeatureAt(s) {
  return terrainFeatureContextAt(s)?.feature ?? null;
}

export function heightAtCourse(s, d) {
  const centerY = centerAt(s, TMP_CENTER).y;
  const channel = d * d * 0.00135;
  const camber = Math.sin(s * 0.008 + 0.85) * d * 0.0080;
  const wall = sideWallRise(d, s);
  const micro = Math.sin(d * 0.10 + s * 0.033) * 0.035;
  const featureRise = terrainFeatureRiseAt(s, d);
  return centerY + channel + camber + wall + micro + featureRise;
}

const TMP_CENTER = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_POINT = new THREE.Vector3();
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();
const TMP_D = new THREE.Vector3();
const TMP_ALONG = new THREE.Vector3();
const TMP_ACROSS = new THREE.Vector3();

export function pointAt(s, d = 0, target = new THREE.Vector3()) {
  centerAt(s, target);
  rightAt(s, TMP_RIGHT);
  target.addScaledVector(TMP_RIGHT, d);
  target.y = heightAtCourse(s, d);
  return target;
}

export function normalAtCourse(s, d, target = new THREE.Vector3()) {
  const eS = 0.55;
  const eD = 0.45;
  pointAt(s - eS, d, TMP_A);
  pointAt(s + eS, d, TMP_B);
  pointAt(s, d - eD, TMP_C);
  pointAt(s, d + eD, TMP_D);
  TMP_ALONG.subVectors(TMP_B, TMP_A);
  TMP_ACROSS.subVectors(TMP_D, TMP_C);
  return target.crossVectors(TMP_ACROSS, TMP_ALONG).normalize();
}

export function downhillGradeAtCourse(s, d = 0) {
  const e = 1.25;
  return (heightAtCourse(s - e, d) - heightAtCourse(s + e, d)) / (e * 2);
}

// Project a world-space XZ location back to the nearest part of the centre line.
// The caller supplies a previous s value, so only a local window needs searching.
export function worldToCourse(x, z, hintS = 0, target = {}) {
  const hint = THREE.MathUtils.clamp(hintS, 0, COURSE.length);
  let bestS = hint;
  let bestDistSq = Infinity;
  const start = Math.max(0, Math.floor(hint - 85));
  const end = Math.min(COURSE.length, Math.ceil(hint + 85));

  for (let s = start; s <= end; s += 3) {
    const cx = sampleArray(CENTER_X, s);
    const cz = sampleArray(CENTER_Z, s);
    const dx = x - cx;
    const dz = z - cz;
    const dsq = dx * dx + dz * dz;
    if (dsq < bestDistSq) {
      bestDistSq = dsq;
      bestS = s;
    }
  }

  const refineStart = Math.max(0, bestS - 4);
  const refineEnd = Math.min(COURSE.length, bestS + 4);
  for (let s = refineStart; s <= refineEnd; s += 0.5) {
    const cx = sampleArray(CENTER_X, s);
    const cz = sampleArray(CENTER_Z, s);
    const dx = x - cx;
    const dz = z - cz;
    const dsq = dx * dx + dz * dz;
    if (dsq < bestDistSq) {
      bestDistSq = dsq;
      bestS = s;
    }
  }

  centerAt(bestS, TMP_CENTER);
  rightAt(bestS, TMP_RIGHT);
  const ox = x - TMP_CENTER.x;
  const oz = z - TMP_CENTER.z;
  const d = ox * TMP_RIGHT.x + oz * TMP_RIGHT.z;

  target.s = bestS;
  target.d = d;
  target.distanceSq = bestDistSq;
  return target;
}

function loadRepeatingSnowTexture(url, maxAnisotropy, colorTexture = false) {
  const texture = new THREE.TextureLoader().load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(maxAnisotropy, 8);
  if (colorTexture) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createTerrain(maxAnisotropy = 1) {
  // Dense enough longitudinal tessellation for authored rollers and
  // jump crests match the height function closely enough for the Rapier mesh.
  const segS = Math.ceil(COURSE.length / (STAGE_BASE_LENGTH / 520));
  const segD = 80;
  const row = segD + 1;
  const positions = new Float32Array((segS + 1) * row * 3);
  const uvs = new Float32Array((segS + 1) * row * 2);
  const snowTextureAmounts = new Float32Array((segS + 1) * row * 3);
  const indices = new Uint32Array(segS * segD * 6);
  let p = 0;
  let uvOffset = 0;
  let colorOffset = 0;
  let indexOffset = 0;

  // Keep the source pattern small enough to read as snow grain instead of a
  // repeated landscape feature. Mapping in course coordinates follows bends.
  const snowTileMetres = 7.5;

  for (let is = 0; is <= segS; is++) {
    const s = (is / segS) * COURSE.length;
    const wall = wallInfoAt(s);
    for (let id = 0; id <= segD; id++) {
      const d = THREE.MathUtils.lerp(-COURSE.renderHalfWidth, COURSE.renderHalfWidth, id / segD);
      pointAt(s, d, TMP_POINT);
      positions[p++] = TMP_POINT.x;
      positions[p++] = TMP_POINT.y;
      positions[p++] = TMP_POINT.z;
      uvs[uvOffset++] = d / snowTileMetres;
      uvs[uvOffset++] = s / snowTileMetres;

      // Parametric course UVs stretch badly up canyon walls. Fade all three
      // texture layers around the shoulder while retaining detail underfoot.
      const shoulder = d < 0 ? wall.leftShoulder : wall.rightShoulder;
      const snowTextureAmount = 1 - smoothstep(shoulder - 3, shoulder + 9, Math.abs(d));
      snowTextureAmounts[colorOffset++] = snowTextureAmount;
      snowTextureAmounts[colorOffset++] = snowTextureAmount;
      snowTextureAmounts[colorOffset++] = snowTextureAmount;
    }
  }

  for (let is = 0; is < segS; is++) {
    for (let id = 0; id < segD; id++) {
      const a = is * row + id;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      // pointAt(s,d) uses +d as rider-right, which is world -X at the start.
      // The old a,c,b winding pointed the terrain normals downward. On a curved
      // ribbon that made visible patches look like floating dark undersides.
      indices[indexOffset++] = a;
      indices[indexOffset++] = b;
      indices[indexOffset++] = c;
      indices[indexOffset++] = b;
      indices[indexOffset++] = d;
      indices[indexOffset++] = c;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(snowTextureAmounts, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  // Shoulder distance alone cannot identify an abrupt inner canyon face.
  // Multiply by the actual up-facing amount so near-vertical snow walls remain
  // clean colour fields even when they begin close to the riding line.
  const normals = geometry.getAttribute('normal');
  const textureStrength = geometry.getAttribute('color');
  for (let i = 0; i < normals.count; i++) {
    const slopeAmount = smoothstep(0.38, 0.76, normals.getY(i));
    const amount = textureStrength.getX(i) * slopeAmount;
    textureStrength.setXYZ(i, amount, amount, amount);
  }

  const baseColor = loadRepeatingSnowTexture(snowBaseColorUrl, maxAnisotropy, true);
  const normal = loadRepeatingSnowTexture(snowNormalUrl, maxAnisotropy);
  const roughness = loadRepeatingSnowTexture(snowRoughnessUrl, maxAnisotropy);
  const material = new THREE.MeshStandardMaterial({
    color: 0xeaf4f7,
    map: baseColor,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: roughness,
    roughness: 0.96,
    metalness: 0,
    // Tight bends can expose the reverse side of a future snow bank. Trees are
    // already double-sided, so leaving the terrain front-sided makes the bank
    // vanish while its forest remains suspended against the sky.
    side: THREE.DoubleSide,
    // The old Lambert surface tolerated faceted normals, but PBR specular light
    // turns the same triangles into repeated vertical/diamond bands on cliffs.
    flatShading: false,
    vertexColors: true,
  });

  // Vertex colour carries a texture-strength mask rather than a literal tint.
  // Keep the pinned Three.js shader chunks intact apart from these small blends.
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '')
      .replace(
        'diffuseColor *= sampledDiffuseColor;',
        `float snowTextureContrast = mix( 0.0, 0.48, vColor.r );
	 sampledDiffuseColor.rgb = mix( vec3( 1.0 ), sampledDiffuseColor.rgb, snowTextureContrast );
	 diffuseColor *= sampledDiffuseColor;`,
      )
      .replace(
        'roughnessFactor *= texelRoughness.g;',
        'roughnessFactor *= mix( 1.0, texelRoughness.g, vColor.r );',
      )
      .replace(
        'mapN.xy *= normalScale;',
        'mapN.xy *= normalScale * vColor.r;',
      );
  };
  material.customProgramCacheKey = () => 'snow-slope-texture-fade-v1';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = true;
  return mesh;
}

function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const STAGE_BASE_LENGTH = 1500;

const TMP_NORMAL = new THREE.Vector3();
const TMP_FORWARD = new THREE.Vector3();
const TMP_TRACK_RIGHT = new THREE.Vector3();
const TMP_MATRIX = new THREE.Matrix4();

function setTrackBetween(dummy, s0, d0, s1, d1, widthScale = 1) {
  pointAt(s0, d0, TMP_A);
  pointAt(s1, d1, TMP_B);
  TMP_POINT.addVectors(TMP_A, TMP_B).multiplyScalar(0.5);
  const midS = (s0 + s1) * 0.5;
  const midD = (d0 + d1) * 0.5;
  normalAtCourse(midS, midD, TMP_NORMAL);

  TMP_FORWARD.subVectors(TMP_B, TMP_A);
  TMP_FORWARD.addScaledVector(TMP_NORMAL, -TMP_FORWARD.dot(TMP_NORMAL)).normalize();
  TMP_TRACK_RIGHT.crossVectors(TMP_NORMAL, TMP_FORWARD).normalize();
  TMP_MATRIX.makeBasis(TMP_TRACK_RIGHT, TMP_NORMAL, TMP_FORWARD);

  const length = TMP_A.distanceTo(TMP_B) * 1.08;
  dummy.position.copy(TMP_POINT).addScaledVector(TMP_NORMAL, 0.045);
  dummy.quaternion.setFromRotationMatrix(TMP_MATRIX);
  dummy.scale.set(widthScale, 1, length);
  dummy.updateMatrix();
}





export function createSnowMarks({ showPriorTracks = true } = {}) {
  const group = new THREE.Group();
  const rand = seededRandom(ACTIVE_STAGE.seeds.snowMarks);

  // -----------------------------------------------------------------------
  // ACCEPTED SNOW-SURFACE LANGUAGE
  // -----------------------------------------------------------------------
  // Fine surface streaks are a permanent speed cue. Long paired grooves are a
  // separate narrative layer and may be omitted for untouched-snow tracks.
  // Their dimensions are tuned to this low camera and should be changed cautiously.

  // -----------------------------------------------------------------------
  // LAYER 1: very subtle snow-surface scratches (secondary only)
  // -----------------------------------------------------------------------
  const scratchCount = Math.round(820 * COURSE.length / STAGE_BASE_LENGTH);
  const scratchPositions = new Float32Array(scratchCount * 6);
  let sp = 0;
  for (let i = 0; i < scratchCount; i++) {
    const s = 18 + rand() * (COURSE.length - 36);
    const wall = wallInfoAt(s);
    const left = Math.max(5.5, wall.leftShoulder - 3.0);
    const right = Math.max(5.5, wall.rightShoulder - 3.0);
    const d = THREE.MathUtils.lerp(-left, right, rand());
    const length = 4.0 + Math.pow(rand(), 0.72) * 8.0;
    const drift = (rand() - 0.5) * 0.45;
    const s0 = Math.max(1, s - length * 0.5);
    const s1 = Math.min(COURSE.length - 1, s + length * 0.5);
    pointAt(s0, d - drift, TMP_A);
    pointAt(s1, d + drift, TMP_B);
    TMP_A.y += 0.048;
    TMP_B.y += 0.048;
    scratchPositions[sp++] = TMP_A.x;
    scratchPositions[sp++] = TMP_A.y;
    scratchPositions[sp++] = TMP_A.z;
    scratchPositions[sp++] = TMP_B.x;
    scratchPositions[sp++] = TMP_B.y;
    scratchPositions[sp++] = TMP_B.z;
  }
  const scratchGeometry = new THREE.BufferGeometry();
  scratchGeometry.setAttribute('position', new THREE.BufferAttribute(scratchPositions, 3));
  const scratchMaterial = new THREE.LineBasicMaterial({
    color: 0xb7d0db,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const scratches = new THREE.LineSegments(scratchGeometry, scratchMaterial);
  scratches.renderOrder = 1;
  group.add(scratches);

  if (!showPriorTracks) return group;

  // -----------------------------------------------------------------------
  // LAYER 2: long paired carve grooves
  // -----------------------------------------------------------------------
  // These are authored rather than random so there is always at least one
  // readable S-shaped trail in front of the rider. They are deliberately thin
  // and have no broad compressed centre strip; this keeps them from
  // looking like tyre tracks.
  const baseTrailSpecs = [
    { startS: 0,    span: 610, baseOffset: -4.8, amplitude: 6.3, wavelength: 126, phase: -0.20, width: 0.060 },
    { startS: 8,    span: 500, baseOffset:  5.2, amplitude: 5.4, wavelength: 112, phase:  2.35, width: 0.054 },
    { startS: 235,  span: 520, baseOffset: -2.0, amplitude: 7.0, wavelength: 138, phase:  1.00, width: 0.052 },
    { startS: 520,  span: 480, baseOffset:  4.0, amplitude: 5.7, wavelength: 104, phase:  3.75, width: 0.050 },
    { startS: 780,  span: 500, baseOffset: -5.0, amplitude: 6.4, wavelength: 132, phase:  5.10, width: 0.052 },
    { startS: 1080, span: 390, baseOffset:  2.5, amplitude: 5.0, wavelength: 96,  phase:  0.70, width: 0.048 },
  ];
  const trailSpecs = [];
  const sectionCount = Math.ceil(COURSE.length / STAGE_BASE_LENGTH);
  for (let section = 0; section < sectionCount; section++) {
    const sectionStart = section * STAGE_BASE_LENGTH;
    for (const spec of baseTrailSpecs) {
      if (sectionStart + spec.startS >= COURSE.length - 5) continue;
      trailSpecs.push({
        ...spec,
        startS: sectionStart + spec.startS,
        phase: spec.phase + section * 1.37,
      });
    }
  }

  function trailDAt(spec, s) {
    const local = s - spec.startS;
    const wave = Math.sin((local / spec.wavelength) * Math.PI * 2 + spec.phase);
    const wall = wallInfoAt(s);
    const minD = -wall.leftShoulder + 3.0;
    const maxD = wall.rightShoulder - 3.0;
    return THREE.MathUtils.clamp(spec.baseOffset + wave * spec.amplitude, minD, maxD);
  }

  function buildGroove(spec, side) {
    const step = 1.15;
    const endS = Math.min(COURSE.length - 5, spec.startS + spec.span);
    const sampleCount = Math.max(2, Math.floor((endS - spec.startS) / step) + 1);
    const positions = [];
    const indices = [];
    const edgeOffset = side * 0.16;

    for (let i = 0; i < sampleCount; i++) {
      const s = Math.min(endS, spec.startS + i * step);
      const centerD = trailDAt(spec, s) + edgeOffset;
      const half = spec.width * 0.5;
      const p0 = pointAt(s, centerD - half, new THREE.Vector3());
      const p1 = pointAt(s, centerD + half, new THREE.Vector3());
      p0.y += 0.052;
      p1.y += 0.052;
      positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }

    for (let i = 0; i < sampleCount - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  const grooveMaterial = new THREE.MeshBasicMaterial({
    color: 0xa8c8d6,
    transparent: true,
    opacity: 0.40,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  for (const spec of trailSpecs) {
    const leftGroove = new THREE.Mesh(buildGroove(spec, -1), grooveMaterial);
    const rightGroove = new THREE.Mesh(buildGroove(spec, 1), grooveMaterial);
    leftGroove.renderOrder = 3;
    rightGroove.renderOrder = 3;
    group.add(leftGroove, rightGroove);
  }

  return group;
}

export const DISTANT_MOUNTAIN_CONFIGS = Object.freeze([
  // The former front-facing strips used these same depths. Keeping them as
  // ring radii preserves the established relationship with far-scene fog.
  Object.freeze({ radius: 760, baseY: 18, amp: 58, color: 0xb9d1dc, phase: 2.3 }),
  Object.freeze({ radius: 980, baseY: 10, amp: 84, color: 0xa7c5d4, phase: 0.4 }),
  Object.freeze({ radius: 1240, baseY: 0, amp: 112, color: 0x8eafc1, phase: 1.7 }),
]);

export function distantMountainRidgeAt(cfg, arcDistance) {
  // Integer angular harmonics make the ridge exactly periodic at the back
  // seam while retaining broad, medium and small mountain silhouettes.
  const angle = arcDistance / cfg.radius;
  return cfg.baseY + cfg.amp * (
    0.46
    + 0.25 * Math.sin(angle * 12 + cfg.phase)
    + 0.17 * Math.sin(angle * 27 + cfg.phase * 0.7)
    + 0.12 * Math.sin(angle * 47 + 0.3)
  );
}

export function createDistantMountains() {
  const group = new THREE.Group();

  for (const cfg of DISTANT_MOUNTAIN_CONFIGS) {
    // Roughly four metres of arc per segment is still inexpensive at these
    // distances and prevents the 360-degree silhouette from looking faceted.
    const segments = Math.ceil(cfg.radius * Math.PI * 2 / 4.2);
    const verts = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.sin(angle) * cfg.radius;
      const z = Math.cos(angle) * cfg.radius;
      const ridge = distantMountainRidgeAt(cfg, angle * cfg.radius);
      verts.push(x, -42, z);
      verts.push(x, ridge, z);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, c, d, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color, side: THREE.DoubleSide, fog: true });
    group.add(new THREE.Mesh(geo, mat));
  }
  return group;
}
