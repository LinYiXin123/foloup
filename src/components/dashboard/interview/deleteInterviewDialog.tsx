"use client";

import { deleteMyInterview } from "@/actions/dashboard";
import InterviewActionTooltip from "@/components/dashboard/interview/interviewActionTooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language.context";
import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export default function DeleteInterviewDialog({
  id,
  name,
  onDeleted,
  iconOnly = false,
}: {
  id: string;
  name: string | null;
  onDeleted: () => void;
  iconOnly?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const trigger = (
    <AlertDialogTrigger asChild>
      <Button
        variant={iconOnly ? "secondary" : "ghost"}
        size="sm"
        className={
          iconOnly
            ? "h-6 w-6 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
            : "text-red-600 hover:text-red-700"
        }
        aria-label={t("Delete {name}", { name: name || t("Interview") })}
      >
        <Trash2 size={14} className={iconOnly ? undefined : "mr-1"} />
        {!iconOnly && t("Delete")}
      </Button>
    </AlertDialogTrigger>
  );
  const remove = async () => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      await deleteMyInterview(id);
      setOpen(false);
      toast.success(t("Interview moved to the recycle bin."));
      onDeleted();
    } catch {
      toast.error(t("Failed to delete the interview."));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!pendingRef.current) {
          setOpen(value);
        }
      }}
    >
      {iconOnly ? (
        <InterviewActionTooltip label={t("Delete interview (move to recycle bin)")}>
          {trigger}
        </InterviewActionTooltip>
      ) : (
        trigger
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Move this interview to the recycle bin?")}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="mb-2 block font-semibold text-slate-700">{name}</span>
            {t(
              "The interview link will stop accepting candidates. Existing responses, reports and recordings are kept. You can restore it from the recycle bin.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-red-600 hover:bg-red-700"
            onClick={(event) => {
              event.preventDefault();
              void remove();
            }}
          >
            {t(pending ? "Deleting..." : "Move to recycle bin")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
