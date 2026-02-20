import { useState, useCallback, useEffect } from "react";
import * as github from "../lib/github";
import type { Keymap, BehaviorDefinition } from "./useKeymap";
import {
  patchKeymapFile,
  generateDiff,
  type DiffLine,
} from "../lib/keymapFileGenerator";

export interface GitHubState {
  token: string | null;
  user: github.GitHubUser | null;
  repos: github.GitHubRepo[];
  selectedRepo: github.GitHubRepo | null;
  keymapFiles: string[];
  selectedFile: string | null;
  originalContent: string | null;
  patchedContent: string | null;
  diff: DiffLine[];
  isLoading: boolean;
  error: string | null;
  isDemo: boolean;
}

export interface UseGitHubReturn extends GitHubState {
  login: () => void;
  logout: () => void;
  selectRepo: (repo: github.GitHubRepo) => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  commitChanges: (
    keymap: Keymap,
    behaviors: Map<number, BehaviorDefinition>,
  ) => Promise<void>;
  updateDiff: (
    keymap: Keymap,
    behaviors: Map<number, BehaviorDefinition>,
  ) => void;
}

export const GITHUB_TOKEN_KEY = "github-oauth-token";
const DEMO_TOKEN = "demo-token";

export const DEMO_USER: github.GitHubUser = {
  login: "demo-user",
  name: "Demo User",
  avatar_url: "https://github.com/identicons/demo.png",
};

export const DEMO_REPOS: github.GitHubRepo[] = [
  {
    id: 1,
    name: "zmk-config",
    full_name: "demo-user/zmk-config",
    private: false,
    default_branch: "main",
    html_url: "https://github.com/demo-user/zmk-config",
  },
  {
    id: 2,
    name: "zmk-config-dya",
    full_name: "demo-user/zmk-config-dya",
    private: true,
    default_branch: "main",
    html_url: "https://github.com/demo-user/zmk-config-dya",
  },
];

export const DEMO_KEYMAP_FILES = ["config/dya_dash.keymap"];

export const DEMO_KEYMAP_CONTENT = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/bt.h>

/ {
    keymap {
        compatible = "zmk,keymap";

        default_layer {
            bindings = <
                &kp Q &kp W &kp E &kp R &kp T &kp Y &kp U &kp I
                &kp A &kp S &kp D &kp F &kp G &kp H &kp J &kp K
            >;
        };

        lower_layer {
            bindings = <
                &trans &trans &trans &trans &trans &trans &trans &trans
                &trans &trans &trans &trans &trans &trans &trans &trans
            >;
        };
    };
};
`;

export function useGitHub(isDemo: boolean): UseGitHubReturn {
  const [token, setToken] = useState<string | null>(() => {
    if (isDemo) return DEMO_TOKEN;
    try {
      return localStorage.getItem(GITHUB_TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<github.GitHubUser | null>(
    isDemo ? DEMO_USER : null,
  );
  const [repos, setRepos] = useState<github.GitHubRepo[]>(
    isDemo ? DEMO_REPOS : [],
  );
  const [selectedRepo, setSelectedRepo] = useState<github.GitHubRepo | null>(
    null,
  );
  const [keymapFiles, setKeymapFiles] = useState<string[]>(
    isDemo ? DEMO_KEYMAP_FILES : [],
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(
    isDemo ? DEMO_KEYMAP_CONTENT : null,
  );
  const [patchedContent, setPatchedContent] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || isDemo || user) return;
    github
      .getUser(token)
      .then(setUser)
      .catch((err: Error) => setError(err.message));
  }, [token, isDemo, user]);

  useEffect(() => {
    if (!token || !user || isDemo || repos.length > 0) return;
    github
      .listRepos(token)
      .then(setRepos)
      .catch((err: Error) => setError(err.message));
  }, [token, user, isDemo, repos.length]);

  const login = useCallback(() => {
    if (isDemo) return;
    const loginUrl = github.getLoginUrl();
    const popup = window.open(loginUrl, "github-oauth", "width=600,height=700");
    if (!popup) {
      setError("Failed to open login popup. Please allow popups.");
      return;
    }
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "github-oauth-token") {
        const newToken = event.data.token as string;
        setToken(newToken);
        try {
          localStorage.setItem(GITHUB_TOKEN_KEY, newToken);
        } catch {
          // ignore storage errors
        }
        window.removeEventListener("message", handleMessage);
        popup.close();
        setUser(null);
        setRepos([]);
        setSelectedRepo(null);
        setKeymapFiles([]);
        setSelectedFile(null);
        setOriginalContent(null);
        setPatchedContent(null);
        setDiff([]);
      }
    };
    window.addEventListener("message", handleMessage);
  }, [isDemo]);

  const logout = useCallback(() => {
    if (isDemo) return;
    setToken(null);
    try {
      localStorage.removeItem(GITHUB_TOKEN_KEY);
    } catch {
      // ignore storage errors
    }
    setUser(null);
    setRepos([]);
    setSelectedRepo(null);
    setKeymapFiles([]);
    setSelectedFile(null);
    setOriginalContent(null);
    setPatchedContent(null);
    setDiff([]);
    setError(null);
  }, [isDemo]);

  const selectRepo = useCallback(
    async (repo: github.GitHubRepo) => {
      setSelectedRepo(repo);
      setSelectedFile(null);
      setOriginalContent(null);
      setPatchedContent(null);
      setDiff([]);
      setError(null);

      if (isDemo) {
        setKeymapFiles(DEMO_KEYMAP_FILES);
        return;
      }

      if (!token) return;
      setIsLoading(true);
      try {
        const [owner, repoName] = repo.full_name.split("/");
        const files = await github.findKeymapFiles(
          token,
          owner,
          repoName,
          repo.default_branch,
        );
        setKeymapFiles(files);
        if (files.length === 0) {
          setError("No .keymap files found in this repository.");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load keymap files",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [token, isDemo],
  );

  const selectFile = useCallback(
    async (path: string) => {
      setSelectedFile(path);
      setPatchedContent(null);
      setDiff([]);
      setError(null);

      if (isDemo) {
        setOriginalContent(DEMO_KEYMAP_CONTENT);
        return;
      }

      if (!token || !selectedRepo) return;
      setIsLoading(true);
      try {
        const [owner, repoName] = selectedRepo.full_name.split("/");
        const file = await github.getFileContents(token, owner, repoName, path);
        const content = github.decodeFileContent(file.content);
        setOriginalContent(content);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        setIsLoading(false);
      }
    },
    [token, selectedRepo, isDemo],
  );

  const updateDiff = useCallback(
    (keymap: Keymap, behaviors: Map<number, BehaviorDefinition>) => {
      if (!originalContent) return;
      const patched = patchKeymapFile(originalContent, keymap, behaviors);
      setPatchedContent(patched);
      const diffLines = generateDiff(originalContent, patched);
      setDiff(diffLines);
    },
    [originalContent],
  );

  const commitChanges = useCallback(
    async (keymap: Keymap, behaviors: Map<number, BehaviorDefinition>) => {
      if (isDemo) {
        setError(
          "Demo mode: commit is disabled. In real mode, this would create a PR on GitHub.",
        );
        return;
      }

      if (!token || !selectedRepo || !selectedFile || !originalContent) {
        setError("Please select a repository and file first");
        return;
      }

      const patched = patchKeymapFile(originalContent, keymap, behaviors);
      const [owner, repoName] = selectedRepo.full_name.split("/");
      const timestamp = Date.now();
      const branchName = `dya-studio/keymap-update-${timestamp}`;

      setIsLoading(true);
      setError(null);
      try {
        const file = await github.getFileContents(
          token,
          owner,
          repoName,
          selectedFile,
        );
        await github.createBranch(
          token,
          owner,
          repoName,
          branchName,
          selectedRepo.default_branch,
        );
        await github.commitFile(
          token,
          owner,
          repoName,
          selectedFile,
          patched,
          "Update keymap from DYA Studio",
          branchName,
          file.sha,
        );
        const pr = await github.createPullRequest(
          token,
          owner,
          repoName,
          "Update keymap from DYA Studio",
          branchName,
          selectedRepo.default_branch,
          "This PR was created by DYA Studio with updated keymap bindings.",
        );
        window.open(pr.html_url, "_blank");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to commit changes",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [token, selectedRepo, selectedFile, originalContent, isDemo],
  );

  return {
    token,
    user,
    repos,
    selectedRepo,
    keymapFiles,
    selectedFile,
    originalContent,
    patchedContent,
    diff,
    isLoading,
    error,
    isDemo,
    login,
    logout,
    selectRepo,
    selectFile,
    commitChanges,
    updateDiff,
  };
}
