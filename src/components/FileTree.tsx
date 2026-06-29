interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

const tree: TreeNode[] = [
  {
    name: "minima/",
    path: "minima/",
    type: "dir",
    children: [
      { name: "Cargo.toml", path: "minima/Cargo.toml", type: "file" },
      { name: "Cargo.lock", path: "minima/Cargo.lock", type: "file" },
      { name: ".cargo/config.toml", path: "minima/.cargo/config.toml", type: "file" },
      { name: "build.rs", path: "minima/build.rs", type: "file" },
      {
        name: "crates/",
        path: "minima/crates/",
        type: "dir",
        children: [
          {
            name: "cli/",
            path: "minima/crates/cli/",
            type: "dir",
            children: [
              { name: "Cargo.toml", path: "minima/crates/cli/Cargo.toml", type: "file" },
              { name: "src/", path: "minima/crates/cli/src/", type: "dir", children: [
                { name: "main.rs", path: "minima/crates/cli/src/main.rs", type: "file" },
                { name: "commands.rs", path: "minima/crates/cli/src/commands.rs", type: "file" },
                { name: "config.rs", path: "minima/crates/cli/src/config.rs", type: "file" },
                { name: "output.rs", path: "minima/crates/cli/src/output.rs", type: "file" },
              ]},
            ],
          },
          {
            name: "engine/",
            path: "minima/crates/engine/",
            type: "dir",
            children: [
              { name: "Cargo.toml", path: "minima/crates/engine/Cargo.toml", type: "file" },
              { name: "src/", path: "minima/crates/engine/src/", type: "dir", children: [
                { name: "lib.rs", path: "minima/crates/engine/src/lib.rs", type: "file" },
                { name: "traits.rs", path: "minima/crates/engine/src/traits.rs", type: "file" },
                { name: "message.rs", path: "minima/crates/engine/src/message.rs", type: "file" },
                { name: "contact.rs", path: "minima/crates/engine/src/contact.rs", type: "file" },
                { name: "session.rs", path: "minima/crates/engine/src/session.rs", type: "file" },
                { name: "error.rs", path: "minima/crates/engine/src/error.rs", type: "file" },
              ]},
            ],
          },
          {
            name: "crypto/",
            path: "minima/crates/crypto/",
            type: "dir",
            children: [
              { name: "Cargo.toml", path: "minima/crates/crypto/Cargo.toml", type: "file" },
              { name: "src/", path: "minima/crates/crypto/src/", type: "dir", children: [
                { name: "lib.rs", path: "minima/crates/crypto/src/lib.rs", type: "file" },
                { name: "ratchet.rs", path: "minima/crates/crypto/src/ratchet.rs", type: "file" },
                { name: "x3dh.rs", path: "minima/crates/crypto/src/x3dh.rs", type: "file" },
                { name: "keystore.rs", path: "minima/crates/crypto/src/keystore.rs", type: "file" },
                { name: "identity.rs", path: "minima/crates/crypto/src/identity.rs", type: "file" },
              ]},
            ],
          },
          {
            name: "drivers/",
            path: "minima/crates/drivers/",
            type: "dir",
            children: [
              {
                name: "xmpp/",
                path: "minima/crates/drivers/xmpp/",
                type: "dir",
                children: [
                  { name: "Cargo.toml", path: "minima/crates/drivers/xmpp/Cargo.toml", type: "file" },
                  { name: "src/", path: "minima/crates/drivers/xmpp/src/", type: "dir", children: [
                    { name: "lib.rs", path: "minima/crates/drivers/xmpp/src/lib.rs", type: "file" },
                    { name: "omemo.rs", path: "minima/crates/drivers/xmpp/src/omemo.rs", type: "file" },
                    { name: "stanza.rs", path: "minima/crates/drivers/xmpp/src/stanza.rs", type: "file" },
                  ]},
                ],
              },
              {
                name: "p2p/",
                path: "minima/crates/drivers/p2p/",
                type: "dir",
                children: [
                  { name: "Cargo.toml", path: "minima/crates/drivers/p2p/Cargo.toml", type: "file" },
                  { name: "src/", path: "minima/crates/drivers/p2p/src/", type: "dir", children: [
                    { name: "lib.rs", path: "minima/crates/drivers/p2p/src/lib.rs", type: "file" },
                    { name: "behaviour.rs", path: "minima/crates/drivers/p2p/src/behaviour.rs", type: "file" },
                    { name: "discovery.rs", path: "minima/crates/drivers/p2p/src/discovery.rs", type: "file" },
                    { name: "relay.rs", path: "minima/crates/drivers/p2p/src/relay.rs", type: "file" },
                  ]},
                ],
              },
              {
                name: "matrix/",
                path: "minima/crates/drivers/matrix/",
                type: "dir",
                children: [
                  { name: "Cargo.toml", path: "minima/crates/drivers/matrix/Cargo.toml", type: "file" },
                  { name: "src/", path: "minima/crates/drivers/matrix/src/", type: "dir", children: [
                    { name: "lib.rs", path: "minima/crates/drivers/matrix/src/lib.rs", type: "file" },
                    { name: "sync.rs", path: "minima/crates/drivers/matrix/src/sync.rs", type: "file" },
                    { name: "rooms.rs", path: "minima/crates/drivers/matrix/src/rooms.rs", type: "file" },
                  ]},
                ],
              },
            ],
          },
        ],
      },
      {
        name: "config/",
        path: "minima/config/",
        type: "dir",
        children: [
          { name: "minima.toml.example", path: "minima/config/minima.toml.example", type: "file" },
        ],
      },
      {
        name: "tests/",
        path: "minima/tests/",
        type: "dir",
        children: [
          { name: "integration_test.rs", path: "minima/tests/integration_test.rs", type: "file" },
          { name: "loopback_test.rs", path: "minima/tests/loopback_test.rs", type: "file" },
        ],
      },
    ],
  },
];

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
  const icon = isDir ? (depth === 0 ? "\uD83D\uDCC1" : "\uD83D\uDCC2") : ext === "rs" ? "\uD83E\uDD80" : ext === "toml" ? "\u2699\uFE0F" : "\uD83D\uDCC4";

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
        {tree.map((node) => (
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
