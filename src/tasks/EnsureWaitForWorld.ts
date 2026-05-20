import { BaseTask, type TaskResult } from "@db-lyon/flowkit";

interface Options {
  assetPath: string;
  /**
   * The PCG node you want to gate on the voxel world being ready —
   * almost always the spawner that materializes the final result
   * (PCGStaticMeshSpawner, PCGVoxelStampSpawner, etc.). Whichever
   * nodes currently feed `beforeNode` get rerouted through a new
   * `WaitForVoxelWorld` node.
   */
  beforeNode: string;
}

interface GraphNode { name: string; title: string; }
interface GraphEdge { from: string; fromPin?: string; to: string; toPin?: string; }
interface GraphData { nodes?: GraphNode[]; edges?: GraphEdge[]; }
interface AddNodeData { nodeName?: string; }

const WAIT_NODE_TITLE = "Wait For Voxel World";
const WAIT_NODE_TYPE = "/Script/VoxelPCG.PCGWaitForVoxelWorldSettings";

/**
 * Insert a `WaitForVoxelWorld` node immediately upstream of `beforeNode`
 * in an existing PCG graph. Idempotent: if any node already feeding
 * `beforeNode` is a Wait node, returns `inserted: false` and changes
 * nothing.
 *
 * Header: `VoxelPCG/Public/PCGWaitForVoxelWorld.h`
 * (`UPCGWaitForVoxelWorldSettings`, control-flow node, no settings).
 *
 * Fixes the most common PCG-on-voxel footgun documented in
 * `docs/VoxelPCG.md`: pipelines that scatter / stamp before the voxel
 * runtime finishes generating produce empty or stale output. The Wait
 * node blocks downstream execution until the voxel world is ready.
 */
export default class EnsureWaitForWorld extends BaseTask<Options> {
  get taskName(): string { return "voxel.ensure_wait_for_world"; }

  protected validate(): void {
    if (!this.options.assetPath) throw new Error("assetPath is required");
    if (!this.options.beforeNode) throw new Error("beforeNode is required");
  }

  async execute(): Promise<TaskResult> {
    const { assetPath, beforeNode } = this.options;

    const graphR = await this.call("pcg.read_graph", { assetPath });
    if (!graphR.success) return graphR;
    const graph = (graphR.data ?? {}) as GraphData;
    const nodes = graph.nodes ?? [];
    const edges = graph.edges ?? [];

    if (!nodes.some(n => n.name === beforeNode)) {
      return { success: false, error: new Error(`node '${beforeNode}' not found in ${assetPath}`) };
    }

    const inbound = edges.filter(e => e.to === beforeNode);
    if (inbound.length === 0) {
      return { success: false, error: new Error(`no edges flow into '${beforeNode}' in ${assetPath} — nothing to gate`) };
    }

    const nodesByName = new Map(nodes.map(n => [n.name, n]));
    const alreadyGated = inbound
      .map(e => nodesByName.get(e.from))
      .find(n => n?.title === WAIT_NODE_TITLE);
    if (alreadyGated) {
      return {
        success: true,
        data: { assetPath, beforeNode, waitNode: alreadyGated.name, inserted: false, rewiredEdges: 0 },
      };
    }

    const waitR = await this.call("pcg.add_node", { assetPath, nodeType: WAIT_NODE_TYPE });
    if (!waitR.success) return waitR;
    const waitName = (waitR.data as AddNodeData | undefined)?.nodeName;
    if (!waitName) {
      return { success: false, error: new Error("pcg.add_node WaitForVoxelWorld returned no nodeName") };
    }

    for (const e of inbound) {
      const dis = await this.call("pcg.disconnect_nodes", {
        assetPath,
        sourceNode: e.from,
        sourcePin: e.fromPin,
        targetNode: e.to,
        targetPin: e.toPin,
      });
      if (!dis.success) return dis;

      const c1 = await this.call("pcg.connect_nodes", {
        assetPath,
        sourceNode: e.from,
        sourcePin: e.fromPin,
        targetNode: waitName,
      });
      if (!c1.success) return c1;

      const c2 = await this.call("pcg.connect_nodes", {
        assetPath,
        sourceNode: waitName,
        targetNode: beforeNode,
        targetPin: e.toPin,
      });
      if (!c2.success) return c2;
    }

    return {
      success: true,
      data: { assetPath, beforeNode, waitNode: waitName, inserted: true, rewiredEdges: inbound.length },
    };
  }
}
