import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/routes";
import { ChunkErrorBoundary } from "./components/ChunkErrorBoundary";
import { I18nProvider } from "./i18n";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <ChunkErrorBoundary>
          <Suspense fallback={<div className="page-loading" />}>
            <RouterProvider router={router} />
          </Suspense>
        </ChunkErrorBoundary>
      </QueryClientProvider>
    </I18nProvider>
  </React.StrictMode>
);
