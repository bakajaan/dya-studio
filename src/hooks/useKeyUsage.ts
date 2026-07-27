/**
 * 打鍵統計 (キーボード側に保存された累積カウンタ) の読み出しフック。
 *
 * ファームウェア側モジュール: bakajaan/zmk-feature-key-usage (`zmk__key_usage`)。
 * Studioを開いていない間の打鍵も (レイヤー, キー位置) 別と HIDキーコード別に
 * 数えられ、フラッシュに保存されるので再起動をまたいで残る。
 *
 * 転送方式の注意:
 * - GetStats の応答には合計値などのメタデータだけが入り、カウンタ本体は
 *   `StatsChunk` 通知として 8件ずつ非同期に流れてくる (ファームの stream_work)。
 *   最終チャンクには必ず `isLast` が立つ。カウンタが1件も無い場合も
 *   「空 + isLast」のチャンクが1つ届くため、必ずストリーム完了を待てる。
 * - RPCは必ず {@link useCustomSubsystem} 経由で呼ぶ (= グローバルRPCキュー経由・
 *   タイムアウトはキュー待ちを含まない)。ここで外側から `Promise.race` を
 *   かけてRPCを打ち切ってはいけない。応答ストリームが崩れて
 *   "GATT Server is disconnected" の連鎖に化ける。
 *   通知の待ち合わせタイムアウトはRPCではなく通知に対するものなので安全。
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ZMKAppContext } from "@cormoran/zmk-studio-react-hook";
import type { CustomNotification } from "@zmkfirmware/zmk-studio-ts-client/custom";
import { useCustomSubsystem, useLockAwareCall } from "./useCustomSubsystem";
import { Notification, Request, Response } from "../proto/zmk/key_usage/key_usage";

export const KEY_USAGE_IDENTIFIER = "zmk__key_usage";

/** チャンク列の待ち合わせ上限。RPC自体のタイムアウトではない (モジュールdoc参照)。 */
export const KEY_USAGE_STREAM_TIMEOUT_MS = 60_000;

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
  /** キーボードから累積カウンタを読み出す。 */
  fetchStats: () => Promise<void>;
  /** キーボード側のカウンタを全消去する (フラッシュも含む)。 */
  clearStats: () => Promise<void>;
  /** 未保存のカウンタを今すぐフラッシュへ書き込む。 */
  saveStats: () => Promise<void>;
  clearError: () => void;
}

interface PendingStream {
  positions: KeyUsagePositionStat[];
  keycodes: KeyUsageKeycodeStat[];
  finish: () => void;
  fail: (err: unknown) => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function useKeyUsage(): UseKeyUsageReturn {
  const zmkApp = useContext(ZMKAppContext);
  const { subsystem, ready, call } = useCustomSubsystem(
    KEY_USAGE_IDENTIFIER,
    CODEC,
  );

  const [stats, setStats] = useState<KeyboardKeyUsage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeCall = useLockAwareCall(call, setError);
  const pendingRef = useRef<PendingStream | null>(null);
  const subsystemIndex = subsystem?.index;

  // チャンク通知の受信。読み出し中 (pendingRef が立っている間) だけ集める。
  useEffect(() => {
    if (!zmkApp || subsystemIndex === undefined) return;

    return zmkApp.onNotification({
      type: "custom",
      subsystemIndex,
      callback: (customNotification: CustomNotification) => {
        const pending = pendingRef.current;
        if (!pending) return;

        try {
          const notification = Notification.decode(customNotification.payload);
          const chunk = notification.stats;
          if (!chunk) return;

          for (const entry of chunk.positions) {
            pending.positions.push({
              layer: entry.layer,
              position: entry.position,
              count: entry.count,
            });
          }
          for (const entry of chunk.keycodes) {
            pending.keycodes.push({
              usagePage: entry.usagePage,
              keycode: entry.keycode,
              count: entry.count,
            });
          }

          if (chunk.isLast) {
            pending.finish();
          }
        } catch (err) {
          pending.fail(err);
        }
      },
    });
  }, [zmkApp, subsystemIndex]);

  const fetchStats = useCallback(async () => {
    if (!ready) return;

    setIsLoading(true);
    setError(null);

    const pending: PendingStream = {
      positions: [],
      keycodes: [],
      finish: () => undefined,
      fail: () => undefined,
    };

    const streamed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRef.current = null;
        reject(new Error("Timed out waiting for key usage statistics"));
      }, KEY_USAGE_STREAM_TIMEOUT_MS);

      pending.finish = () => {
        clearTimeout(timer);
        pendingRef.current = null;
        resolve();
      };
      pending.fail = (err: unknown) => {
        clearTimeout(timer);
        pendingRef.current = null;
        reject(
          err instanceof Error
            ? err
            : new Error("Failed to decode key usage statistics"),
        );
      };
    });
    // 通知は応答より先に届き得るので、要求を出す前に集計先を用意しておく。
    pendingRef.current = pending;

    try {
      const response = await safeCall(Request.create({ getStats: {} }));

      if (!response) {
        // ロック中/応答なし。ストリームは来ないので待ち合わせを解除する。
        pending.finish();
        return;
      }
      if (response.error) {
        setError(response.error.message);
        pending.finish();
        return;
      }

      const metadata = response.getStats?.metadata;

      await streamed;

      setStats({
        metadata: {
          totalPresses: metadata?.totalPresses ?? 0,
          maxLayers: metadata?.maxLayers ?? 0,
          maxPositions: metadata?.maxPositions ?? 0,
          maxKeycode: metadata?.maxKeycode ?? 0,
        },
        positions: pending.positions,
        keycodes: pending.keycodes,
        fetchedAt: Date.now(),
      });
    } catch (err) {
      pendingRef.current = null;
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
        setStats({
          metadata: {
            totalPresses: 0,
            maxLayers: stats?.metadata.maxLayers ?? 0,
            maxPositions: stats?.metadata.maxPositions ?? 0,
            maxKeycode: stats?.metadata.maxKeycode ?? 0,
          },
          positions: [],
          keycodes: [],
          fetchedAt: Date.now(),
        });
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to clear key usage statistics"));
    } finally {
      setIsMutating(false);
    }
  }, [ready, safeCall, stats]);

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

  // 切断時は読み出し中のストリームを畳み、表示も初期化する。
  useEffect(() => {
    if (ready) return;

    pendingRef.current?.finish();
    pendingRef.current = null;
    setStats(null);
    setIsLoading(false);
    setIsMutating(false);
    setError(null);
  }, [ready]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isAvailable: subsystem !== null,
    stats,
    isLoading,
    isMutating,
    error,
    fetchStats,
    clearStats,
    saveStats,
    clearError,
  };
}
