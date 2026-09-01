/**
 * Thin Rapier bridge.
 *
 * The snowboard controller remains deliberately arcade/kinematic. Rapier owns
 * the static terrain collider and is used for geometric ground queries. This
 * keeps the jump/landing contact tied to the same rendered mesh without handing
 * steering, speed or board balance to a rigid-body solver.
 */
export class PhysicsWorld {
  constructor(RAPIER, terrainGeometry) {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;

    const sourcePositions = terrainGeometry.getAttribute('position').array;
    const sourceIndices = terrainGeometry.index.array;
    const vertices = new Float32Array(sourcePositions);
    const indices = sourceIndices instanceof Uint32Array
      ? new Uint32Array(sourceIndices)
      : Uint32Array.from(sourceIndices);

    const flags = RAPIER.TriMeshFlags?.FIX_INTERNAL_EDGES;
    const desc = flags !== undefined
      ? RAPIER.ColliderDesc.trimesh(vertices, indices, flags)
      : RAPIER.ColliderDesc.trimesh(vertices, indices);

    desc.setFriction(0.08);
    desc.setRestitution(0.0);
    this.terrainCollider = this.world.createCollider(desc);
  }

  step() {
    // There are no dynamic bodies yet, but stepping keeps this bridge ready for
    // obstacle/contact additions without changing the game loop later.
    this.world.step();
  }

  groundBelow(x, y, z, maxDistance = 24) {
    const originLift = 1.5;
    const ray = new this.RAPIER.Ray(
      { x, y: y + originLift, z },
      { x: 0, y: -1, z: 0 }
    );
    const hit = this.world.castRayAndGetNormal(ray, maxDistance + originLift, false);
    if (!hit) return null;

    const point = ray.pointAt(hit.timeOfImpact);
    return {
      point: { x: point.x, y: point.y, z: point.z },
      normal: hit.normal,
      distance: y - point.y,
      collider: hit.collider,
    };
  }
}
