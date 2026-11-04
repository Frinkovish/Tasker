export function WorkspaceDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function WorkspaceTag({
  workspace,
}: {
  workspace: { name: string; color: string };
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <WorkspaceDot color={workspace.color} />
      <span className="truncate">{workspace.name}</span>
    </span>
  );
}
