import { projectTree, type TreeNode } from "../data/projectTree";

function TreeNodeComponent({
  node,
  depth,
  onSelect,
  selected,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
  selected: string | null;
}) {
  const isDir = node.type === "dir";
  const ext = node.name.split(".").pop() || "";
  const icon = isDir
    ? depth === 0
      ? "\uD83D\uDCC1"
      : "\uD83D\uDCC2"
    : ext === "rs"
      ? "\uD83E\uDD80"
      : ext === "toml"
        ? "\u2699\uFE0F"
        : "\uD83D\uDCC4";

  return (
    <>
      <button
        className={`tree-node ${selected === node.path ? "selected" : ""} ${isDir ? "is-dir" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => !isDir && onSelect(node.path)}
      >
        <span className="tree-icon">{icon}</span>
        <span className="tree-name">{node.name}</span>
        {ext === "rs" && <span className="tree-ext">Rust</span>}
      </button>
      {node.children?.map((child) => (
        <TreeNodeComponent
          key={child.path}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
          selected={selected}
        />
      ))}
    </>
  );
}

export function FileTree({
  onSelect,
  selected,
}: {
  onSelect: (path: string) => void;
  selected: string | null;
}) {
  return (
    <aside className="file-tree">
      <div className="tree-header">Project Scaffold</div>
      <div className="tree-content">
        {projectTree.map((node) => (
          <TreeNodeComponent
            key={node.path}
            node={node}
            depth={0}
            onSelect={onSelect}
            selected={selected}
          />
        ))}
      </div>
    </aside>
  );
}
