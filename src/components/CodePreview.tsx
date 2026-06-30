import { scaffoldFiles } from "../data/scaffoldFiles";

export function CodePreview({ filePath }: { filePath: string | null }) {
  if (!filePath || !scaffoldFiles[filePath]) {
    return (
      <div className="code-preview empty">
        <div className="empty-icon">{"</>"}</div>
        <h3>Select a file</h3>
        <p>Select a file from the tree to preview its contents</p>
      </div>
    );
  }

  const file = scaffoldFiles[filePath];
  const fileName = filePath.split("/").pop() || filePath;

  return (
    <div className="code-preview">
      <div className="code-header">
        <span className="code-filename">{fileName}</span>
        <span className="code-path">{filePath}</span>
      </div>
      <p className="code-desc">{file.desc}</p>
      <pre className="code-block">
        <code>{file.code}</code>
      </pre>
    </div>
  );
}
