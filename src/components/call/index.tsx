"use client";

import { useLanguage } from "@/contexts/language.context";

import {
  type PublicInterview,
  getInterviewerImage,
  markCallEnded,
  submitInterviewFeedback,
} from "@/actions/candidate";
import { FeedbackForm } from "@/components/call/feedbackForm";
import FileUpload from "@/components/dashboard/interview/fileUpload";
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
import { isLightColor, testEmail } from "@/lib/utils";
import type { FeedbackData } from "@/types/response";
import axios from "axios";
import { AlarmClockIcon, ArrowUpRightSquareIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";
import Image from "next/image";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import { toast } from "sonner";
import MiniLoader from "../loaders/mini-loader/miniLoader";
import { Button } from "../ui/button";
import { Card, CardHeader, CardTitle } from "../ui/card";
import { TabSwitchWarning, useTabSwitchPrevention } from "./tabSwitchPrevention";

type InterviewProps = {
  interview: PublicInterview;
};

type registerCallResponseType = {
  data: {
    registerCallResponse: {
      call_id: string;
      access_token: string;
    };
  };
};

type transcriptType = {
  role: string;
  content: string;
};

function Call({ interview }: InterviewProps) {
  const { t } = useLanguage();
  const [lastInterviewerResponse, setLastInterviewerResponse] = useState<string>("");
  const [lastUserResponse, setLastUserResponse] = useState<string>("");
  const [activeTurn, setActiveTurn] = useState<string>("");
  const [Loading, setLoading] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [isValidEmail, setIsValidEmail] = useState<boolean>(false);
  const [isOldUser, setIsOldUser] = useState<boolean>(false);
  const [callError, setCallError] = useState("");
  const [retryBlocked, setRetryBlocked] = useState(false);
  const { tabSwitchCount } = useTabSwitchPrevention();
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [interviewerImg, setInterviewerImg] = useState("");
  const [interviewTimeDuration, setInterviewTimeDuration] = useState<string>("1");
  const [time, setTime] = useState(0);
  const [currentTimeDuration, setCurrentTimeDuration] = useState<string>("0");
  const [resumeText, setResumeText] = useState("");
  const [isResumeUploaded, setIsResumeUploaded] = useState(false);
  const [resumeFileName, setResumeFileName] = useState("");
  const [hideLogo, setHideLogo] = useState(false);
  const [isResumeUploading, setIsResumeUploading] = useState(false);

  const lastUserResponseRef = useRef<HTMLDivElement | null>(null);
  const webClientRef = useRef<RetellWebClient | null>(null);
  const mountedRef = useRef(false);
  const lifecycleRef = useRef(0);
  const registrationAbortRef = useRef<AbortController | null>(null);
  const callIdRef = useRef("");
  const hasStartedRef = useRef(false);
  const callFailedRef = useRef(false);
  const startingRef = useRef(false);
  const pendingCallRef = useRef<{
    callId: string;
    accessToken: string;
    candidate: string;
    retryUntil: number;
    attempts: number;
  } | null>(null);

  const reportCallError = useCallback(
    (client: RetellWebClient) => {
      callFailedRef.current = true;
      const pending = pendingCallRef.current;
      const canRetry =
        !hasStartedRef.current &&
        pending &&
        pending.attempts < 2 &&
        Date.now() < pending.retryUntil;
      const message = hasStartedRef.current
        ? t(
            "The interview connection was interrupted. Please contact the interviewer before trying again.",
          )
        : canRetry
          ? t(
              "Could not connect. Check your microphone and network, then retry once without changing your details.",
            )
          : t(
              "Could not connect to this interview session. Please ask the interviewer to reset your attempt.",
            );
      setCallError(message);
      setRetryBlocked(!canRetry);
      setLoading(false);
      setIsCalling(false);
      if (!canRetry) {
        pendingCallRef.current = null;
      }
      toast.error(message);
      client.stopCall();
    },
    [t],
  );

  const handleFeedbackSubmit = async (formData: Omit<FeedbackData, "interview_id">) => {
    try {
      const result = await submitInterviewFeedback({
        ...formData,
        interview_id: interview.id,
      });

      if (result) {
        toast.success(t("Thank you for your feedback!"));
        setIsFeedbackSubmitted(true);
        setIsDialogOpen(false);
      } else {
        toast.error(t("Failed to submit feedback. Please try again."));
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast.error(t("An error occurred. Please try again later."));
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (lastUserResponseRef.current) {
      const { current } = lastUserResponseRef;
      current.scrollTop = current.scrollHeight;
    }
  }, [lastUserResponse]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    let intervalId: any;
    if (isCalling) {
      // setting time from 0 to 1 every 10 milisecond using javascript setInterval method
      intervalId = setInterval(() => setTime(time + 1), 10);
    }
    setCurrentTimeDuration(String(Math.floor(time / 100)));
    if (Number(currentTimeDuration) === Number(interviewTimeDuration) * 60) {
      webClientRef.current?.stopCall();
      setIsEnded(true);
    }

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCalling, time, currentTimeDuration]);

  useEffect(() => {
    if (testEmail(email)) {
      setIsValidEmail(true);
    }
  }, [email]);

  useEffect(() => {
    const client = new RetellWebClient();
    const lifecycle = ++lifecycleRef.current;
    webClientRef.current = client;
    mountedRef.current = true;
    startingRef.current = false;
    const isCurrent = () =>
      mountedRef.current && lifecycleRef.current === lifecycle && webClientRef.current === client;

    client.on("call_started", () => {
      if (!isCurrent()) {
        return;
      }
      console.log("Call started");
      hasStartedRef.current = true;
      pendingCallRef.current = null;
      callFailedRef.current = false;
      setCallError("");
      setLoading(false);
      setIsStarted(true);
      setIsCalling(true);
    });

    client.on("call_ended", () => {
      if (!isCurrent()) {
        return;
      }
      console.log("Call ended");
      pendingCallRef.current = null;
      setLoading(false);
      setIsCalling(false);
      if (hasStartedRef.current) {
        setIsEnded(true);
      } else {
        setRetryBlocked(true);
        setCallError(
          t(
            "This interview session ended before it connected. Please ask the interviewer to reset your attempt.",
          ),
        );
      }
    });

    client.on("agent_start_talking", () => {
      if (isCurrent()) {
        setActiveTurn("agent");
      }
    });

    client.on("agent_stop_talking", () => {
      // Optional: Add any logic when agent stops talking
      if (isCurrent()) {
        setActiveTurn("user");
      }
    });

    client.on("error", () => {
      if (isCurrent()) {
        reportCallError(client);
      }
    });

    client.on("update", (update) => {
      if (isCurrent() && update.transcript) {
        const transcripts: transcriptType[] = update.transcript;
        const roleContents: { [key: string]: string } = {};

        for (const transcript of transcripts) {
          roleContents[transcript?.role] = transcript?.content;
        }

        setLastInterviewerResponse(roleContents.agent);
        setLastUserResponse(roleContents.user);
      }
      //TODO: highlight the newly uttered word in the UI
    });

    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
      registrationAbortRef.current?.abort();
      registrationAbortRef.current = null;
      pendingCallRef.current = null;
      webClientRef.current = null;
      client.removeAllListeners();
      if (hasStartedRef.current) {
        client.stopCall();
      }
      // A still-connecting SDK call is stopped by its own continuation below.
    };
  }, [reportCallError, t]);

  const onEndCallClick = async () => {
    if (isStarted) {
      setLoading(true);
      webClientRef.current?.stopCall();
      setIsEnded(true);
      setLoading(false);
    } else {
      setIsEnded(true);
    }
  };

  const startConversation = async () => {
    const client = webClientRef.current;
    const lifecycle = lifecycleRef.current;
    const isCurrent = () =>
      mountedRef.current && lifecycleRef.current === lifecycle && webClientRef.current === client;
    if (
      !client ||
      !isCurrent() ||
      startingRef.current ||
      hasStartedRef.current ||
      retryBlocked ||
      isResumeUploading
    ) {
      return;
    }
    startingRef.current = true;
    callFailedRef.current = false;
    setCallError("");
    setLoading(true);

    try {
      const candidate = JSON.stringify([interview.id, name, email, resumeText]);
      let pending = pendingCallRef.current;
      if (
        pending &&
        (pending.candidate !== candidate ||
          pending.attempts >= 2 ||
          Date.now() >= pending.retryUntil)
      ) {
        pendingCallRef.current = null;
        setRetryBlocked(true);
        setCallError(
          t(
            "This prepared session can no longer be retried. Please ask the interviewer to reset your attempt.",
          ),
        );
        return;
      }
      if (!pending) {
        // Keep the returned token only in memory so one failed connection can retry
        // without registering the same candidate twice.
        const controller = new AbortController();
        registrationAbortRef.current = controller;
        const response: registerCallResponseType = await axios.post(
          "/api/register-call",
          { interview_id: interview.id, name, email, resume: resumeText },
          { signal: controller.signal },
        );
        if (!isCurrent() || controller.signal.aborted) {
          return;
        }
        const registered = response.data.registerCallResponse;
        if (!registered?.access_token || !registered.call_id) {
          throw new Error("Missing interview session");
        }
        pending = {
          callId: registered.call_id,
          accessToken: registered.access_token,
          candidate,
          // This is a local retry limit, not a guarantee of provider token validity.
          retryUntil: Date.now() + 25_000,
          attempts: 0,
        };
        pendingCallRef.current = pending;
      }
      callIdRef.current = pending.callId;
      pending.attempts += 1;
      await client.startCall({ accessToken: pending.accessToken });
      // A stale connection belongs only to this instance; never affect a newer mount.
      if (!isCurrent()) {
        client.stopCall();
      }
    } catch (error: unknown) {
      if (!isCurrent()) {
        client.stopCall();
        return;
      }
      if (pendingCallRef.current) {
        reportCallError(client);
      } else {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status === 409) {
          setIsOldUser(true);
        } else {
          setCallError(t("Could not prepare the interview. Please try again."));
          toast.error(t("Could not start the interview. Please try again."));
        }
      }
    } finally {
      if (isCurrent()) {
        registrationAbortRef.current = null;
        startingRef.current = false;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (interview?.time_duration) {
      setInterviewTimeDuration(interview?.time_duration);
    }
  }, [interview]);

  useEffect(() => {
    const fetchInterviewer = async () => {
      setInterviewerImg(await getInterviewerImage(interview.interviewer_id));
    };
    fetchInterviewer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.interviewer_id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (isEnded && hasStartedRef.current && callIdRef.current) {
      const updateInterview = async () => {
        await markCallEnded(callIdRef.current, tabSwitchCount);
      };

      updateInterview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnded]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100 py-6">
      {isStarted && <TabSwitchWarning />}
      <div className="bg-white rounded-md md:w-[80%] w-[90%]">
        <Card className="relative min-h-[88vh] pb-6 rounded-lg border-2 border-b-4 border-r-4 border-black text-xl font-bold transition-all md:block dark:border-white">
          <div>
            <div className="m-4 h-[15px] rounded-lg border-[1px]  border-black">
              <div
                className=" bg-indigo-600 h-[15px] rounded-lg"
                style={{
                  width: isEnded
                    ? "100%"
                    : `${
                        (Number(currentTimeDuration) / (Number(interviewTimeDuration) * 60)) * 100
                      }%`,
                }}
              />
            </div>
            <CardHeader className="items-center p-1">
              {!isEnded && (
                <CardTitle className="flex flex-row items-center text-lg md:text-xl font-bold mb-2">
                  {interview?.name}
                </CardTitle>
              )}
              {!isEnded && (
                <div className="flex mt-2 flex-row">
                  <AlarmClockIcon
                    className="text-indigo-600 h-[1rem] w-[1rem] rotate-0 scale-100  dark:-rotate-90 dark:scale-0 mr-2 font-bold"
                    style={{ color: interview.theme_color }}
                  />
                  <div className="text-sm font-normal">
                    {t("Expected duration:")}{" "}
                    <span className="font-bold" style={{ color: interview.theme_color }}>
                      {interviewTimeDuration} {t("mins")}{" "}
                    </span>
                    {t("or less")}
                  </div>
                </div>
              )}
            </CardHeader>
            {!isStarted && !isEnded && !isOldUser && (
              <div className="w-fit min-w-[400px] max-w-[400px] mx-auto mt-2  border border-indigo-200 rounded-md p-2 m-2 bg-slate-50">
                <div>
                  {interview?.logo_url && !hideLogo && (
                    <div className="p-1 flex justify-center">
                      <Image
                        src={interview?.logo_url}
                        alt={t("Logo")}
                        className="h-10 w-auto"
                        width={100}
                        height={100}
                        onError={() => setHideLogo(true)}
                      />
                    </div>
                  )}
                  <div className="p-2 font-normal text-sm mb-4 whitespace-pre-line">
                    {interview?.description}
                    <p className="font-bold text-sm">
                      {"\n"}
                      {t(
                        "Ensure your volume is up and grant microphone access when prompted. Additionally, please make sure you are in a quiet environment.",
                      )}
                      {"\n\n"}
                      {t("Note: Tab switching will be recorded.")}
                    </p>
                  </div>
                  {!interview?.is_anonymous && (
                    <div className="flex flex-col gap-2 justify-center">
                      <div className="flex justify-center">
                        <input
                          value={email}
                          className="h-fit mx-auto py-2 border-2 rounded-md w-[75%] self-center px-2 border-gray-400 text-sm font-normal"
                          placeholder={t("Enter your email address")}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-center">
                        <input
                          value={name}
                          className="h-fit mb-4 mx-auto py-2 border-2 rounded-md w-[75%] self-center px-2 border-gray-400 text-sm font-normal"
                          placeholder={t("Enter your first name")}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col items-center mb-4">
                    <p className="text-sm font-normal w-[75%]">
                      {t(
                        "Your resume (PDF, optional). The interviewer uses it to ask about your experience.",
                      )}
                    </p>
                    <div className="w-[75%]">
                      <FileUpload
                        isUploaded={isResumeUploaded}
                        setIsUploaded={(uploaded) => {
                          setIsResumeUploaded(uploaded);
                          if (!uploaded) {
                            setResumeText("");
                          }
                        }}
                        fileName={resumeFileName}
                        setFileName={setResumeFileName}
                        setUploadedDocumentContext={setResumeText}
                        onUploadingChange={setIsResumeUploading}
                      />
                    </div>
                  </div>
                </div>
                {callError && (
                  <p role="alert" className="px-3 mb-3 text-sm font-normal text-red-700">
                    {t(callError)}
                  </p>
                )}
                <div className="w-[80%] flex flex-row mx-auto justify-center items-center align-middle">
                  <Button
                    className="min-w-20 h-10 rounded-lg flex flex-row justify-center mb-8"
                    style={{
                      backgroundColor: interview.theme_color ?? "#4F46E5",
                      color: isLightColor(interview.theme_color ?? "#4F46E5") ? "black" : "white",
                    }}
                    disabled={
                      Loading ||
                      isResumeUploading ||
                      retryBlocked ||
                      (!interview?.is_anonymous && (!isValidEmail || !name))
                    }
                    onClick={startConversation}
                  >
                    {!Loading ? (
                      pendingCallRef.current ? (
                        t("Retry connection")
                      ) : (
                        t("Start Interview")
                      )
                    ) : (
                      <MiniLoader />
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        className="bg-white border ml-2 text-black min-w-15 h-10 rounded-lg flex flex-row justify-center mb-8"
                        style={{ borderColor: interview.theme_color }}
                        disabled={Loading}
                      >
                        {t("Exit")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("Are you sure?")}</AlertDialogTitle>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-indigo-600 hover:bg-indigo-800"
                          onClick={async () => {
                            await onEndCallClick();
                          }}
                        >
                          {t("Continue")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
            {isStarted && !isEnded && !isOldUser && (
              <div className="flex flex-row p-2 grow">
                <div className="border-x-2 border-grey w-[50%] my-auto min-h-[70%]">
                  <div className="flex flex-col justify-evenly">
                    <div
                      className={
                        "text-[22px] w-[80%] md:text-[26px] mt-4 min-h-[250px] mx-auto px-6"
                      }
                    >
                      {lastInterviewerResponse}
                    </div>
                    <div className="flex flex-col mx-auto justify-center items-center align-middle">
                      <Image
                        src={interviewerImg}
                        alt={t("Image of the interviewer")}
                        width={120}
                        height={120}
                        className={`object-cover object-center mx-auto my-auto ${
                          activeTurn === "agent"
                            ? `border-4 border-[${interview.theme_color}] rounded-full`
                            : ""
                        }`}
                      />
                      <div className="font-semibold">{t("Interviewer")}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-evenly w-[50%]">
                  <div
                    ref={lastUserResponseRef}
                    className={
                      "text-[22px] w-[80%] md:text-[26px] mt-4 mx-auto h-[250px] px-6 overflow-y-auto"
                    }
                  >
                    {lastUserResponse}
                  </div>
                  <div className="flex flex-col mx-auto justify-center items-center align-middle">
                    <Image
                      src={"/user-icon.png"}
                      alt={t("Picture of the user")}
                      width={120}
                      height={120}
                      className={`object-cover object-center mx-auto my-auto ${
                        activeTurn === "user"
                          ? `border-4 border-[${interview.theme_color}] rounded-full`
                          : ""
                      }`}
                    />
                    <div className="font-semibold">{t("You")}</div>
                  </div>
                </div>
              </div>
            )}
            {isStarted && !isEnded && !isOldUser && (
              <div className="items-center p-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      className=" bg-white text-black border  border-indigo-600 h-10 mx-auto flex flex-row justify-center mb-8"
                      disabled={Loading}
                    >
                      {t("End Interview")}{" "}
                      <XCircleIcon className="h-[1.5rem] ml-2 w-[1.5rem] rotate-0 scale-100  dark:-rotate-90 dark:scale-0 text-red" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("Are you sure?")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("This action cannot be undone. This action will end the call.")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-indigo-600 hover:bg-indigo-800"
                        onClick={async () => {
                          await onEndCallClick();
                        }}
                      >
                        {t("Continue")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {isEnded && !isOldUser && (
              <div className="w-fit min-w-[400px] max-w-[400px] mx-auto mt-2  border border-indigo-200 rounded-md p-2 m-2 bg-slate-50  absolute -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
                <div>
                  <div className="p-2 font-normal text-base mb-4 whitespace-pre-line">
                    <CheckCircleIcon className="h-[2rem] w-[2rem] mx-auto my-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-indigo-500 " />
                    <p className="text-lg font-semibold text-center">
                      {callError
                        ? t("The interview connection was interrupted")
                        : isStarted
                          ? t("Thank you for taking the time to participate in this interview")
                          : t("Thank you very much for considering.")}
                    </p>
                    {callError && (
                      <p role="alert" className="text-sm text-red-700">
                        {t(callError)}
                      </p>
                    )}
                    <p className="text-center">
                      {"\n"}
                      {t("You can close this tab now.")}
                    </p>
                  </div>

                  {!isFeedbackSubmitted && (
                    <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                      <AlertDialogTrigger asChild>
                        <Button
                          className="bg-indigo-600 text-white h-10 mt-4 mb-4 mx-auto flex"
                          onClick={() => setIsDialogOpen(true)}
                        >
                          {t("Provide Feedback")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <FeedbackForm email={email} onSubmit={handleFeedbackSubmit} />
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            )}
            {isOldUser && (
              <div className="w-fit min-w-[400px] max-w-[400px] mx-auto mt-2  border border-indigo-200 rounded-md p-2 m-2 bg-slate-50  absolute -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
                <div>
                  <div className="p-2 font-normal text-base mb-4 whitespace-pre-line">
                    <CheckCircleIcon className="h-[2rem] w-[2rem] mx-auto my-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-indigo-500 " />
                    <p className="text-lg font-semibold text-center">
                      {t(
                        "You have already responded in this interview or you are not eligible to respond. Thank you!",
                      )}
                    </p>
                    <p className="text-center">
                      {"\n"}
                      {t("You can close this tab now.")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
        <a
          className="flex flex-row justify-center align-middle mt-3"
          href="https://folo-up.co/"
          target="_blank"
          rel="noreferrer"
        >
          <div className="text-center text-md font-semibold mr-2  ">
            {t("Powered by")}{" "}
            <span className="font-bold">
              Folo<span className="text-indigo-600">Up</span>
            </span>
          </div>
          <ArrowUpRightSquareIcon className="h-[1.5rem] w-[1.5rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-indigo-500 " />
        </a>
      </div>
    </div>
  );
}

export default Call;
