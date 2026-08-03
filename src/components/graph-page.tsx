"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 44;

function layout(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 28, ranksep: 44, marginx: 24, marginy: 24 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      return {
        ...n,
        position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      };
    }),
    edges,
  };
}

function GraphNode({
  data,
}: {
  data: { label: string; state: "secured" | "locked" | "ready" };
}) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-[var(--color-muted)]" />
      <div
        className={cn(
          "flex h-full w-full items-center gap-2 rounded-lg border px-3 font-mono text-[11px]",
          data.state === "secured" &&
            "border-[var(--color-good)] bg-[var(--color-good)]/10 text-[var(--color-good)]",
          data.state === "ready" &&
            "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
          data.state === "locked" &&
            "border-[var(--color-surface-strong)] bg-[var(--color-surface)] text-[var(--color-muted)]",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            data.state === "secured" && "bg-[var(--color-good)]",
            data.state === "ready" && "bg-[var(--color-accent)]",
            data.state === "locked" && "bg-[var(--color-muted)]",
          )}
        />
        <span className="truncate">{data.label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--color-muted)]" />
    </>
  );
}

const nodeTypes = { prereq: GraphNode };

export function GraphPage() {
  const params = useParams<{ deckId: string }>();
  const deckId = params.deckId;

  const { data: deck } = useQuery({
    queryKey: queryKeys.deck(deckId),
    queryFn: () => api.getDeck(deckId),
  });
  const { data: graph } = useQuery({
    queryKey: queryKeys.graph(deckId),
    queryFn: () => api.getGraph(deckId),
  });

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const ns: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      type: "prereq",
      data: { label: n.label, state: n.state },
      position: { x: 0, y: 0 },
    }));
    const es: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.prereqId,
      target: e.dependentId,
      style: { stroke: "var(--color-muted)", strokeWidth: 1.5 },
    }));
    return layout(ns, es);
  }, [graph]);

  if (!graph) {
    return (
      <section className="flex min-h-[50vh] items-center justify-center">
        <p className="font-mono text-xs text-[var(--color-muted)]">
          loading graph…
        </p>
      </section>
    );
  }

  return (
    <section className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-[calc(100dvh-3rem)]">
      <header className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/deck/${deckId}`}
            className="flex w-fit items-center gap-1.5 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {deck?.name ?? "Deck"}
          </Link>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-good)]" />
            secured
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            ready
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)]" />
            locked
          </span>
        </div>
      </header>
      <div className="min-h-0 flex-1 rounded-xl border border-[var(--color-surface)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          nodesConnectable={false}
          className="[&_.react-flow__edge-path]:!stroke-[var(--color-muted)]"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--color-surface-strong)" gap={20} />
          <Controls
            className="!border-[var(--color-surface-strong)] !bg-[var(--color-canvas)] [&_button]:!text-[var(--color-muted)] [&_button]:!border-[var(--color-surface-strong)]"
          />
        </ReactFlow>
      </div>
    </section>
  );
}
