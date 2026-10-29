import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { api, User } from "./api";

type UserSummary = Pick<User, "id" | "username" | "avatar">;
type LookupResult = { user: UserSummary | null; loading: boolean; error: string };

export function useUserLookup(value: string): LookupResult {
  const query = value.trim();
  const uid = Number(query);
  const valid = /^[0-9]+$/.test(query) && Number.isSafeInteger(uid) && uid > 0;
  const [result, setResult] = useState<{ query: string; user: UserSummary | null; error: string } | null>(null);
  useEffect(() => {
    setResult(null);
    if (!valid) return;
    let active = true;
    const timer = window.setTimeout(() => {
      api.userProfile(uid).then((user) => {
        if (active) setResult({ query, user, error: "" });
      }).catch((error: Error) => {
        if (active) setResult({ query, user: null, error: error.message });
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, uid, valid]);
  if (!query) return { user: null, loading: false, error: "" };
  if (!valid) return { user: null, loading: false, error: "请输入有效的用户 UID" };
  if (result?.query !== query) return { user: null, loading: true, error: "" };
  return { user: result.user, loading: false, error: result.error };
}

export function UserLookupPreview({ user, loading, error }: LookupResult) {
  return <div className={`uid-user-preview${error ? " has-error" : ""}`} role="status" aria-live="polite" aria-atomic="true">
    {user ? <>
      <span className="uid-user-avatar">{user.avatar ? <img src={user.avatar} alt="" /> : user.username[0]?.toUpperCase()}</span>
      <span className="uid-user-details"><strong>{user.username}</strong><small>UID {user.id}</small></span>
    </> : <><UserRound aria-hidden="true" /><span>{loading ? "查找用户中..." : error || "未选择用户"}</span></>}
  </div>;
}
