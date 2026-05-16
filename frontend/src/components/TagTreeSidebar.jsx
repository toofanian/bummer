import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { buildTagTree } from '../lib/tagTree';

function TagNode({ node, selectedId, onSelect, depth = 0 }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-bg-elevated ${
          isSelected ? 'bg-bg-elevated text-text font-medium' : 'text-text-dim'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
            className="w-4 h-4 flex items-center justify-center"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <ChevronRight
              className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="text-sm truncate">{node.name}</span>
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <TagNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TagTreeSidebar({ tags, selectedTagId, onSelect, onOpenManager }) {
  const tree = buildTagTree(tags);
  return (
    <aside className="w-56 border-r border-border h-full flex flex-col">
      <div className="p-2 flex-1 overflow-y-auto">
        <div
          className={`px-2 py-1 rounded cursor-pointer hover:bg-bg-elevated text-sm ${
            selectedTagId === null
              ? 'bg-bg-elevated font-medium'
              : 'text-text-dim'
          }`}
          onClick={() => onSelect(null)}
        >
          All
        </div>
        {tree.map((node) => (
          <TagNode
            key={node.id}
            node={node}
            selectedId={selectedTagId}
            onSelect={onSelect}
          />
        ))}
        {tags.length === 0 && (
          <div className="px-2 py-4 text-xs text-text-dim">No tags yet</div>
        )}
      </div>
      <button
        onClick={onOpenManager}
        className="border-t border-border px-3 py-2 text-xs text-text-dim hover:text-text text-left"
      >
        Manage tags
      </button>
    </aside>
  );
}
