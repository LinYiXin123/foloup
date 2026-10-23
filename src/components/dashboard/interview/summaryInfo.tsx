"use client";

import { useLanguage } from "@/contexts/language.context";

import DataTable, { type TableData } from "@/components/dashboard/interview/dataTable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useInterviewers } from "@/contexts/interviewers.context";
import { CandidateStatus } from "@/lib/enum";
import { convertSecondstoMMSS } from "@/lib/utils";
import type { Interview } from "@/types/interview";
import type { Interviewer } from "@/types/interviewer";
import type { Response } from "@/types/response";
import { PieChart } from "@mui/x-charts/PieChart";
import { Info, SmileIcon, UserCircleIcon } from "lucide-react";
import Image from "next/image";
import React, { useEffect, useState } from "react";

type SummaryProps = {
  responses: Response[];
  interview: Interview | undefined;
};

function InfoTooltip({ content }: { content: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Info
            className="h-2 w-2 text-[#4F46E5] inline-block ml-0 align-super font-bold"
            strokeWidth={2.5}
          />
        </TooltipTrigger>
        <TooltipContent className="bg-gray-500 text-white font-normal">
          <p>{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SummaryInfo({ responses, interview }: SummaryProps) {
  const { t, locale } = useLanguage();
  const { interviewers } = useInterviewers();
  const [interviewer, setInterviewer] = useState<Interviewer>();
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [completedInterviews, setCompletedInterviews] = useState<number>(0);
  const [sentimentCount, setSentimentCount] = useState({
    positive: 0,
    negative: 0,
    neutral: 0,
  });

  const totalResponses = responses.length;

  const [candidateStatusCount, setCandidateStatusCount] = useState({
    [CandidateStatus.NO_STATUS]: 0,
    [CandidateStatus.NOT_SELECTED]: 0,
    [CandidateStatus.POTENTIAL]: 0,
    [CandidateStatus.SELECTED]: 0,
  });

  const [tableData, setTableData] = useState<TableData[]>([]);

  const prepareTableData = (responses: Response[]): TableData[] => {
    return responses.map((response) => ({
      call_id: response.call_id,
      name: response.name || t("Anonymous"),
      overallScore: response.analytics?.overallScore || 0,
      communicationScore: response.analytics?.communication?.score || 0,
      callSummary:
        response.analytics?.softSkillSummary ||
        response.details?.call_analysis?.call_summary ||
        t("No summary available"),
    }));
  };

  useEffect(() => {
    if (!interviewers || !interview) {
      return;
    }
    const interviewer = interviewers.find(
      (interviewer) => interviewer.id === interview.interviewer_id,
    );
    setInterviewer(interviewer);
  }, [interviewers, interview]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (!responses) {
      return;
    }

    const sentimentCounter = {
      positive: 0,
      negative: 0,
      neutral: 0,
    };

    let totalDuration = 0;
    let completedCount = 0;

    const statusCounter = {
      [CandidateStatus.NO_STATUS]: 0,
      [CandidateStatus.NOT_SELECTED]: 0,
      [CandidateStatus.POTENTIAL]: 0,
      [CandidateStatus.SELECTED]: 0,
    };

    for (const response of responses) {
      const sentiment = response.details?.call_analysis?.user_sentiment;
      if (sentiment === "Positive") {
        sentimentCounter.positive += 1;
      } else if (sentiment === "Negative") {
        sentimentCounter.negative += 1;
      } else if (sentiment === "Neutral") {
        sentimentCounter.neutral += 1;
      }

      const analysis = response.details?.call_analysis;
      const agentTaskCompletion = analysis?.agent_task_completion_rating;
      if (
        analysis?.call_successful === true ||
        (typeof analysis?.call_successful !== "boolean" &&
          (agentTaskCompletion === "Complete" || agentTaskCompletion === "Partial"))
      ) {
        completedCount += 1;
      }

      totalDuration += response.duration;
      if (Object.values(CandidateStatus).includes(response.candidate_status as CandidateStatus)) {
        statusCounter[response.candidate_status as CandidateStatus]++;
      }
    }

    setSentimentCount(sentimentCounter);
    setTotalDuration(totalDuration);
    setCompletedInterviews(completedCount);
    setCandidateStatusCount(statusCounter);

    const preparedData = prepareTableData(responses);
    setTableData(preparedData);
  }, [responses, locale]);

  return (
    <div className="h-screen z-[10] mx-2">
      {responses.length > 0 ? (
        <div className="bg-slate-200 rounded-2xl min-h-[120px] p-2 ">
          <div className="flex flex-row gap-2 justify-between items-center mx-2">
            <div className="flex flex-row gap-2 items-center">
              <p className="font-semibold my-2">{t("Overall Analysis")}</p>
            </div>
            <p className="text-sm">
              {t("Interviewer used:")}{" "}
              <span className="font-medium">{t(interviewer?.name ?? "")}</span>
            </p>
          </div>
          <p className="my-3 ml-2 text-sm">
            {t("Interview Description:")}{" "}
            <span className="font-medium">{interview?.description}</span>
          </p>
          <div className="flex flex-col gap-1 my-2 mt-4 mx-2 p-4 rounded-2xl bg-slate-50 shadow-md">
            <ScrollArea className="h-[250px]">
              <DataTable data={tableData} interviewId={interview?.id || ""} />
            </ScrollArea>
          </div>
          <div className="flex flex-row gap-1 my-2 justify-center">
            <div className="flex flex-col">
              <div className="flex flex-col gap-1 my-2 mt-4 mx-2 p-3 rounded-2xl bg-slate-50 shadow-md max-w-[400px]">
                <div className="flex flex-row items-center justify-center gap-1 font-semibold mb-1 text-[15px]">
                  {t("Average Duration")}
                  <InfoTooltip content={t("Average time users took to complete an interview")} />
                </div>
                <div className="flex items-center justify-center">
                  <p className="text-2xl font-semibold text-indigo-600 w-fit p-1 px-2 bg-indigo-100 rounded-md">
                    {convertSecondstoMMSS(totalDuration / responses.length)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 mx-2 p-3 rounded-2xl bg-slate-50 shadow-md max-w-[360px]">
                <div className="flex flex-row gap-1 font-semibold mb-1 text-[15px] mx-auto text-center">
                  {t("Interview Completion Rate")}
                  <InfoTooltip content={t("Percentage of interviews completed successfully")} />
                </div>
                <p className="w-fit text-2xl font-semibold text-indigo-600  p-1 px-2 bg-indigo-100 rounded-md">
                  {Math.round((completedInterviews / responses.length) * 10000) / 100}%
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1 my-2 mt-4 mx-2 p-4 rounded-2xl bg-slate-50 shadow-md max-w-[360px]">
              <div className="flex flex-row gap-2 text-[15px] font-bold mb-3 mx-auto">
                <SmileIcon />
                {t("Candidate Sentiment")}
                <InfoTooltip content={t("Distribution of user sentiments during interviews")} />
              </div>
              <PieChart
                sx={{
                  "& .MuiChartsLegend-series text": {
                    fontSize: "0.8rem !important",
                  },
                }}
                series={[
                  {
                    data: [
                      {
                        id: 0,
                        value: sentimentCount.positive,
                        label: `${t("Positive")} (${sentimentCount.positive})`,
                        color: "#22c55e",
                      },
                      {
                        id: 1,
                        value: sentimentCount.neutral,
                        label: `${t("Neutral")} (${sentimentCount.neutral})`,
                        color: "#eab308",
                      },
                      {
                        id: 2,
                        value: sentimentCount.negative,
                        label: `${t("Negative")} (${sentimentCount.negative})`,
                        color: "#eb4444",
                      },
                    ],
                    highlightScope: { faded: "global", highlighted: "item" },
                    faded: {
                      innerRadius: 10,
                      additionalRadius: -10,
                      color: "gray",
                    },
                  },
                ]}
                width={360}
                height={120}
              />
            </div>
            <div className="flex flex-col gap-1 my-2 mt-4 mx-2 p-4 rounded-2xl bg-slate-50 shadow-md">
              <div className="flex flex-row gap-2 text-[15px] font-bold mx-auto mb-1">
                <UserCircleIcon />
                {t("Candidate Status")}
                <InfoTooltip content={t("Breakdown of the candidate selection status")} />
              </div>
              <div className="text-sm text-center mb-1">
                {t("Total Responses:")} {totalResponses}
              </div>
              <PieChart
                sx={{
                  "& .MuiChartsLegend-series text": {
                    fontSize: "0.8rem !important",
                  },
                }}
                series={[
                  {
                    data: [
                      {
                        id: 0,
                        value: candidateStatusCount[CandidateStatus.SELECTED],
                        label: `${t("Selected")} (${candidateStatusCount[CandidateStatus.SELECTED]})`,
                        color: "#22c55e",
                      },
                      {
                        id: 1,
                        value: candidateStatusCount[CandidateStatus.POTENTIAL],
                        label: `${t("Potential")} (${candidateStatusCount[CandidateStatus.POTENTIAL]})`,
                        color: "#eab308",
                      },
                      {
                        id: 2,
                        value: candidateStatusCount[CandidateStatus.NOT_SELECTED],
                        label: `${t("Not Selected")} (${candidateStatusCount[CandidateStatus.NOT_SELECTED]})`,
                        color: "#eb4444",
                      },
                      {
                        id: 3,
                        value: candidateStatusCount[CandidateStatus.NO_STATUS],
                        label: `${t("No Status")} (${candidateStatusCount[CandidateStatus.NO_STATUS]})`,
                        color: "#9ca3af",
                      },
                    ],
                    highlightScope: { faded: "global", highlighted: "item" },
                    faded: {
                      innerRadius: 10,
                      additionalRadius: -10,
                      color: "gray",
                    },
                  },
                ]}
                width={360}
                height={120}
                slotProps={{
                  legend: {
                    direction: "column",
                    position: { vertical: "middle", horizontal: "right" },
                    padding: 0,
                    itemMarkWidth: 10,
                    itemMarkHeight: 10,
                    markGap: 5,
                    itemGap: 5,
                  },
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="w-[85%] h-[60%] flex flex-col items-center justify-center">
          <div className="flex flex-col items-center">
            <Image src="/no-responses.png" alt={t("logo")} width={270} height={270} />
            <p className="text-center text-sm mt-0">
              {t("Please share with your intended respondents")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SummaryInfo;
