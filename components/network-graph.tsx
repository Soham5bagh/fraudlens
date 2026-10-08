import type { CaseFile } from "@/lib/types";

const FILL: Record<string, string> = {
  customer: "#1e3a5f",
  account: "#44403c",
  device: "#9a3412",
  ip: "#0f766e",
  merchant: "#3f6212",
};

export function NetworkGraph({ graph }: { graph: CaseFile["graph"] }) {
  const width = 640;
  const height = 360;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Linked entities">
        {graph.edges.map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target) return null;
          const x1 = 36 + source.x * (width - 72);
          const y1 = 28 + source.y * (height - 64);
          const x2 = 36 + target.x * (width - 72);
          const y2 = 28 + target.y * (height - 64);
          return (
            <line
              key={`${edge.source}-${edge.target}-${edge.kind}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#c9bfb2"
              strokeWidth={edge.kind === "p2p" ? 2.4 : 1.2}
            />
          );
        })}
        {graph.nodes.map((node) => {
          const x = 36 + node.x * (width - 72);
          const y = 28 + node.y * (height - 64);
          return (
            <g key={node.id}>
              <circle
                cx={x}
                cy={y}
                r={node.emphasis ? 16 : 12}
                fill={FILL[node.type] ?? "#57534e"}
                stroke={node.emphasis ? "#1c1915" : "transparent"}
                strokeWidth={2}
              />
              <text x={x + 20} y={y - 2} fontSize="11" fill="#1c1915">
                {node.label}
              </text>
              <text x={x + 20} y={y + 12} fontSize="10" fill="#6f685e">
                {node.sublabel}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {Object.entries(FILL).map(([type, color]) => (
          <span key={type}>
            <i style={{ background: color, display: "inline-block", width: 8, height: 8, borderRadius: 99, marginRight: 4 }} />
            {type}
          </span>
        ))}
      </div>
      <p className="note">{graph.caption}</p>
    </div>
  );
}
