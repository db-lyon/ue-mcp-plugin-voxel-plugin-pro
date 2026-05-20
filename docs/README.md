# Voxel Plugin — Reference Docs

Reference docs for the [Voxel Plugin](https://voxelplugin.com) (Phyronnaz) — module map, public C++ surface per module, how the pieces fit together. They live in this repo because this is the ue-mcp wrapper for the Voxel Plugin, and the same reference material that helps wrapper-action authors also helps anyone building against the plugin from C++ or Blueprint.

These docs are **API-level reference** — what's in each module, what the public types do, how the pieces relate. They complement, not replace, the official knowledgebase at <https://docs.voxelplugin.com/knowledgebase>, which covers task-oriented "how do I do X" workflows.

## When to read what

| You want… | Go here |
|---|---|
| "How do I author a stamp / use the graph editor / set up PCG?" | [Official KB](https://docs.voxelplugin.com/knowledgebase) — those pages exist and are decent. |
| "What modules does this plugin actually ship, and how do they depend on each other?" | [Modules.md](Modules.md) |
| "What's in the foundation module — containers, math, threading, ISPC?" | [VoxelCore.md](VoxelCore.md) |
| "What's `AVoxelWorld`? What are stamps, layers, the runtime, sampling?" | [Voxel.md](Voxel.md) |
| "How does the graph compile pipeline work? What's a buffer? What nodes ship?" | [VoxelGraph.md](VoxelGraph.md) |
| "How do PCG and Voxel talk to each other?" | [VoxelPCG.md](VoxelPCG.md) |
| "What K2 nodes does the plugin add to Blueprint?" | [VoxelBlueprint.md](VoxelBlueprint.md) |
| "Is the test suite worth borrowing patterns from?" | [Tests.md](Tests.md) |

## Doc scope

These docs cover the **runtime + Blueprint** public API. Editor modules (`VoxelCoreEditor`, `VoxelEditor`, `VoxelGraphEditor`, `VoxelBlueprintEditor`, `VoxelPCGEditor`) are mentioned in [Modules.md](Modules.md) but not given their own reference pages — most of their public surface is detail customizations and Slate widgets that aren't useful to call from game code.

The plugin's `Tests/` content and `VoxelTests` module are covered as a *pattern-mining* exercise in [Tests.md](Tests.md), not as exhaustive reference.

## Conventions

- File paths are written relative to the plugin source root (`Plugins/Voxel/Source/...`) unless they're inside a code block.
- C++ type names use their actual prefixes (`F`, `U`, `A`, `T`, `S`, `I`) — `AVoxelWorld`, `UVoxelGraph`, `FVoxelBox`, `TVoxelArray<T>`.
- Where the official KB has a corresponding page, the module doc links out to it.
- Cross-doc links between these pages use relative paths so they work on disk and on a wiki host.

## Plugin metadata

- Source: <https://voxelplugin.com>
- Docs (official, task-focused): <https://docs.voxelplugin.com/knowledgebase>
- Discord (support): <https://discord.voxelplugin.com>
- License: see `Plugins/Voxel/LICENSES.txt` in the plugin itself. Note in particular the Transvoxel attribution requirement called out in [VoxelCore.md](VoxelCore.md#transvoxel-data).
- Loaded by default (`EnabledByDefault: true` in `Voxel.uplugin`).

## Doc maintenance

When the upstream plugin is bumped to a new version, this is what to refresh:

1. [Modules.md](Modules.md) — re-read every `*.Build.cs`; phases and module-name changes happen at major version bumps.
2. Per-module docs — `Glob` `Public/**/*.h` and reconcile against the listings here. New top-level types deserve a row; deleted ones should be removed.
3. [Tests.md](Tests.md) — re-run the include-test count and check `VoxelTests.Build.cs` for new infrastructure files.
