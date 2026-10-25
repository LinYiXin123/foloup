"use client";

import { getInterviewerImage } from "@/actions/candidate";
import { getMyInterviewResponses } from "@/actions/dashboard";
import DeleteInterviewDialog from "@/components/dashboard/interview/deleteInterviewDialog";
import MiniLoader from "@/components/loaders/mini-loader/miniLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useInterviews } from "@/contexts/interviews.context";
import { useLanguage } from "@/contexts/language.context";
import { getInterviewUrl } from "@/lib/interview-url";
import axios from "axios";
import { ArrowUpRight, Copy, Pencil } from "lucide-react";
import { CopyCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  name: string | null;
  interviewerId: bigint;
  id: string;
  url: string;
  readableSlug: string;
}

const base_url = process.env.NEXT_PUBLIC_LIVE_URL;

function InterviewCard({ name, interviewerId, id, url, readableSlug }: Props) {
  const { t } = useLanguage();
  const { fetchInterviews } = useInterviews();
  const [copied, setCopied] = useState(false);
  const [responseCount, setResponseCount] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [img, setImg] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const fetchInterviewer = async () => {
      setImg(await getInterviewerImage(interviewerId));
    };
    fetchInterviewer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const fetchResponses = async () => {
      try {
        const responses = await getMyInterviewResponses(id);
        setResponseCount(responses.length);
        if (responses.length > 0) {
          setIsFetching(true);
          for (const response of responses) {
            if (!response.is_analysed) {
              try {
                const result = await axios.post("/api/get-call", {
                  id: response.call_id,
                });

                if (result.status !== 200) {
                  throw new Error(`HTTP error! status: ${result.status}`);
                }
              } catch (error) {
                console.error(
                  `Failed to call api/get-call for response id ${response.call_id}:`,
                  error,
                );
              }
            }
          }
          setIsFetching(false);
        }
      } catch (error) {
        console.error(error);
      }
    };

    fetchResponses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(getInterviewUrl(readableSlug || id, base_url || url || window.location.origin))
      .then(
        () => {
          setCopied(true);
          toast.success(t("The link to your interview has been copied to your clipboard."), {
            position: "bottom-right",
            duration: 3000,
          });
          setTimeout(() => {
            setCopied(false);
          }, 2000);
        },
        (err) => {
          console.log("failed to copy", err.mesage);
        },
      );
  };

  const handleJumpToInterview = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const interviewUrl = getInterviewUrl(
      readableSlug || id,
      base_url || url || window.location.origin,
    );
    window.open(interviewUrl, "_blank");
  };

  return (
    <Card className="relative p-0 mt-4 inline-block cursor-pointer h-60 w-56 ml-1 mr-3 rounded-xl shrink-0 overflow-hidden shadow-md">
      <CardContent className={`p-0 ${isFetching ? "opacity-60" : ""}`}>
        <Link
          href={`/interviews/${id}`}
          className="block"
          style={{ pointerEvents: isFetching ? "none" : "auto" }}
        >
          <div className="w-full h-32 overflow-hidden bg-indigo-600 flex items-center text-center">
            <CardTitle className="w-full mt-6 mx-2 text-white text-base line-clamp-3">
              {name}
              {isFetching && (
                <div className="z-100 mt-[-5px]">
                  <MiniLoader />
                </div>
              )}
            </CardTitle>
          </div>
          <div className="flex h-16 flex-row items-center mx-4 ">
            <div className="w-full overflow-hidden">
              {img && (
                <Image
                  src={img}
                  alt={t("Picture of the interviewer")}
                  width={70}
                  height={70}
                  className="object-cover object-center"
                />
              )}
            </div>
            <div className="text-black text-sm font-semibold mt-2 mr-2 whitespace-nowrap">
              {t("Responses:")}{" "}
              <span className="font-normal">{responseCount?.toString() || 0}</span>
            </div>
          </div>
        </Link>
        <div className="flex h-10 items-center justify-between border-t px-2">
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/interviews/${id}?edit=true`}
              aria-label={t("Edit {name}", { name: name || t("Interview") })}
            >
              <Pencil size={14} className="mr-1" />
              {t("Edit")}
            </Link>
          </Button>
          <DeleteInterviewDialog id={id} name={name} onDeleted={fetchInterviews} />
        </div>
        <div className="absolute top-2 right-2 flex gap-1">
          <Button
            aria-label={t("Preview")}
            className="text-xs text-indigo-600 px-1 h-6"
            variant={"secondary"}
            onClick={handleJumpToInterview}
          >
            <ArrowUpRight size={16} />
          </Button>
          <Button
            aria-label={t("Copy URL")}
            className={`text-xs text-indigo-600 px-1 h-6  ${
              copied ? "bg-indigo-300 text-white" : ""
            }`}
            variant={"secondary"}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              copyToClipboard();
            }}
          >
            {copied ? <CopyCheck size={16} /> : <Copy size={16} />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default InterviewCard;
