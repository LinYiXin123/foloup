"use client";

import { deleteMyInterview } from "@/actions/dashboard";
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
}: {
  id: string;
  name: string | null;
  onDeleted: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
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
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700"
          aria-label={t("Delete {name}", { name: name || t("Interview") })}
        >
          <Trash2 size={14} className="mr-1" />
          {t("Delete")}
        </Button>
      </AlertDialogTrigger>
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
