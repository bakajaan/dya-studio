export const GITHUB_API_BASE = "https://api.github.com";

export function getLoginUrl(): string {
  return "/api/auth/github/login";
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  content: string;
  encoding: string;
}

export interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
}

async function githubFetch(
  token: string,
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  return res;
}

export async function getUser(token: string): Promise<GitHubUser> {
  const res = await githubFetch(token, "/user");
  if (!res.ok) throw new Error(`Failed to get user: ${res.status}`);
  return res.json() as Promise<GitHubUser>;
}

export async function listRepos(token: string): Promise<GitHubRepo[]> {
  const res = await githubFetch(
    token,
    "/user/repos?per_page=100&sort=updated&type=all",
  );
  if (!res.ok) throw new Error(`Failed to list repos: ${res.status}`);
  return res.json() as Promise<GitHubRepo[]>;
}

export async function getFileContents(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<GitHubFileContent> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await githubFetch(
    token,
    `/repos/${owner}/${repo}/contents/${path}${query}`,
  );
  if (!res.ok) throw new Error(`Failed to get file: ${res.status}`);
  return res.json() as Promise<GitHubFileContent>;
}

export async function findKeymapFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string[]> {
  const res = await githubFetch(
    token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  if (!res.ok) throw new Error(`Failed to get tree: ${res.status}`);
  const data = (await res.json()) as { tree: GitHubTreeItem[] };
  return data.tree
    .filter((item) => item.type === "blob" && item.path.endsWith(".keymap"))
    .map((item) => item.path);
}

export function decodeFileContent(content: string): string {
  const cleaned = content.replace(/\n/g, "");
  return atob(cleaned);
}

export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  newBranch: string,
  fromBranch: string,
): Promise<void> {
  const refRes = await githubFetch(
    token,
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`,
  );
  if (!refRes.ok) throw new Error(`Failed to get ref: ${refRes.status}`);
  const refData = (await refRes.json()) as { object: { sha: string } };
  const sha = refData.object.sha;

  const res = await githubFetch(token, `/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
  });
  if (!res.ok) throw new Error(`Failed to create branch: ${res.status}`);
}

export async function commitFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha: string,
): Promise<void> {
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const res = await githubFetch(
    token,
    `/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      body: JSON.stringify({ message, content: encoded, branch, sha }),
    },
  );
  if (!res.ok) throw new Error(`Failed to commit file: ${res.status}`);
}

export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  title: string,
  head: string,
  base: string,
  body: string,
): Promise<{ html_url: string }> {
  const res = await githubFetch(token, `/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, head, base, body }),
  });
  if (!res.ok) throw new Error(`Failed to create pull request: ${res.status}`);
  return res.json() as Promise<{ html_url: string }>;
}
