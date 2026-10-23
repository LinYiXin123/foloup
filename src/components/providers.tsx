"use client";

import { ClientProvider } from "@/contexts/clients.context";
import { InterviewerProvider } from "@/contexts/interviewers.context";
import { InterviewProvider } from "@/contexts/interviews.context";
import compose from "@/lib/compose";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";
import React from "react";

const queryClient = new QueryClient();
const Provider = compose([InterviewProvider, InterviewerProvider, ClientProvider]);

const providers = ({ children }: ThemeProviderProps) => {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <Provider>{children}</Provider>
      </QueryClientProvider>
    </NextThemesProvider>
  );
};

export default providers;
