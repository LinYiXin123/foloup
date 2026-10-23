"use server";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function parsePdf(formData: FormData) {
  try {
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "Please select a non-empty PDF file." };
    }
    // Candidates call this from the public interview page, so enforce the limit here too.
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: "Please upload a PDF smaller than 10MB." };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-")) {
      return { success: false, error: "This file is not a valid PDF." };
    }

    const loadingTask = getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    try {
      const pdf = await loadingTask.promise;
      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        if (content.items.length === 0) {
          continue;
        }

        let lastY: number | undefined;
        const textItems: string[] = [];
        for (const item of content.items) {
          if ("str" in item) {
            textItems.push(lastY === item.transform[5] || !lastY ? item.str : `\n${item.str}`);
            lastY = item.transform[5];
          }
        }
        pages.push(textItems.join(""));
      }

      const text = pages.join("\n").trim();
      if (!text) {
        return {
          success: false,
          error:
            "No readable text found. Please use a text PDF or run OCR on the scanned resume first.",
        };
      }

      return { success: true, text };
    } finally {
      await loadingTask.destroy();
    }
  } catch (error) {
    console.error("Error parsing PDF:", error);

    return {
      success: false,
      error: "Failed to parse PDF",
    };
  }
}
