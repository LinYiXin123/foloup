"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/language.context";
import type { FeedbackData } from "@/types/response";
import React, { useState } from "react";

enum SatisfactionLevel {
  Positive = "😀",
  Moderate = "😐",
  Negative = "😔",
}

interface FeedbackFormProps {
  onSubmit: (data: Omit<FeedbackData, "interview_id">) => Promise<void>;
  email: string;
}

export function FeedbackForm({ onSubmit, email }: FeedbackFormProps) {
  const { t } = useLanguage();
  const [satisfaction, setSatisfaction] = useState<SatisfactionLevel>(SatisfactionLevel.Moderate);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        satisfaction: Object.values(SatisfactionLevel).indexOf(satisfaction),
        feedback,
        email,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">{t("Are you satisfied with the platform?")}</h3>
      <div className="flex justify-center space-x-4 mb-4">
        {Object.values(SatisfactionLevel).map((emoji) => (
          <button
            type="button"
            key={emoji}
            className={`text-3xl ${satisfaction === emoji ? "border-2 border-indigo-600" : ""}`}
            onClick={() => setSatisfaction(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <Textarea
        value={feedback}
        placeholder={t("Add your feedback here")}
        className="mb-4"
        onChange={(e) => setFeedback(e.target.value)}
      />
      <Button
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="w-full bg-indigo-600 text-white"
        onClick={handleSubmit}
      >
        {t("Submit Feedback")}
      </Button>
    </div>
  );
}
