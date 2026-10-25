"use client";

import { getMyDeletedInterviews, restoreMyInterview } from "@/actions/dashboard";
import { Button } from "@/components/ui/button";
import { useInterviews } from "@/contexts/interviews.context";
import { useLanguage } from "@/contexts/language.context";
import { useAppSession } from "@/contexts/session.context";
import type { Interview } from "@/types/interview";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function InterviewRecycleBin() {
  const { t } = useLanguage();
  const { userId, orgId } = useAppSession();
  const { fetchInterviews } = useInterviews();
  const [items, setItems] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [restoring, setRestoring] = useState<string | null>(null);
  const restoringRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: organization changes and explicit retries must reload the server-scoped list.
  useEffect(() => {
    if (!userId) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    getMyDeletedInterviews()
      .then((result) => {
        if (active) {
          setItems(result);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId, orgId, attempt]);

  const restore = async (id: string) => {
    if (restoringRef.current) {
      return;
    }
    restoringRef.current = true;
    setRestoring(id);
    try {
      await restoreMyInterview(id);
      setItems((current) => current.filter((item) => item.id !== id));
      fetchInterviews();
      toast.success(t("Interview restored. It stays inactive until you enable it in its details."));
    } catch {
      toast.error(t("Could not restore the interview. Please try again."));
    } finally {
      restoringRef.current = false;
      setRestoring(null);
    }
  };
  if (loading) {
    return <p className="py-8 text-sm text-slate-500">{t("Loading...")}</p>;
  }
  if (error) {
    return (
      <div className="py-8">
        <p role="alert">{t("Could not load the recycle bin.")}</p>
        <Button className="mt-3" onClick={() => setAttempt((value) => value + 1)}>
          {t("Retry")}
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-5 space-y-3">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-sm text-slate-500">
          {t("The recycle bin is empty.")}
        </p>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-6 rounded-xl border bg-white p-4"
          >
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {t("Interview link disabled. Responses and reports are kept.")}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={restoring !== null}
              onClick={() => void restore(item.id)}
            >
              <RotateCcw size={15} className="mr-2" />
              {t(restoring === item.id ? "Restoring..." : "Restore")}
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
