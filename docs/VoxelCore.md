# VoxelCore — API Reference

The foundation module. No voxel concepts live here — `VoxelCore` provides containers, math/geometry helpers, a threading model, a typed message system, a dependency-tracking primitive, and a C++/ISPC bridge that every other Voxel module sits on top of.

Path: `Plugins/Voxel/Source/VoxelCore/Public/`

`VoxelCore` loads at `PostConfigInit` so `FVoxelMessageManager`, `FVoxelDeveloperSettings`, and the ISPC runtime are available before any other module initializes.

## Public umbrella headers

- **`VoxelMinimal.h`** — the catch-all include used everywhere; pulls in containers, primitives, utilities, the message system, and most of the dependency machinery in one shot.
- **`VoxelCoreMinimal.h`** — slimmer subset for code that only needs basic types.
- **`VoxelPCH.h`** — the runtime PCH used by every non-editor Voxel module.

## Primitives (`VoxelMinimal/`)

### Bounds and intervals

| Type | Notes |
|---|---|
| `FVoxelBox` / `FVoxelBox2D` | Double-precision, **inclusive** `Min`/`Max`. Diverges from UE's `FBox` (float, exclusive max). `Infinite` and `InvertedInfinite` constants; converts from int/float vectors; Blueprint-exposed. |
| `FVoxelIntBox` / `FVoxelIntBox2D` | Integer bounds with `[Min, Max)` (Max **exclusive**). Used for chunk-aligned queries — note the asymmetry with the double-precision boxes. |
| `FVoxelInterval` / `FVoxelIntInterval` | 1-D analogues. |
| `FVoxelFastBox` | Stripped-down hot-path box. |

### Async and threading

| Type | Notes |
|---|---|
| `FVoxelFuture` / `TVoxelFuture<T>` | Voxel's analogue of `TFuture`. Holds a `TSharedRef` internally for lifetime safety; converts from promises; integrates with the Voxel task context. `ExecuteSynchronously()` blocks until ready. **Not interchangeable with `TFuture` — different ownership semantics.** |
| `FVoxelCriticalSection` | Standard critical section wrapper. |
| `TVoxelAtomic<T>` / `TVoxelAtomicStorage` | Padded `std::atomic<T>` wrapper that adds cacheline padding to avoid false sharing. API: `Get/Set`, `Add`, `CompareExchange`, `Set_ReturnOld`. |
| `FVoxelShouldCancel` (in `Utilities/VoxelThreadingUtilities.h`) | Atomic flag with relaxed-load polling. Voxel uses **polling for cancellation, not callbacks** — long-running tasks check this flag at known yield points. |

### Reflection / polymorphism

| Type | Notes |
|---|---|
| `FVoxelInstancedStruct` | Runtime polymorphic struct (analogous to Epic's `TInstancedStruct`). Holds `UScriptStruct*` plus owned memory. Used wherever a struct subtree needs to be data-driven. |
| `FVoxelMaterialRef` / `FVoxelMaterialInstanceRef` | Weak+strong pair around `UMaterialInterface*` that detects recompilation by tracking a serial number. **Use this anywhere you cache a material across frames** — raw `UMaterialInterface*` cached pointers go stale on shader recompile. |
| `FVoxelArchive` / `FVoxelWriter` | Serialization wrappers. `FVoxelWriter` buffers to `TVoxelArray64<uint8>` and supports bulk POD serialization. |
| `FVoxelInternalGuid` (in `VoxelGuid.h`) | Compact GUID. |
| `FVoxelColor3` | RGB without alpha — used in render paths where alpha is a waste. |

### Dependency tracking

This is one of the more novel pieces of the module and is reused throughout the plugin.

- **`FVoxelDependency`** (in `VoxelDependency.h`) — shared, reference-counted base. Anything observable (an asset, a layer, a compiled graph) owns one.
- **`FVoxelDependencyTracker`** — held by anything that *depends* on something else. Subscribes to dependencies lazily and gets notified on invalidation.
- **`FVoxelDependencyCollector`** — builder used during a computation to record which dependencies were touched, so the resulting tracker can subscribe retroactively.
- **`FVoxelInvalidationQueue`** / **`FVoxelInvalidationCallstack`** — thread-safe deferred invalidation with optional editor callstack capture for diagnosing "why did this rebuild?"

Compare to UE's delegate model: this is the inverse direction — *dependents* track who they depend on, instead of *dependencies* maintaining a list of observers. The win is that an expensive computation just records what it reads while running; you don't pre-declare anything.

### Messages

- **`FVoxelMessage`** (`VoxelMessage.h`) — composes typed `FVoxelMessageToken` subtypes (text, group, object). Tokens hash and dedupe, so spamming the same warning collapses to one entry.
- **`FVoxelMessageManager`** (`VoxelMinimal/VoxelMessageManager.h`) — singleton that routes messages.
- **`FVoxelMessageFactory`** / **`VoxelMessageTokens.h`** — extension points for custom token types. `VoxelGraph` and `VoxelPCG` each register their own callstack token type so editor errors carry graph-aware context.
- Bridges to UE's `MessageLog` (`IMessageToken`) on the editor side.

## Containers (`VoxelMinimal/Containers/`)

The container library mostly mirrors UE's, but with stricter type checking and a few primitives UE doesn't ship.

| Container | Relationship to UE | Why use it |
|---|---|---|
| `TVoxelArray<T, Allocator>` | **Subclasses** `TArray`. | Adds `operator ReinterpretCast()` gated by the `CanCastMemory` trait. Lets you alias the same buffer as `TVoxelArray<float>` and `TVoxelArray<uint32>` without UB — useful for SoA buffers and ISPC interop. |
| `TVoxelArrayView` / `TVoxelArrayView64` | Like `TArrayView`. | Const and mutable non-owning views; zero-copy parameter passing. |
| `TVoxelBitArray` / `TVoxelBitArrayView` | Like `TBitArray`. | 64-bit words (vs UE's 32); supports moves. |
| `TVoxelChunkedArray<T, MaxBytesPerChunk>` | Like `TChunkedArray`. | Chunks default to ~16 KB, allocated separately. Used for very large arrays where contiguous allocation would fragment heap. Deferred destruction. |
| `TVoxelSparseArray<T>` | Like `TSparseArray`. | Uses a `union FValue { T Element; int32 NextFreeIndex; }` plus a bitset, not the linked-list approach. O(1) add/remove with stable indices. |
| `TVoxelChunkedSparseArray<T>` | Combination of the above. | Sparse storage that doesn't require contiguous allocation. |
| `TVoxelMap<Key, Value>` | Like `TMap`. | Tunes bucket padding to minimize struct-layout waste. |
| `TVoxelSet<T>` | Like `TSet`. | Backed by `TVoxelArray` plus `FVoxelSetIndex` (sentinel `-1` for invalid) for stable iteration. |
| `TVoxelStaticArray<T, Num>` | Like `TStaticArray`. | Constexpr-friendly; stack or inline. |
| `TVoxelStaticBitArray<NumBits>` | — | Stack-allocated bitset of fixed size. |
| `TVoxelLinkedArray<T>` | — | Doubly-linked list. |

## Utilities (`VoxelMinimal/Utilities/`)

Domain-specific helper headers. Most are obvious from name; the ones worth calling out:

- **`VoxelMathUtilities.h`** — `DivideFloor` / `DivideCeil` that handle negative operands correctly (UE's `DivideAndRoundDown` does not), `FloorLog2`, `DivideFloor_FastLog2`.
- **`VoxelThreadingUtilities.h`** — `FVoxelShouldCancel`, `FlushGameTasks()`, `ForceTick()`. Global task primitives.
- **`VoxelGeometryUtilities.h`** — non-trivial: `IsPolygonSelfIntersecting`, `IsPolygonConvex`, `IsInConvexPolygon`, `SegmentIntersectsPolygon`, `TriangulatePolygon`; ray-triangle intersection; closest-point routines.
- **`VoxelHashUtilities.h`** — `GetTypeHash` specializations, multi-value hash combining, Jenkins hash.
- **`VoxelTypeUtilities.h`** — `CanCastMemory` trait used by `TVoxelArray::operator ReinterpretCast()`, type-deduction helpers.
- **`VoxelDistanceFieldUtilities.h`** — distance-field generation primitives (used by graphs and the sculpt subsystem).
- **`VoxelInterpolationUtilities.h`** — Lerp, cubic, smoothstep variants.
- **`VoxelRenderUtilities.h`** — mesh LOD selection helpers, vertex factory glue.

Less-flashy utility headers: `VoxelArrayUtilities`, `VoxelObjectUtilities`, `VoxelStringUtilities`, `VoxelVectorUtilities`, `VoxelTextureUtilities`, `VoxelTransformUtilities`, `VoxelSystemUtilities`, `VoxelLambdaUtilities`, `VoxelIntPointUtilities`, `VoxelIntVectorUtilities`.

## Memory and buffer pools

- **`FVoxelAllocator`** — pool allocator with fixed-size pools, returns opaque `FVoxelAllocation` handles. Used internally for short-lived per-query allocations.
- **`FVoxelBufferPool`** — async-capable GPU/CPU pool returning weakly referenced `FVoxelBufferRef`. Exposes `IsOutOfMemory()`; integrates with `FVoxelFuture` for async uploads.

## Spatial structures

- **`FVoxelAABBTree`** / **`FVoxelAABBTree2D`** — AABB-tree spatial index. Stored as a struct-of-arrays (`FElementArray` with separate columns for payload + `MinX/Y/Z` + `MaxX/Y/Z`). Less fragmentation than per-element node structs.
- **`TVoxelFastOctree<T>`** — templated octree. `FNodeRef` exposes height, size, bounds (`FVoxelIntBox`), and center.
- **`TVoxelFastQuadtree<T>`** — 2-D analogue.

## ISPC bridge

- **`FVoxelISPC`** (`VoxelMinimal/VoxelISPC.h`) — exposes `ispc::float2/3/4`, `ispc::double2/3/4`, `ispc::int2/3/4`, matrices, and a re-declared `FColor`. C++ and ISPC share these as memory layouts so kernels can operate on UE data without marshaling.
- **`VoxelMacros.h`** — `INTELLISENSE_PARSER`, `VOXEL_DEBUG`, conditional debug logging. Includes IDE-detection so ReSharper/Rider doesn't choke on macros.

The build-system half of the ISPC story lives in `VoxelCore.Build.cs` — see [Modules.md](Modules.md#ispc-and-the-build-script) for the per-platform target matrix and how `.ispc` files are compiled into per-module static libraries.

## Editor-only

- **`FVoxelHeaderGenerator`** — C++ codegen helper used by editor tooling to emit `.generated.h`-style headers from plugin data (e.g., scaffolding for new function libraries).
- **`VoxelDeveloperSettings.h`** — base `UDeveloperSettings` plumbing the plugin's project-settings panels.
- **`VoxelHeightmapImporter.h`** — heightmap import (called from the editor heightmap workflow).

## Transvoxel data

- **`TransvoxelData.h`** / **`TransvoxelTransitionData.h`** — Lengyel's Transvoxel lookup tables (referenced by the meshing code in the `Voxel` module). The license requires attribution if you redistribute.

## Cross-references

- For *how* these primitives are wired into the wider plugin, see [Modules.md](Modules.md).
- The dependency-tracking primitives drive the [graph invalidation system](VoxelGraph.md#parameters-and-external-state) and the [stamp manager](Voxel.md#stamp-manager-and-runtime).
- Buffers in `VoxelGraph` build on `TVoxelArray` and the ISPC bridge — see [VoxelGraph.md](VoxelGraph.md#buffer-system).
