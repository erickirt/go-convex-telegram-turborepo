"use client";

export const dynamic = "force-dynamic";

import type React from "react";
import { DocumentBrowser } from "../../components/rag/DocumentBrowser";
import { DocumentStats } from "../../components/rag/DocumentStats";
import { VectorSearch } from "../../components/rag/VectorSearch";
import { EmbeddingAtlasViewer } from "../../components/rag/EmbeddingAtlasViewer";
import Cubes from "../../components/ui/backgrounds/mouse-hover-cubes";
import { Hero, TextAnimationType } from "../../components/ui/hero";
import { SparklesCore } from "../../components/ui/sparkles";

import { useAnimationSettings } from "../../hooks/use-animation-settings";
import { useDocumentOperations } from "../../hooks/use-document-operations";
import { useState } from "react";

export default function RAGDataPage(): React.ReactElement | null {
  const { animationEnabled } = useAnimationSettings();
  const [isEmbeddingAtlasFullscreen, setIsEmbeddingAtlasFullscreen] = useState(false);

  // Use optimized document operations hook
  const { documents, stats, loadingDocuments, loadingStats } =
    useDocumentOperations(10);

  return (
    <div
      className="pt-20 pb-8 min-h-screen"
      onClick={(e) => {
        // Prevent infinite loop by checking if the event originated from cubes
        if (e.target && (e.target as Element).closest('.cubes-container')) {
          return;
        }

        // Don't interfere with any interactive elements
        if (e.target && (e.target as Element).closest('button, canvas, svg, input, select, textarea, a, [role="button"]')) {
          return;
        }

        // Don't interfere with EmbeddingAtlasViewer interactions
        if (e.target && (e.target as Element).closest('.embedding-atlas-viewer')) {
          return;
        }

        const cubesScene = document.querySelector(".cubes-container .grid");
        if (cubesScene) {
          const _rect = cubesScene.getBoundingClientRect();
          const event = new MouseEvent("click", {
            clientX: e.clientX,
            clientY: e.clientY,
            bubbles: false, // Prevent bubbling to avoid infinite loop
          });
          cubesScene.dispatchEvent(event);
        }
      }}
    >
      <div className="relative min-h-screen">
        {!isEmbeddingAtlasFullscreen && (
          <div className="flex overflow-hidden fixed inset-0 justify-center items-center -z-10 cubes-container">
            <Cubes
              gridSize={10}
              maxAngle={90}
              radius={2}
              duration={{ enter: 0.1, leave: 0.2 }}
              borderStyle="1px solid rgb(30 41 59)"
              faceColor="rgb(2 6 23)"
              rippleColor="rgb(51 65 85)"
              rippleSpeed={2}
              autoAnimate={animationEnabled}
              rippleOnClick={animationEnabled}
            />
          </div>
        )}
        <div className="relative px-4 mx-auto max-w-4xl">
          {/* Header */}
          <Hero
            title="RAG Data Management"
            subtitle="Explore, search, and manage your knowledge base"
            subtitleAccordionContent={
              "This page provides comprehensive tools for managing your RAG (Retrieval-Augmented Generation) data. You can view document statistics, search through your knowledge base using vector embeddings, generate new embeddings, and browse your document history. The vector search uses AI embeddings to find semantically similar content across all your uploaded documents."
            }
            textAlign="left"
            titleAnimation={TextAnimationType.Decrypt}
            subtitleAnimation={TextAnimationType.Shimmer}
            animationSpeed={75}
            className="mb-6"
          >
            {/* Sparkles Effect */}
            <div className="overflow-hidden relative -mb-40 w-full h-40 rounded-md">
              <div className="absolute inset-x-20 top-0 bg-gradient-to-r from-transparent via-cyan-200 to-transparent h-[2px] w-3/4 blur-sm" />
              <div className="absolute top-0 inset-x-20 w-3/4 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
              <div className="absolute inset-x-60 top-0 bg-gradient-to-r from-transparent via-cyan-500 to-transparent h-[5px] w-1/4 blur-sm" />
              <div className="absolute top-0 inset-x-60 w-1/4 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

              <SparklesCore
                id="tsparticles-data"
                background="transparent"
                minSize={0.4}
                maxSize={1}
                particleDensity={1200}
                className="z-20 w-full h-full"
                particleColor="#A855F7"
                animationEnabled={animationEnabled}
              />

              <div className="absolute inset-0 w-full h-full bg-slate-950 [mask-image:radial-gradient(350px_200px_at_top,transparent_20%,white)]"></div>
            </div>
          </Hero>

          {/* Stats Cards */}
          <DocumentStats stats={stats} loading={loadingStats} />

          {/* Vector Search */}
          <VectorSearch
            className="mb-6"
            hasDocuments={stats?.totalDocuments > 0}
          />

          {/* Embedding Atlas Viewer */}
          <EmbeddingAtlasViewer
            className="mb-6"
            onFullscreenChange={setIsEmbeddingAtlasFullscreen}
          />

          {/* Document Browser */}
          <DocumentBrowser documents={documents} loading={loadingDocuments} />


        </div>
      </div>
    </div>
  );
}
