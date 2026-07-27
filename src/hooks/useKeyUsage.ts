/**
 * 打鍵統計 (キーボード側に保存された累積カウンタ) の読み出しフック。
 *
 * ファームウェア側モジュール: bakajaan/zmk-feature-key-usage (`zmk__key_usage`)。
 * Studioを開いていない間の打鍵も (レイヤー, キー位置) 別と HIDキーコード別に
 * 数えられ、フラッシュに保存されるので再起動をまたいで残る。
 *
 * 【2026-07-27 仕様変更】通知ストリーム廃止 → カーソル方式のページング取得。
 * 旧仕様は GetStats に即応答し、カウンタ本体を `StatsChunk` 通知として
 * システムワークキューから送っていた。しかしBLEトランスポートは1回の
 * indicate で27バイトしか送れず、続きの送出はシステムワークキュー上の
 * ワークアイテムが行う。そのキューを我々のストリームワークがTXリング
 * バッファ (64バイト) の空き待ちで占有するため、キュー自体がデッドロック
 * する。input_stream のキーイベント通知は1 indicate に収まるので無事だが、
 * 統計チャンクは絶対に収まらない。結果、チャンクが1つも届かず必ず
 * タイムアウトし、ウォッチドッグには sysworkq のフリーズが記録されていた。
 *
 * 新仕様では GetStats に `cursor` を渡し、応答そのものにカウンタを載せて
 * 返す。1ページ = 通常のRPC 1往復なので、
 * - 共有RPCキュー経由でタイムアウトはキュー待ちを含まない
 * - 途中で失敗しても、そのページだけ再試行すればよい
 * - 通知の到達性に一切依存しない
 * となる。ここで外側から `Promise.race` をかけてRPCを打ち切ってはいけない
 * (応答ストリームが崩れて "GATT Server is disconnected" の連鎖に化ける)。
 *
 * 切断中の表示はエフェクト内の setState でリセットせず、戻り値を `ready` で
 * ゲートして消す (lintルール react-hooks/set-state-in-effect を踏まないため)。
 */
import { useCallback, useState } from "react";
import { useCustomSubsystem, useLockAwareCall } from "./useCustomSubsystem";
import { Request, Response } from "../proto/zmk/key_usage/key_usage";

export const KEY_USAGE_IDENTIFIER = "zmk__key_usage";

/**
 * ページ取得の打ち切り上限。ファームが `is_last` を返さない/カーソルが
 * 進まないといった異常時に無限ループしないための安全弁。
 * 1ページ12件・最大 (レイヤー数×キー数 + キーコード数) 件しかないので、
 * 正常時にこの値へ到達することはない。
 */
export const KEY_USAGE_MAX_PAGES = 512;

const CODEC = {
  encode: (request: Request) => Request.encode(request).finish(),
  decode: (payload: Uint8Array) => Response.decode(payload),
};

export interface KeyUsagePositionStat {
  layer: number;
  position: number;
  count: number;
}

export interface KeyUsageKeycodeStat {
  usagePage: number;
  keycode: number;
  count: number;
}

export interface KeyUsageMetadata {
  totalPresses: number;
  maxLayers: number;
  maxPositions: number;
  maxKeycode: number;
}

export interface KeyboardKeyUsage {
  metadata: KeyUsageMetadata;
  positions: KeyUsagePositionStat[];
  keycodes: KeyUsageKeycodeStat[];
  /** 読み出しが完了した時刻 (epoch ms)。 */
  fetchedAt: number;
}

export interface UseKeyUsageReturn {
  /** ファームウェアに打鍵統計モジュールが入っているか。 */
  isAvailable: boolean;
  stats: KeyboardKeyUsage | null;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  /** 取得済みページ数 (読み出し中の進捗表示用)。 */
  loadedPages: number;
  /** キーボードから累積カウンタを読み出す。 */
  fetchStats: () => Promise<void>;
  /** キーボード側のカウンタを全消去する (フラッシュも含む)。 */
  clearStats: () => Promise<void>;
  /** 未保存のカウンタを今すぐフラッシュへ書き込む。 */
  saveStats: () => Promise<void>;
  clearError: () => void;
}

const EMPTY_METADATA: KeyUsageMetadata = {
  totalPresses: 0,
  maxLayers: 0,
  maxPositions: 0,
  maxKeycode: 0,
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function useKeyUsage(): UseKeyUsageReturn {
  const { subsystem, ready, call } = useCustomSubsystem(
    KEY_USAGE_IDENTIFIER,
    CODEC,
  );

  const [stats, setStats] = useState<KeyboardKeyUsage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [loadedPages, setLoadedPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const safeCall = useLockAwareCall(call, setError);

  const fetchStats = useCallback(async () => {
    if (!ready) return;

    setIsLoading(true);
    setLoadedPages(0);
    setError(null);

    try {
      const positions: KeyUsagePositionStat[] = [];
      const keycodes: KeyUsageKeycodeStat[] = [];
      let metadata: KeyUsageMetadata = EMPTY_METADATA;
      let cursor = 0;

      for (let page = 0; page < KEY_USAGE_MAX_PAGES; page++) {
        const response = await safeCall(
          Request.create({ getStats: { cursor } }),
        );

        // ロック中/応答なし。safeCall 側でメッセージを立てている。
        if (!response) return;

        if (response.error) {
          setError(response.error.message);
          return;
        }

        const payload = response.getStats;
        if (!payload) {
          setError("The keyboard returned an unexpected key usage response");
          return;
        }

        if (payload.metadata) {
          metadata = {
            totalPresses: payload.metadata.totalPresses,
            maxLayers: payload.metadata.maxLayers,
            maxPositions: payload.metadata.maxPositions,
            maxKeycode: payload.metadata.maxKeycode,
          };
        }

        for (const entry of payload.positions) {
          positions.push({
            layer: entry.layer,
            position: entry.position,
            count: entry.count,
          });
        }
        for (const entry of payload.keycodes) {
          keycodes.push({
            usagePage: entry.usagePage,
            keycode: entry.keycode,
            count: entry.count,
          });
        }

        setLoadedPages(page + 1);

        if (payload.isLast) {
          setStats({
            metadata,
            positions,
            keycodes,
            fetchedAt: Date.now(),
          });
          return;
        }

        // カーソルが進まないファームは古い (通知ストリーム方式) 可能性が高い。
        // そのまま回すと無限ループになるので、はっきり伝えて止める。
        if (payload.nextCursor <= cursor) {
          setError(
            "The keyboard firmware does not support paged key usage reads. Please flash a firmware built with zmk-feature-key-usage bf52958 or newer.",
          );
          return;
        }

        cursor = payload.nextCursor;
      }

      setError("Gave up reading key usage statistics after too many pages");
    } catch (err) {
      setError(errorMessage(err, "Failed to load key usage statistics"));
    } finally {
      setIsLoading(false);
    }
  }, [ready, safeCall]);

  const clearStats = useCallback(async () => {
    if (!ready) return;

    setIsMutating(true);
    setError(null);
    try {
      const response = await safeCall(Request.create({ clearStats: {} }));
      if (response?.error) {
        setError(response.error.message);
        return;
      }
      if (response) {
        setStats((current) => ({
          metadata: {
            totalPresses: 0,
            maxLayers: current?.metadata.maxLayers ?? 0,
            maxPositions: current?.metadata.maxPositions ?? 0,
            maxKeycode: current?.metadata.maxKeycode ?? 0,
          },
          positions: [],
          keycodes: [],
          fetchedAt: Date.now(),
        }));
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to clear key usage statistics"));
    } finally {
      setIsMutating(false);
    }
  }, [ready, safeCall]);

  const saveStats = useCallback(async () => {
    if (!ready) return;

    setIsMutating(true);
    setError(null);
    try {
      const response = await safeCall(Request.create({ saveStats: {} }));
      if (response?.error) {
        setError(response.error.message);
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to save key usage statistics"));
    } finally {
      setIsMutating(false);
    }
  }, [ready, safeCall]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isAvailable: subsystem !== null,
    // 切断中は前の接続の数値を見せない。再接続後は再度読み出してもらう。
    stats: ready ? stats : null,
    isLoading: ready ? isLoading : false,
    isMutating: ready ? isMutating : false,
    error: ready ? error : null,
    loadedPages: ready ? loadedPages : 0,
    fetchStats,
    clearStats,
    saveStats,
    clearError,
  };
}
