/**
 * The workspace scope is either every workspace or one workspace id. It lives
 * in the URL so views can render on the server and survive a refresh or a
 * shared link. All-workspaces is the default and is left out of the URL.
 */
export const ALL_WORKSPACES = "all";
export type WorkspaceScope = string;

export const SCOPE_PARAM = "workspace";

const WORKSPACE_PATH = /^\/workspaces\/([^/]+)/;

/** An unknown or malformed value falls back to all workspaces. */
export function parseWorkspaceScope(
  raw: string | string[] | undefined | null,
  workspaceIds: readonly string[],
): WorkspaceScope {
  if (typeof raw === "string" && workspaceIds.includes(raw)) return raw;
  return ALL_WORKSPACES;
}

/** On a workspace's own page, the page's workspace is the active scope. */
export function resolveActiveScope(
  pathname: string,
  param: string | null,
  workspaceIds: readonly string[],
): WorkspaceScope {
  const pathId = pathname.match(WORKSPACE_PATH)?.[1];
  return parseWorkspaceScope(pathId ?? param, workspaceIds);
}

/** Adds the scope to a link so it carries across navigation. */
export function withScope(href: string, scope: WorkspaceScope): string {
  if (scope === ALL_WORKSPACES) return href;
  return `${href}?${SCOPE_PARAM}=${encodeURIComponent(scope)}`;
}

/** Where selecting a scope should take the user from the current page. */
export function hrefForScope(pathname: string, scope: WorkspaceScope): string {
  if (WORKSPACE_PATH.test(pathname)) {
    return scope === ALL_WORKSPACES ? "/dashboard" : `/workspaces/${scope}`;
  }
  return withScope(pathname, scope);
}
