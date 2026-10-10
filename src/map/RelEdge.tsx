import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { EDGE_META } from '../lib/meta'
import type { EdgeKind } from '../lib/types'

function RelEdgeImpl(p: EdgeProps) {
  const kind = ((p.data as any)?.kind || 'parent') as EdgeKind
  const meta = EDGE_META[kind]
  const [path, lx, ly] = getBezierPath({
    sourceX: p.sourceX, sourceY: p.sourceY, targetX: p.targetX, targetY: p.targetY,
    sourcePosition: p.sourcePosition, targetPosition: p.targetPosition, curvature: kind === 'parent' ? 0.45 : 0.3
  })
  const color = (p.data as any)?.color as string | undefined
  return (
    <>
      <BaseEdge
        id={p.id}
        path={path}
        markerEnd={kind === 'leads' || kind === 'depends' ? p.markerEnd : undefined}
        interactionWidth={18}
        style={{
          stroke: kind === 'parent' && color ? `${color}88` : meta.color,
          strokeWidth: kind === 'parent' ? 1.6 : 1.4,
          strokeDasharray: meta.dash,
          opacity: (p.data as any)?.dim ? 0.25 : 1
        }}
      />
      {kind !== 'parent' && (p.selected || (p.data as any)?.label) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-full border border-line bg-surface/90 px-2 py-0.5 text-[10px] font-medium text-mute backdrop-blur"
            style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}
          >
            {(p.data as any)?.label || meta.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
export const RelEdge = memo(RelEdgeImpl)
