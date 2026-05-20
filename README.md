# ue-mcp-plugin-voxel-plugin

[Voxel Plugin](https://voxelplugin.com) actions for [ue-mcp](https://github.com/db-lyon/ue-mcp).

## What ships

Each action is cited to the C++ header it wraps. Full API reference under [`docs/`](docs/).

| Category | Action                          | Wraps |
|----------|---------------------------------|-------|
| `level`  | `voxel_spawn_voxel_world`       | `level.place_actor` for `AVoxelWorld` (`Voxel/Public/VoxelWorld.h`) + property defaults so the world renders |
| `level`  | `voxel_get_voxel_world_status`  | 5 zero-arg lifecycle UFUNCTIONs on `AVoxelWorld` (`Voxel/Public/VoxelWorld.h`) |
| `pcg`    | `voxel_build_scatter_graph`     | `UPCGVoxelSamplerSettings` (`VoxelPCG/Public/PCGVoxelSampler.h`) feeding `UPCGStaticMeshSpawnerSettings` |
| `pcg`    | `voxel_ensure_wait_for_world`   | Splices `UPCGWaitForVoxelWorldSettings` (`VoxelPCG/Public/PCGWaitForVoxelWorld.h`) into an existing graph |

The v0.1.0 release shipped three actions that called ue-mcp tasks with wrong parameter names and passed PCG node-type strings that did not exist; v0.1.1 removed them.

## Install

```bash
ue-mcp plugin install ue-mcp-plugin-voxel-plugin
```

The CLI adds an entry under `plugins:` in your `ue-mcp.yml`. Restart ue-mcp; the injected action shows up under `pcg`.

## 0-to-1 workflow

```text
# 1. drop a voxel world into the level
level(action="voxel_spawn_voxel_world", label="MyVoxelWorld")

# 2. poll until the runtime finishes its first generation pass
level(action="voxel_get_voxel_world_status", actorLabel="MyVoxelWorld")
# => { isRuntimeCreated, isVoxelWorldReady, isProcessingNewState, progress, numPendingTasks }
# wait for isVoxelWorldReady && !isProcessingNewState before doing anything else.
```

That's the hello-world. `spawn_voxel_world` defaults `LayerStack` to the plugin-bundled `/Voxel/Default/DefaultStack.DefaultStack` so the actor renders without further setup.

## PCG actions (once a world is live)

```text
# Build a scatter graph that drops weighted meshes on the voxel surface.
pcg(action="voxel_build_scatter_graph",
    assetPath="/Game/PCG/RockScatter",
    meshes=[
      {mesh: "/Game/Foliage/Rock_A.Rock_A", weight: 2},
      {mesh: "/Game/Foliage/Rock_B.Rock_B"}
    ],
    pointsPerSquaredMeter=0.05,
    seed=42)

# Attach the graph to a PCG component, then materialize:
pcg(action="execute", actorLabel="MyPCGActor")
```

If a PCG graph scatters before the voxel runtime finishes generating, you get empty / stale output. The gate is a `WaitForVoxelWorld` node — splice one into any graph idempotently:

```text
pcg(action="voxel_ensure_wait_for_world",
    assetPath="/Game/PCG/RockScatter",
    beforeNode="PCGStaticMeshSpawner")
# => { waitNode, inserted: true, rewiredEdges: N }   # or inserted:false if already gated
```

`beforeNode` is whichever node you want to gate — almost always your spawner.

## Requirements

- ue-mcp `>= 1.0.15`
- Voxel Plugin enabled in your `.uproject` (`Plugins[].Name == "Voxel"`)

## Develop

```bash
git clone https://github.com/db-lyon/ue-mcp-plugin-voxel-plugin.git
cd ue-mcp-plugin-voxel-plugin
npm install
npm run build
```

## License

MIT - see `LICENSE`.
