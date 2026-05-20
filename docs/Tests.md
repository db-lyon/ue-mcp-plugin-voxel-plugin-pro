# VoxelTests — What's in It, What It's Worth Borrowing

> Audience: a senior UE5 engineer evaluating whether the plugin's testing approach is worth borrowing for their own project.

## Overview

Phyronnaz's `VoxelTests` module is split into two surfaces:

- a **content-driven integration layer** — 23 test maps and 127 supporting assets under `Plugins/Voxel/Tests/`
- a **header include-safety harness** — 96 source files under `Plugins/Voxel/Source/VoxelTests/Private/`

The framework is lightweight and **eschews UE Automation** (`IMPLEMENT_SIMPLE_AUTOMATION_TEST`) entirely. Instead, it implements a custom **Blueprint-callable test harness** that loads maps in sequence, tracks pass/fail state, captures screenshots, and emits a JSON report suitable for CI. A separate startup hook auto-generates one `.cpp` per public header to verify every header compiles in isolation.

## Layout

### `Plugins/Voxel/Tests/` — content integration tests

- 23 `.umap` test maps covering gameplay, rendering, stamping, navigation
- 127 supporting assets (materials, graphs, meshes)
- Total: 150 files
- Folders: `Assets/`, `BasicGameplay/`, `BasicSplines/`, `CurveNode/`, `DistanceFields/`, `GradientTest/`, `Lumen/`, `MaterialRendering/{CurveMaterial,Gravel,MuddyLeaves}/`, `Metadata/`, `MetadataQueries/`, `Navigation/`, `OverrideGraphs/`, `PCGWorld/`, `Queries/`, `RVT/`, `Sculpting/`, `SmoothBlendsAndSmartSurfaces/`, `TangentNormals/`, `Velocity/`, `WPO/`

### `Plugins/Voxel/Source/VoxelTests/` — native infrastructure

- 96 source files (90 `.cpp` + 6 headers)
- 85 auto-generated include-test stubs in `VoxelCoreIncludeTest/` — one `.cpp` per `VoxelMinimal/` header
- 6 manual infrastructure files:
  - `VoxelTestsModule.cpp` — module entry, CLI flag handling (`-VoxelTests`, `-RunVoxelTests`)
  - `VoxelTestManager.h/.cpp` — singleton: map sequencing, JSON serialization
  - `VoxelTestLibrary.h/.cpp` — Blueprint-exposed test API
  - `VoxelTestPCH.h` — lightweight include guard for `VoxelCoreMinimal.h`
  - `VoxelCoreIncludeTestGenerator.cpp` — startup hook that creates the stubs

The `Build.cs` is intentionally tiny:

```csharp
public VoxelTests(ReadOnlyTargetRules Target) : base(Target)
{
    if (new VoxelConfig(this).DevWorkflow)
    {
        // Needed by include testing
        PrivatePCHHeaderFile = "Private/VoxelTestPCH.h";
    }

    PublicDependencyModuleNames.AddRange(new string[] { "Json" });
    PrivateDependencyModuleNames.AddRange(new string[] { "NavigationSystem" });
}
```

## Framework

### Custom Blueprint-driven, not UE Automation

There are **no `IMPLEMENT_SIMPLE_AUTOMATION_TEST` macros**. Instead:

1. **Blueprint layer:** call `UVoxelTestLibrary::StartTest(Name)` → returns `FVoxelTestHandle`.
2. **State machine:** each test transitions `Started → Succeeded | Failed`.
3. **Manager orchestration** (`FVoxelTestManager` singleton):
   - Sequentially loads test maps from `/Game/VoxelTests/`.
   - Collects pass/fail results, warnings, errors, screenshot GUIDs.
   - Writes JSON to `Saved/VoxelTests/VoxelTests.json`.
   - Captures high-res screenshots on demand.

Activation: console command `voxel.tests.Start` or CLI flag `-RunVoxelTests` (non-editor mode only).

### Naming

| Surface | Convention |
|---|---|
| Test maps | `TEST_<Feature>.umap` (`TEST_BasicGameplay.umap`, `TEST_Gradient.umap`) |
| Assets | `TEST_<Type>_<Name>.uasset` (`TEST_VHG_Gradient.uasset`, `TEST_MI_Gravel_Red.uasset`) |
| Include-test stubs | `VoxelCoreIncludeTest_<Category>_<HeaderName>.cpp` |

### Custom assertion macros: none

No `VOXEL_TEST_*` macros. The Blueprint-callable surface is the API:

```cpp
UFUNCTION(BlueprintCallable, Category = "Voxel|Tests")
static FVoxelTestHandle StartTest(const FString& Name);

UFUNCTION(BlueprintCallable, Category = "Voxel|Tests")
static void PassTest(const FVoxelTestHandle& Handle);

UFUNCTION(BlueprintCallable, Category = "Voxel|Tests")
static void FailTest(const FVoxelTestHandle& Handle, const FString& Reason);

UFUNCTION(BlueprintCallable, Category = "Voxel|Tests")
static void TakeScreenshot(const FGuid& Guid);
```

Tests call these from Blueprint event graphs (typically on a timer or completion callback). Standard `check()` / `ensure()` are intercepted by `FVoxelTestsOutputDevice` for logging.

### No BDD / spec layer

Purely imperative, map-and-actor-driven: an actor in the map handles setup/teardown on `BeginPlay`, the BP graph waits for a completion condition, then calls `FailTest` or `PassTest`.

## Fixture and runtime setup

### Minimal `VoxelRuntime` bootstrapping

Tests do **not** spawn an in-memory `AVoxelWorld` CDO. Instead:

1. **Editor-mounted content:** the module registers `Plugins/Voxel/Tests/` as a game path at startup:
   ```cpp
   FPackageName::RegisterMountPoint("/Game/VoxelTests/", DiskPath);
   ```
2. **Per-map setup:** each test map ships a custom test actor (e.g. `TEST_BasicGameplayActor.uasset`) that:
   - executes on `BeginPlay`,
   - configures nav generation (`SetNavMeshGeneration(bRuntime)`),
   - spawns the runtime objects under test (VoxelWorld refs, stamps, AI pawns),
   - calls `StartTest` and monitors for completion.
3. **World lifespan:** entire map persists for the test; teardown destroys all actors after reporting.

### Asset loading

- No transient CDOs — all test assets are pre-authored, disk-resident under `Plugins/Voxel/Tests/Assets/`.
- Graphs are pre-built `UVoxelHeightGraph` / `UVoxelVolumeGraph` `.uasset`s.
- Meshes & materials are standard UE5 content.

### No explicit mocking

- GPU / render targets: used as-is.
- Navigation: gated via `SetNavMeshGeneration(bool bRuntime)` which flips `ERuntimeGenerationType` and triggers a rebuild.
- Threading / task graph: no abstraction; tests run synchronously or wait on async callbacks.

## Coverage map

### What's tested

| Area | Maps | Notes |
|---|---|---|
| Graph evaluation | `GradientTest`, `CurveNode` | Height/volume graph outputs, curve sampling. |
| Stamping & blending | `PCGWorld`, `OverrideGraphs`, `SmoothBlendsAndSmartSurfaces` | Procedural stamp application, blend-mode overrides. |
| Voxel rendering | `MaterialRendering/*`, `Lumen`, `Metadata` | Material slots, translucency, emissive, per-voxel metadata. |
| Serialization & I/O | `DistanceFields` | Distance-field bake + round-trip. |
| Gameplay integration | `BasicGameplay`, `Navigation` | Voxel-aware AI, character movement, navmesh. |
| Advanced rendering | `TangentNormals`, `WPO`, `RVT`, `Velocity` | Tangent normals, world-position offset, runtime VT, motion vectors. |
| Splines | `BasicSplines` | Spline-driven voxel deformation. |

### What's NOT tested

- Editor UI (menus, property panels).
- Networking / replication / multiplayer integration.
- Cross-module plugin build sanity beyond compile.
- Performance — maps exist but no automated perf gates; manual profiling only.

Maps are **functional full-stack integration tests**: spawn a VoxelWorld (or load a pre-baked one), run a gameplay loop, assert the final state from Blueprint. No unit tests for individual containers or utilities — those are guarded by the include-testing layer below.

## Include self-containment checks

**File:** `Plugins/Voxel/Source/VoxelTests/Private/VoxelCoreIncludeTestGenerator.cpp`

On startup (when `VOXEL_DEV_WORKFLOW && VOXEL_DEBUG`) the module:

1. Scans `VoxelCore/Public/VoxelMinimal/` for every `.h`.
2. Generates one `.cpp` stub per header, including it in isolation:
   ```cpp
   // Example: VoxelCoreIncludeTest_Containers_VoxelArray.cpp
   #include "VoxelCoreMinimal.h"
   #if VOXEL_DEV_WORKFLOW && VOXEL_DEBUG
   #include "VoxelMinimal/Containers/VoxelArray.h"  // the real include
   #endif
   ```
3. Forces the PCH to `VoxelTestPCH.h` only when dev-workflow is on, so the linker compiles all 85+ stubs.
4. Any header that fails standalone (missing transitive include, circular dep) breaks the build.

Why it matters: this catches the classic "works in unity build, fails in incremental compile" failure mode without anyone writing a manual test. Header hygiene is enforced by the build, not by code review.

## Honest assessment

### Strengths

1. **Include-testing discipline is best-in-class.** The auto-generated stub generator is the standout pattern.
2. **Lightweight infrastructure** — no Catch2, no GoogleTest, no UE Automation boilerplate.
3. **Blueprint-testable gameplay** — designers can write integration tests in maps + event graphs.
4. **JSON output for CI** — pipeline-friendly result format.
5. **Built-in screenshot capture** — visual regression hook is in place even if not fully automated.

### Weaknesses

1. **Sparse unit-test coverage.** 91 `VoxelMinimal/` headers but only compile-validation, not runtime assertions on container ops.
2. **No spec / BDD language.** Test intent is implicit in map names.
3. **Content-heavy and fragile.** 23 maps × dozens of assets is a big footprint and renames silently break tests.
4. **Limited documentation.** No README per map explaining what it validates.
5. **Sequential map loading.** No parallelization for CI time savings.
6. **Manual failure diagnosis.** Errors go to log + JSON; reading logs is required to debug.

### Verdict

Solid but narrowly-focused. The include-testing pattern is excellent and worth lifting wholesale. The content-map integration layer is a workable smoke-test layer but not a template for comprehensive TDD.

## Patterns worth borrowing

### 1. Auto-generated header compliance tests

**Source:** `Plugins/Voxel/Source/VoxelTests/Private/VoxelCoreIncludeTestGenerator.cpp`

A startup hook that scans a module's `Public/` tree, generates one `.cpp` per `.h` including it standalone, and gates the PCH so the linker compiles them all. Catches transitive-include bugs and missing forward decls without writing manual tests.

Wire it up by gating a dedicated test PCH on a dev flag:

```csharp
if (bIsDevBuild)
{
    PrivatePCHHeaderFile = "Private/YourModuleTestPCH.h";
}
```

### 2. Blueprint-callable test harness

**Source:** `Plugins/Voxel/Source/VoxelTests/Private/VoxelTestLibrary.h`

Expose `StartTest(Name)`, `PassTest(Handle)`, `FailTest(Handle, Reason)` as `UFUNCTION(BlueprintCallable)`. Pairs naturally with map-driven testing — designers can author tests without touching C++.

Add gameplay-specific assertion helpers alongside:

```cpp
UCLASS()
class YOURMODULE_API UYourTestLibrary : public UBlueprintFunctionLibrary
{
public:
    UFUNCTION(BlueprintCallable, Category = "YourModule|Tests")
    static void AssertActorCount(const FString& TestName, int32 Expected, int32 Actual);

    UFUNCTION(BlueprintCallable, Category = "YourModule|Tests")
    static void AssertFloatAlmostEqual(const FString& TestName, float Expected, float Actual, float Tolerance = 0.01f);
};
```

### 3. Automated screenshot capture for visual regression

**Source:** `Plugins/Voxel/Source/VoxelTests/Private/VoxelTestLibrary.cpp` (~lines 81–113)

`TakeScreenshot(FGuid)` wraps `HighResShot` and saves to `Saved/VoxelTests/<MapName>/<Guid>.png`. Adding hash- or perceptual-diff comparison turns it into a real visual baseline system.

### 4. Custom `FOutputDevice` for warning / error tracking

**Source:** `Plugins/Voxel/Source/VoxelTests/Private/VoxelTestManager.cpp` (~lines 22–100, `FVoxelTestsOutputDevice`)

Subclass `FOutputDevice`, register with `GLog`, intercept warnings/errors with stack traces, serialize to JSON. Detects silent failures — `ensure()` firing without an explicit `FailTest`.

### 5. Explicit test state machine

**Source:** `Plugins/Voxel/Source/VoxelTests/Private/VoxelTestManager.h` (~lines 9–14, `EVoxelTestState`)

`{ Started, Succeeded, Failed }` enum with transition validation. Catches double-pass / double-fail bugs in the test code itself.

### 6. Per-map JSON serialization for CI

**Source:** `Plugins/Voxel/Source/VoxelTests/Private/VoxelTestManager.cpp` (~lines 123–181)

Per-test pass/fail, screenshots, warnings, errors, raytracing status. Pipelines (Gitea Actions, Jenkins, GitHub Actions) parse this directly to fail the build and link to detailed reports.

## Recommended adoption order

1. **Include-testing pattern first.** Lowest friction, highest immediate value. Start with your smallest-surface module, then expand.
2. **Project test library** with gameplay-specific assertions: fuzzy compare, actor count, component state, GAS attribute equality.
3. **Visual baseline on top of screenshot capture** — hash or perceptual diff in CI.
4. **Document test maps** with a README per map (goal, expected result, manual verification).
5. **Defer parallelization** — sequential map loading is fine until tests exceed ~50.
6. **Add perf gates separately:** log frame time, draw calls, memory per map; fail on delta thresholds. Voxel doesn't do this and probably should.

## Summary

| Aspect | Voxel approach | Notes |
|---|---|---|
| Framework | Custom Blueprint + manager | Low overhead, gameplay-friendly. |
| Coverage | Content maps + include stubs | Integration-focused; unit coverage thin. |
| Assertion macros | None (UE `check`/`ensure` + custom output device) | No DSL to learn. |
| Fixtures | Disk-resident assets, per-map actors | Reusable, but fragile to refactor. |
| CI integration | JSON output | Parse anywhere. |
| Header safety | Auto-generated stubs | Best-in-class — adopt as-is. |
| BDD / spec | None | Consider adding for docs. |
| Mocking | Minimal (real GPU, threading) | May need expansion for subsystem tests. |

## Cross-references

- The headers being include-tested live in [VoxelCore](VoxelCore.md).
- `FVoxelTestsOutputDevice` integrates with the [VoxelCore message system](VoxelCore.md#messages).
