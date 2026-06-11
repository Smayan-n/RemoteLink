import {
  drag as d3drag,
  forceCollide,
  forceLink,
  forceSimulation,
  forceX,
  forceY,
  select,
  zoom as d3zoom,
  zoomIdentity,
} from "d3";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { binToHex, packetKey, paletteForBtn, remoteAccent } from "../../lib/format";
import { EMPTY_MACRO_BINDING, macroDisplayName } from "../../lib/macros";
import ButtonNode from "./ButtonNode";
import RemoteNode from "./RemoteNode";
import {
  BUTTON_H,
  BUTTON_W,
  CLUSTER_RADIUS,
  REMOTE_H,
  REMOTE_W,
  buildD3Graph,
  buttonNodeId,
  computeStructureSignature,
  edgeId,
  remoteNodeId,
} from "./buildGraph";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Custom d3 force: springs every button toward its fixed slot on a circle
 * around its parent remote. Because the target is recomputed from the remote's
 * live position each tick, buttons orbit at a constant distance and trail the
 * remote (springily) whenever it moves or is dragged.
 */
function orbitForce(strength = 0.32) {
  let nodes = [];

  function force(alpha) {
    for (const node of nodes) {
      if (node.type !== "button" || !node._remote) continue;
      const remote = node._remote;
      const tx = remote.x + node._r * Math.cos(node._angle);
      const ty = remote.y + node._r * Math.sin(node._angle);
      node.vx += (tx - node.x) * strength * alpha;
      node.vy += (ty - node.y) * strength * alpha;
    }
  }

  force.initialize = (_nodes) => {
    nodes = _nodes;
  };

  return force;
}

/**
 * Custom d3 force: keeps whole clusters apart by pushing any two remotes
 * (and therefore their orbits) away from each other when their centers get
 * closer than `minDist`. Operates only on remote nodes so it never disturbs
 * a remote's own button ring.
 */
function separationForce(minDist, strength = 0.6) {
  let remotes = [];

  function force(alpha) {
    for (let i = 0; i < remotes.length; i += 1) {
      const a = remotes[i];
      for (let j = i + 1; j < remotes.length; j += 1) {
        const b = remotes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        if (d < minDist) {
          const push = ((minDist - d) / d) * strength * alpha * 0.5;
          dx *= push;
          dy *= push;
          a.vx -= dx;
          a.vy -= dy;
          b.vx += dx;
          b.vy += dy;
        }
      }
    }
  }

  force.initialize = (nodes) => {
    remotes = nodes.filter((n) => n.type === "remote");
  };

  return force;
}

export default function GraphCanvas({
  remotes,
  remoteOrder,
  heldButtons,
  zoomPress,
  draftNames,
  setDraftNames,
  selectedButton,
  onSelectButton,
  onRegister,
  onRenameRemote,
  macroBindings,
  autoZoom,
}) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);

  const simRef = useRef(null);
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const nodeByIdRef = useRef(new Map());
  const nodeElsRef = useRef(new Map());
  const edgeElsRef = useRef(new Map());
  const zoomRef = useRef(null);
  const transformRef = useRef(zoomIdentity);
  const prevRemoteCountRef = useRef(0);

  // Descriptors that drive React rendering of node/edge elements.
  const [graphNodes, setGraphNodes] = useState([]);
  const [graphLinks, setGraphLinks] = useState([]);

  const structureSig = useMemo(
    () => computeStructureSignature(remoteOrder, remotes),
    [remoteOrder, remotes],
  );

  const handleDraftChange = useCallback(
    (remoteId, value) => {
      setDraftNames((prev) => ({ ...prev, [remoteId]: value }));
    },
    [setDraftNames],
  );

  // Write current simulation positions straight to the DOM (no React re-render).
  const renderPositions = useCallback(() => {
    const nodeEls = nodeElsRef.current;
    for (const node of nodesRef.current) {
      const el = nodeEls.get(node.id);
      if (el) {
        el.style.transform = `translate(${node.x}px, ${node.y}px) translate(-50%, -50%)`;
      }
    }
    const edgeEls = edgeElsRef.current;
    for (const link of linksRef.current) {
      const line = edgeEls.get(link.id);
      if (line && link.source.x != null && link.target.x != null) {
        line.setAttribute("x1", link.source.x);
        line.setAttribute("y1", link.source.y);
        line.setAttribute("x2", link.target.x);
        line.setAttribute("y2", link.target.y);
      }
    }
  }, []);

  const applyTransform = useCallback((t) => {
    transformRef.current = t;
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    }
  }, []);

  // Smoothly move the viewport so the given node ids fill the canvas.
  const zoomToNodes = useCallback(
    (ids, { padding = 90, maxK = 1.6, duration = 600 } = {}) => {
      const container = containerRef.current;
      const zoomBehavior = zoomRef.current;
      if (!container || !zoomBehavior || ids.length === 0) return;

      const rect = container.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const id of ids) {
        const node = nodeByIdRef.current.get(id);
        if (!node || node.x == null) continue;
        const halfW = (node.type === "remote" ? REMOTE_W : BUTTON_W) / 2;
        const halfH = (node.type === "remote" ? REMOTE_H : BUTTON_H) / 2;
        minX = Math.min(minX, node.x - halfW);
        minY = Math.min(minY, node.y - halfH);
        maxX = Math.max(maxX, node.x + halfW);
        maxY = Math.max(maxY, node.y + halfH);
      }
      if (!Number.isFinite(minX)) return;

      const bw = Math.max(maxX - minX, 1);
      const bh = Math.max(maxY - minY, 1);
      const k = clamp(
        Math.min(
          (rect.width - padding * 2) / bw,
          (rect.height - padding * 2) / bh,
        ),
        MIN_ZOOM,
        maxK,
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const tx = rect.width / 2 - cx * k;
      const ty = rect.height / 2 - cy * k;
      const target = zoomIdentity.translate(tx, ty).scale(k);

      select(container)
        .transition()
        .duration(duration)
        .call(zoomBehavior.transform, target);
    },
    [],
  );

  const fitAll = useCallback(
    (duration = 500) => {
      zoomToNodes(
        nodesRef.current.map((n) => n.id),
        { padding: 70, maxK: 1.2, duration },
      );
    },
    [zoomToNodes],
  );

  // --- One-time setup: simulation + zoom/pan behavior ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const rect = container.getBoundingClientRect();

    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const simulation = forceSimulation([])
      // link force only resolves source/target refs for edge drawing (no pull)
      .force(
        "link",
        forceLink([])
          .id((d) => d.id)
          .strength(0),
      )
      // small radius so a remote never shoves its own orbiting buttons
      .force(
        "collide",
        forceCollide()
          .radius((d) => (d.type === "remote" ? REMOTE_W / 2 - 6 : BUTTON_W / 2 + 6))
          .strength(0.8),
      )
      // buttons spring onto their fixed orbit around the parent remote
      .force("orbit", orbitForce(0.34))
      // keep whole clusters from overlapping each other
      .force("separate", separationForce(CLUSTER_RADIUS * 2))
      // remotes drift toward the graph center so they cluster there
      .force(
        "x",
        forceX(cx).strength((d) => (d.type === "remote" ? 0.06 : 0)),
      )
      .force(
        "y",
        forceY(cy).strength((d) => (d.type === "remote" ? 0.06 : 0)),
      )
      .on("tick", renderPositions);

    simRef.current = simulation;

    const zoomBehavior = d3zoom()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .filter((event) => {
        // Allow wheel/pinch everywhere; only block pan-starts that begin on a node.
        if (event.type === "wheel") return true;
        if (event.target.closest?.("[data-node]")) return false;
        return !event.button;
      })
      .on("zoom", (event) => applyTransform(event.transform));

    zoomRef.current = zoomBehavior;
    select(container).call(zoomBehavior).on("dblclick.zoom", null);

    return () => {
      simulation.stop();
      select(container).on(".zoom", null);
    };
  }, [renderPositions, applyTransform]);

  // --- Rebuild graph data when topology changes ---
  useEffect(() => {
    const { nodes, links } = buildD3Graph({ remotes, remoteOrder });

    // Preserve positions/velocities of nodes that already existed.
    const prev = nodeByIdRef.current;
    for (const node of nodes) {
      const old = prev.get(node.id);
      if (old) {
        node.x = old.x;
        node.y = old.y;
        node.vx = old.vx;
        node.vy = old.vy;
        node.fx = old.fx;
        node.fy = old.fy;
      }
    }

    const byId = new Map(nodes.map((n) => [n.id, n]));
    nodesRef.current = nodes;
    linksRef.current = links;
    nodeByIdRef.current = byId;

    const sim = simRef.current;
    if (sim) {
      sim.nodes(nodes);
      sim.force("link").links(links);
      sim.alpha(0.9).restart();
    }

    setGraphNodes(
      nodes.map((n) => ({
        id: n.id,
        type: n.type,
        remoteId: n.remoteId,
        btnId: n.btnId,
      })),
    );
    setGraphLinks(links.map((l) => ({ id: l.id, remoteId: l.remoteId, btnId: l.btnId })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on signature only
  }, [structureSig]);

  // Fit the whole graph only when a NEW remote appears.
  useEffect(() => {
    if (remoteOrder.length === 0) {
      prevRemoteCountRef.current = 0;
      return;
    }
    if (remoteOrder.length !== prevRemoteCountRef.current) {
      prevRemoteCountRef.current = remoteOrder.length;
      const t = setTimeout(() => fitAll(550), 480);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [remoteOrder.length, fitAll]);

  // Auto-zoom to the whole triggered cluster — the remote plus ALL of its
  // buttons (the pressed one included) so the full ring stays in view.
  useEffect(() => {
    if (!autoZoom || !zoomPress) return undefined;
    const rid = zoomPress.remote_id;
    const buttons = remotes[rid]?.buttons ?? [];
    const ids = [
      remoteNodeId(rid),
      ...buttons.map((btnId) => buttonNodeId(rid, btnId)),
    ];
    // small delay lets a brand-new node settle a little before framing it
    const t = setTimeout(
      () => zoomToNodes(ids, { padding: 80, maxK: 1.35, duration: 550 }),
      120,
    );
    return () => clearTimeout(t);
  }, [zoomPress, autoZoom, zoomToNodes, remotes]);

  // (Re)attach drag behavior whenever the set of node elements changes.
  useLayoutEffect(() => {
    const sim = simRef.current;
    const container = containerRef.current;
    if (!sim || !container) return;

    renderPositions();

    for (const desc of graphNodes) {
      const el = nodeElsRef.current.get(desc.id);
      const node = nodeByIdRef.current.get(desc.id);
      if (!el || !node) continue;

      let didDrag = false;
      const behavior = d3drag()
        .clickDistance(6)
        .filter((event) => !event.target.closest?.(".nodrag"))
        .on("start", () => {
          didDrag = false;
          sim.alphaTarget(0.3).restart();
        })
        .on("drag", (event) => {
          didDrag = true;
          const rect = container.getBoundingClientRect();
          const t = transformRef.current;
          node.fx = (event.sourceEvent.clientX - rect.left - t.x) / t.k;
          node.fy = (event.sourceEvent.clientY - rect.top - t.y) / t.k;
        })
        .on("end", () => {
          sim.alphaTarget(0);
          // Remotes pin where dropped (manual arrange); buttons always spring
          // back to their orbit so the ring layout is preserved.
          if (didDrag && node.type === "remote") {
            node.fx = node.x;
            node.fy = node.y;
          } else {
            node.fx = null;
            node.fy = null;
          }
        });

      select(el).call(behavior);
    }
  }, [graphNodes, renderPositions]);

  const releaseLayout = useCallback(() => {
    for (const node of nodesRef.current) {
      node.fx = null;
      node.fy = null;
    }
    simRef.current?.alpha(0.9).restart();
    setTimeout(() => fitAll(550), 550);
  }, [fitAll]);

  const zoomBy = useCallback((factor) => {
    const container = containerRef.current;
    const zoomBehavior = zoomRef.current;
    if (!container || !zoomBehavior) return;
    select(container)
      .transition()
      .duration(220)
      .call(zoomBehavior.scaleBy, factor);
  }, []);

  const heldByButtonId = useMemo(() => {
    const map = new Map();
    for (const hold of Object.values(heldButtons ?? {})) {
      map.set(buttonNodeId(hold.remote_id, hold.btn_id), hold);
    }
    return map;
  }, [heldButtons]);

  const heldRemoteIds = useMemo(() => {
    const ids = new Set();
    for (const hold of Object.values(heldButtons ?? {})) {
      ids.add(hold.remote_id);
    }
    return ids;
  }, [heldButtons]);

  return (
    <div ref={containerRef} className="d3-canvas">
      <div ref={worldRef} className="d3-world">
        <svg className="d3-edges" width={1} height={1}>
          {graphLinks.map((link) => {
            const palette = paletteForBtn(link.btnId);
            const active = heldByButtonId.has(buttonNodeId(link.remoteId, link.btnId));
            return (
              <line
                key={link.id}
                ref={(el) => {
                  if (el) edgeElsRef.current.set(link.id, el);
                  else edgeElsRef.current.delete(link.id);
                }}
                className={active ? "d3-edge--active" : ""}
                stroke={active ? palette.base : "rgba(100, 116, 139, 0.32)"}
                strokeWidth={active ? 2.25 : 1.25}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {graphNodes.map((desc) => {
          const refCb = (el) => {
            if (el) nodeElsRef.current.set(desc.id, el);
            else nodeElsRef.current.delete(desc.id);
          };

          if (desc.type === "remote") {
            const remote = remotes[desc.remoteId];
            const firing = heldRemoteIds.has(desc.remoteId);
            return (
              <div
                key={desc.id}
                ref={refCb}
                data-node
                className="d3-node d3-node-handle"
              >
                <RemoteNode
                  remoteId={desc.remoteId}
                  registered={remote?.registered ?? false}
                  name={remote?.name ?? ""}
                  draftName={draftNames[desc.remoteId] ?? ""}
                  buttonCount={remote?.buttons?.length ?? 0}
                  accent={remoteAccent(desc.remoteId)}
                  firing={firing}
                  onDraftChange={handleDraftChange}
                  onRegister={onRegister}
                  onRenameRemote={onRenameRemote}
                />
              </div>
            );
          }

          const hold = heldByButtonId.get(desc.id);
          const active = hold != null;
          const selected =
            selectedButton != null &&
            selectedButton.remoteId === desc.remoteId &&
            selectedButton.btnId === desc.btnId;
          const binding =
            macroBindings?.[packetKey(desc.remoteId, desc.btnId)] ??
            EMPTY_MACRO_BINDING;
          const macroName =
            binding.actionType !== "none" ? macroDisplayName(binding) : null;

          return (
            <div key={desc.id} ref={refCb} data-node className="d3-node">
              <ButtonNode
                btnHex={binToHex(desc.btnId)}
                btnId={desc.btnId}
                palette={paletteForBtn(desc.btnId)}
                macroName={macroName}
                active={active}
                flashId={active ? hold.downAt : null}
                selected={selected}
                onSelect={() =>
                  onSelectButton?.({
                    remoteId: desc.remoteId,
                    btnId: desc.btnId,
                  })
                }
              />
            </div>
          );
        })}
      </div>

      {/* viewport controls */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        <CanvasButton label="Zoom in" onClick={() => zoomBy(1.3)}>
          +
        </CanvasButton>
        <CanvasButton label="Zoom out" onClick={() => zoomBy(1 / 1.3)}>
          −
        </CanvasButton>
        <CanvasButton label="Fit graph" onClick={() => fitAll(450)}>
          ⤢
        </CanvasButton>
        <CanvasButton label="Re-arrange" onClick={releaseLayout}>
          ⟳
        </CanvasButton>
      </div>
    </div>
  );
}

function CanvasButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-[#0e1422] text-base font-semibold text-slate-300 shadow-lg transition-colors hover:border-slate-500 hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
