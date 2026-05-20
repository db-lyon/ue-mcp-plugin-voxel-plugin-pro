import { BaseTask, type TaskResult } from "@db-lyon/flowkit";

interface Vec3 { x: number; y: number; z: number; }

interface Options {
  label?: string;
  location?: Vec3;
  voxelSize?: number;
  /**
   * Asset path of a UVoxelLayerStack. Defaults to the plugin-bundled
   * `/Voxel/Default/DefaultStack.DefaultStack`. Pass an empty string to
   * leave the property unset (the world will load but render nothing
   * until you assign a stack yourself).
   */
  layerStack?: string;
  /** Optional UVoxelMegaMaterial asset path. */
  megaMaterial?: string;
}

const DEFAULT_LAYER_STACK = "/Voxel/Default/DefaultStack.DefaultStack";

/**
 * Drop an `AVoxelWorld` actor into the active level — the first thing
 * any Voxel-Plugin workflow needs. Wraps `level.place_actor` with the
 * Voxel-Plugin class path, then applies `voxelSize` / `LayerStack` /
 * `MegaMaterial` via `level.set_actor_property` so the resulting actor
 * is renderable out of the box.
 *
 * Header: `Voxel/Public/VoxelWorld.h` (`AVoxelWorld`).
 *
 * Pair with `level.voxel_get_voxel_world_status` to poll the runtime
 * until `isVoxelWorldReady` flips true before scattering / stamping.
 */
export default class SpawnWorld extends BaseTask<Options> {
  get taskName(): string { return "voxel.spawn_world"; }

  async execute(): Promise<TaskResult> {
    const { label, location, voxelSize, layerStack, megaMaterial } = this.options;

    const placeParams: Record<string, unknown> = {
      actorClass: "/Script/Voxel.VoxelWorld",
    };
    if (label) placeParams.label = label;
    if (location) placeParams.location = location;

    const placed = await this.call("level.place_actor", placeParams);
    if (!placed.success) return placed;

    const actorLabel = (placed.data as { actorLabel?: string; label?: string } | undefined)?.actorLabel
                    ?? (placed.data as { label?: string } | undefined)?.label
                    ?? label;
    if (!actorLabel) {
      return { success: false, error: new Error("level.place_actor did not return an actorLabel") };
    }

    const applied: Record<string, unknown> = {};

    // Default the LayerStack so a bare AVoxelWorld actually renders.
    // Explicit empty string opts out.
    const resolvedLayerStack = layerStack === "" ? undefined
                             : (layerStack ?? DEFAULT_LAYER_STACK);

    const setProp = async (propertyName: string, value: unknown) => {
      const r = await this.call("level.set_actor_property", { actorLabel, propertyName, value });
      if (!r.success) return r;
      applied[propertyName] = value;
      return r;
    };

    if (typeof voxelSize === "number") {
      const r = await setProp("VoxelSize", voxelSize);
      if (!r.success) return r;
    }
    if (resolvedLayerStack) {
      const r = await setProp("LayerStack", resolvedLayerStack);
      if (!r.success) return r;
    }
    if (megaMaterial) {
      const r = await setProp("MegaMaterial", megaMaterial);
      if (!r.success) return r;
    }

    return {
      success: true,
      data: {
        actorLabel,
        actorClass: "/Script/Voxel.VoxelWorld",
        applied,
      },
    };
  }
}
