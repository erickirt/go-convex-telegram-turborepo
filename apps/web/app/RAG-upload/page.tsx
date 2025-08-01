"use client";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Optional: use edge runtime

import React, { useRef, useState } from "react";
import { ConvexStatusIndicator } from "../../components/settings/convex-status-indicator";
import { DocumentBrowser } from "../../components/rag/DocumentBrowser";
import { DocumentStats } from "../../components/rag/DocumentStats";
import { VectorConverterStatus } from "../../components/settings/vector-status-indicator";
import { LLMUsageBarChart } from "../../components/settings/llm-usage-bar-chart";
import { ThreeJSUploadIcon } from "../../components/rag/ThreeJSUploadIcon";
import { UploadForm } from "../../components/rag/UploadForm";
import { BackgroundGradient } from "../../components/ui/backgrounds/background-gradient";
import { BasicRAGUploadErrorScreen } from "../../components/ui/basic-error-screen";
import { Card } from "../../components/ui/card";
import { Hero, TextAnimationType } from "../../components/ui/hero";
import { SparklesCore } from "../../components/ui/sparkles";
import { api } from "../../generated-convex";
import { useAnimationSettings } from "../../hooks/use-animation-settings";
import {
  useConvexConnection,
  useSafeMutation,
  useSafeQuery,
} from "../../hooks/use-safe-convex";
// Dynamic imports for PDF and DOCX utilities to avoid Edge runtime issues
// These will be loaded only when needed on the client side



export default function RAGUploadPage(): React.ReactElement {
  const { animationEnabled } = useAnimationSettings();
  const [uploadMethod, setUploadMethod] = useState<"file" | "text">("file");
  const [textContent, setTextContent] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);
  const [embeddingMessage, setEmbeddingMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Use safe Convex hooks for real-time data with error handling
  const { isConnected } = useConvexConnection();
  const documentsQuery = useSafeQuery(api.documents.getAllDocuments, {
    limit: 5,
  });
  const statsQuery = useSafeQuery(api.documents.getEnhancedDocumentStats);
  const { mutate: saveDocument } = useSafeMutation(api.documents.saveDocument);

  const documents = documentsQuery.data?.page || [];
  const loadingDocuments = documentsQuery.isLoading;
  const loadingStats = statsQuery.isLoading;
  const stats = statsQuery.data;

  // Data is now loaded automatically via Convex hooks

  const validateFile = async (file: File) => {
    const allowedTypes = [".md", ".txt", ".pdf", ".docx", ".doc"];
    const fileExtension = file.name
      .toLowerCase()
      .substring(file.name.lastIndexOf("."));

    if (!allowedTypes.includes(fileExtension)) {
      return `File type not supported. Please upload ${allowedTypes.join(", ")} files.`;
    }

    // Different size limits for different file types
    if (fileExtension === ".pdf") {
      // Use PDF-specific validation with dynamic import
      try {
        const { validatePDFFile } = await import("../../lib/pdf-utils");
        const pdfValidation = validatePDFFile(file);
        if (!pdfValidation.valid) {
          return pdfValidation.error || "Invalid PDF file.";
        }
      } catch (error) {
        console.error("Failed to load PDF utilities:", error);
        return "PDF processing is not available.";
      }
    } else if (fileExtension === ".docx" || fileExtension === ".doc") {
      // Use DOCX-specific validation with dynamic import
      try {
        const { validateDOCXFile } = await import("../../lib/docx-utils");
        const docxValidation = validateDOCXFile(file);
        if (!docxValidation.valid) {
          return docxValidation.error || "Invalid DOCX file.";
        }
      } catch (error) {
        console.error("Failed to load DOCX utilities:", error);
        return "DOCX processing is not available.";
      }
    } else {
      // 1MB limit for text files
      if (file.size > 1024 * 1024) {
        return "File size must be less than 1MB.";
      }
    }

    return null;
  };

  const handleFileUpload = async (file: File) => {
    const validationError = await validateFile(file);
    if (validationError) {
      setUploadStatus("error");
      setUploadMessage(validationError);
      return;
    }

    setIsUploading(true);
    setUploadStatus("idle");

    try {
      let content: string;
      let contentType: "markdown" | "text";
      let documentSummary: string | undefined;

      if (file.name.toLowerCase().endsWith(".pdf")) {
        // Extract text from PDF with dynamic import
        try {
          const { extractTextFromPDF, generatePDFSummary } = await import(
            "../../lib/pdf-utils"
          );
          const pdfResult = await extractTextFromPDF(file);
          if ("error" in pdfResult) {
            setUploadStatus("error");
            setUploadMessage(`PDF extraction failed: ${pdfResult.error}`);
            return;
          }
          content = pdfResult.text;
          contentType = "text";

          // Generate summary for PDF if not provided
          documentSummary =
            summary ||
            (pdfResult.metadata
              ? generatePDFSummary(pdfResult.metadata)
              : "PDF document");
        } catch (_error) {
          setUploadStatus("error");
          setUploadMessage("PDF processing is not available.");
          return;
        }
      } else if (
        file.name.toLowerCase().endsWith(".docx") ||
        file.name.toLowerCase().endsWith(".doc")
      ) {
        // Extract text from DOCX with dynamic import
        try {
          const { extractTextFromDOCX, generateDOCXSummary } = await import(
            "../../lib/docx-utils"
          );
          const docxResult = await extractTextFromDOCX(file);
          if ("error" in docxResult) {
            setUploadStatus("error");
            setUploadMessage(`DOCX extraction failed: ${docxResult.error}`);
            return;
          }
          content = docxResult.text;
          contentType = "text";

          // Generate summary for DOCX if not provided
          documentSummary =
            summary ||
            (docxResult.metadata
              ? generateDOCXSummary(docxResult.metadata)
              : "DOCX document");
        } catch (_error) {
          setUploadStatus("error");
          setUploadMessage("DOCX processing is not available.");
          return;
        }
      } else {
        content = await file.text();
        contentType = file.name.endsWith(".md") ? "markdown" : "text";
        documentSummary = summary;
      }

      const documentTitle = title || file.name.replace(/\.[^/.]+$/, "");

      await saveDocument({
        title: documentTitle,
        content,
        contentType,
        summary: documentSummary || undefined,
      });

      setUploadStatus("success");
      setUploadMessage(`Document "${documentTitle}" uploaded successfully!`);
      setTitle("");
      setSummary("");
      setTextContent("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setUploadStatus("error");
      setUploadMessage("Upload failed. Please try again.");
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBatchFileUpload = async (files: File[]) => {
    // Validate all files first
    for (const file of files) {
      const validationError = await validateFile(file);
      if (validationError) {
        setUploadStatus("error");
        setUploadMessage(`File "${file.name}": ${validationError}`);
        return;
      }
    }

    setIsUploading(true);
    setUploadStatus("idle");

    try {
      // Prepare documents array
      const documents: Array<{
        title: string;
        content: string;
        contentType: "text" | "markdown";
        summary?: string;
      }> = [];

      for (const file of files) {
        let content: string;
        let contentType: "markdown" | "text";

        if (file.name.toLowerCase().endsWith(".pdf")) {
          // Extract text from PDF with dynamic import
          try {
            const { extractTextFromPDF } = await import("../../lib/pdf-utils");
            const pdfResult = await extractTextFromPDF(file);
            if ("error" in pdfResult) {
              setUploadStatus("error");
              setUploadMessage(
                `PDF extraction failed for "${file.name}": ${pdfResult.error}`
              );
              return;
            }
            content = pdfResult.text;
            contentType = "text";
          } catch (_error) {
            setUploadStatus("error");
            setUploadMessage(
              `PDF processing failed for "${file.name}": PDF utilities not available`
            );
            return;
          }
        } else if (
          file.name.toLowerCase().endsWith(".docx") ||
          file.name.toLowerCase().endsWith(".doc")
        ) {
          // Extract text from DOCX with dynamic import
          try {
            const { extractTextFromDOCX } = await import(
              "../../lib/docx-utils"
            );
            const docxResult = await extractTextFromDOCX(file);
            if ("error" in docxResult) {
              setUploadStatus("error");
              setUploadMessage(
                `DOCX extraction failed for "${file.name}": ${docxResult.error}`
              );
              return;
            }
            content = docxResult.text;
            contentType = "text";
          } catch (_error) {
            setUploadStatus("error");
            setUploadMessage(
              `DOCX processing failed for "${file.name}": DOCX utilities not available`
            );
            return;
          }
        } else {
          content = await file.text();
          contentType = file.name.endsWith(".md") ? "markdown" : "text";
        }

        const documentTitle = file.name.replace(/\.[^/.]+$/, "");

        documents.push({
          title: documentTitle,
          content,
          contentType,
          summary: summary || undefined,
        });
      }

      // Send batch upload request
      const response = await fetch("/api/RAG/batch-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documents }),
      });

      const result = await response.json();

      if (response.ok) {
        setUploadStatus("success");
        setUploadMessage(
          `Batch upload completed: ${result.successful} successful, ${result.failed} failed out of ${result.processed} files`
        );
        setTitle("");
        setSummary("");
        setTextContent("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        setUploadStatus("error");
        setUploadMessage(result.error || "Batch upload failed");
      }
    } catch (error) {
      setUploadStatus("error");
      setUploadMessage("Batch upload failed. Please try again.");
      console.error("Batch upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateEmbeddings = async () => {
    setIsGeneratingEmbeddings(true);
    setEmbeddingMessage("");

    try {
      const response = await fetch("/api/batch-generate-embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok) {
        setEmbeddingMessage(
          `Successfully processed ${result.processed || 0} documents. ${result.successful || 0} successful, ${result.errors || 0} errors.`
        );
      } else {
        setEmbeddingMessage(result.error || "Failed to generate embeddings");
      }
    } catch {
      setEmbeddingMessage("Network error. Please try again.");
    } finally {
      setIsGeneratingEmbeddings(false);
    }
  };

  const handleTextUpload = async () => {
    if (!textContent.trim()) {
      setUploadStatus("error");
      setUploadMessage("Please enter some text content");
      return;
    }

    if (!title.trim()) {
      setUploadStatus("error");
      setUploadMessage("Please enter a title for your document");
      return;
    }

    setIsUploading(true);
    setUploadStatus("idle");

    try {
      await saveDocument({
        title,
        content: textContent,
        contentType: "text",
        summary: summary || undefined,
      });

      setUploadStatus("success");
      setUploadMessage(`Document "${title}" uploaded successfully!`);
      setTitle("");
      setSummary("");
      setTextContent("");
    } catch (error) {
      setUploadStatus("error");
      setUploadMessage("Upload failed. Please try again.");
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const _formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const _formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Show fallback UI when Convex is not connected
  if (!isConnected || documentsQuery.isError || statsQuery.isError) {
    return <BasicRAGUploadErrorScreen />;
  }

  return (
    <div className="pt-20 pb-8 min-h-screen">
      <div className="px-4 mx-auto max-w-4xl">
        {/* Header */}
        <Hero
          titleAnimation={TextAnimationType.TextRoll}
          title="Upload Documents"
          subtitle="Upload your knowledge base for AI-powered search and retrieval"
          subtitleAccordionContent={
            "RAG (Retrieval-Augmented Generation) is a search technique that enhances AI responses by incorporating uploaded information from your documents in combination with an external LLM (large language model). The uploaded documents are stored in a vector database (more efficient than searching through plain text or traditional databases like SQL/NoSQL). **Convex is different than other databases because it combines SQL structure with vector search.**"
          }
          textAlign="center"
        >
          {/* Sparkles Effect */}
          <div className="overflow-hidden relative -mb-40 w-full h-40 rounded-md">
            <div className="absolute inset-x-20 top-0 bg-gradient-to-r from-transparent via-cyan-200 to-transparent h-[2px] w-3/4 blur-sm" />
            <div className="absolute top-0 inset-x-20 w-3/4 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
            <div className="absolute inset-x-60 top-0 bg-gradient-to-r from-transparent via-cyan-500 to-transparent h-[5px] w-1/4 blur-sm" />
            <div className="absolute top-0 inset-x-60 w-1/4 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

            <SparklesCore
              id="tsparticles"
              background="transparent"
              minSize={0.4}
              maxSize={1}
              particleDensity={1200}
              className="z-20 w-full h-full"
              particleColor="#FFFFFF"
              animationEnabled={animationEnabled}
            />

            <div className="absolute inset-0 w-full h-full bg-slate-950 [mask-image:radial-gradient(350px_200px_at_top,transparent_20%,white)]"></div>
          </div>
        </Hero>

        {/* Three.js Upload Animation */}
        <div className="flex relative z-10 justify-center -mt-20 mb-12">
          {React.createElement(ThreeJSUploadIcon, {
            className: "mx-auto",
            animationEnabled: animationEnabled,
          })}
        </div>

        {/* Status Indicators */}
        <div className="mb-6">
          <ConvexStatusIndicator className="mx-auto max-w-md" showLogs={true} />
        </div>
        <div className="mb-6 space-y-4">
          <VectorConverterStatus
            size="sm"
            showLogs={true}
            className="bg-gray-50 dark:bg-gray-800/30"
          />
          <LLMUsageBarChart />
        </div>

        {/* Upload Form */}
        {isUploading ? (
          <BackgroundGradient className="mb-6">
            <UploadForm
              uploadMethod={uploadMethod}
              setUploadMethod={setUploadMethod}
              title={title}
              setTitle={setTitle}
              summary={summary}
              setSummary={setSummary}
              textContent={textContent}
              setTextContent={setTextContent}
              isUploading={isUploading}
              uploadStatus={uploadStatus}
              uploadMessage={uploadMessage}
              fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
              handleFileUpload={handleFileUpload}
              handleBatchFileUpload={handleBatchFileUpload}
              handleTextUpload={handleTextUpload}
              isGeneratingEmbeddings={isGeneratingEmbeddings}
              handleGenerateEmbeddings={handleGenerateEmbeddings}
              embeddingMessage={embeddingMessage}
            />
          </BackgroundGradient>
        ) : (
          <Card className="mb-6 border-gray-700 bg-gray-800/50">
            <UploadForm
              uploadMethod={uploadMethod}
              setUploadMethod={setUploadMethod}
              title={title}
              setTitle={setTitle}
              summary={summary}
              setSummary={setSummary}
              textContent={textContent}
              setTextContent={setTextContent}
              isUploading={isUploading}
              uploadStatus={uploadStatus}
              uploadMessage={uploadMessage}
              fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
              handleFileUpload={handleFileUpload}
              handleBatchFileUpload={handleBatchFileUpload}
              handleTextUpload={handleTextUpload}
              isGeneratingEmbeddings={isGeneratingEmbeddings}
              handleGenerateEmbeddings={handleGenerateEmbeddings}
              embeddingMessage={embeddingMessage}
            />
          </Card>
        )}

        {/* Stats Cards */}
        <DocumentStats stats={stats} loading={loadingStats} />

        {/* Document History */}
        <DocumentBrowser documents={documents} loading={loadingDocuments} />
      </div>
    </div>
  );
}
