"use client";

import { useLanguage } from "@/contexts/language.context";

import { parsePdf } from "@/actions/parse-pdf";
import { Inbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

type Props = {
  isUploaded: boolean;
  setIsUploaded: (isUploaded: boolean) => void;
  fileName: string;
  setFileName: (fileName: string) => void;
  setUploadedDocumentContext: (context: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

function FileUpload({
  isUploaded,
  setIsUploaded,
  fileName,
  setFileName,
  setUploadedDocumentContext,
  onUploadingChange,
}: Props) {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const requestId = useRef(0);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  const clearDocument = () => {
    setIsUploaded(false);
    setFileName("");
    setUploadedDocumentContext("");
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { getRootProps, getInputProps } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: uploading,
    onDropRejected: () => {
      clearDocument();
      toast.error(t("Please select one PDF file smaller than 10MB."));
    },
    onDrop: async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) {
        return;
      }
      const currentRequest = ++requestId.current;
      clearDocument();

      try {
        setUploading(true);
        onUploadingChange?.(true);
        const formData = new FormData();
        formData.append("file", file);

        const result = await parsePdf(formData);
        if (currentRequest !== requestId.current) {
          return;
        }
        if (!result.success) {
          throw new Error(result.error);
        }
        const fullText = result.text?.trim();
        if (!fullText) {
          throw new Error(t("No readable text found in the PDF."));
        }
        setUploadedDocumentContext(fullText);
        setFileName(file.name);
        setIsUploaded(true);
      } catch (error) {
        if (currentRequest !== requestId.current) {
          return;
        }
        toast.error(t("Error reading PDF"), {
          description: error instanceof Error ? t(error.message) : t("Please try again."),
          duration: 3000,
        });
      } finally {
        if (currentRequest === requestId.current) {
          setUploading(false);
          onUploadingChange?.(false);
        }
      }
    },
  });

  return (
    <div className="p-2 bg-white rounded-xl w-full h-24">
      {!isUploaded ? (
        <div
          {...getRootProps({
            className:
              "border-dashed border-2 rounded-xl cursor-pointer bg-gray-50 py-4 flex justify-center items-center flex-col",
          })}
        >
          <input {...getInputProps()} />
          <>
            <Inbox className="w-8 h-8 text-blue-500" />
            <output className="mt-2 text-sm text-slate-400">
              {uploading ? t("Reading PDF… Please wait") : t("Drop PDF Here")}
            </output>
          </>
        </div>
      ) : (
        <div className="text-left">
          <p className="mt-2 text-sm text-slate-600">
            {t("File uploaded successfully.")} {fileName}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            {t("Do you want to")}{" "}
            <button
              type="button"
              className="underline text-slate-950 cursor-pointer font-semibold"
              onClick={clearDocument}
            >
              {t("Reupload?")}
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

export default FileUpload;
