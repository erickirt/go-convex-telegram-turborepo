"use client";

import {
  AlertCircle,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  Loader2,
  Check,
} from "lucide-react";
import { useState } from "react";
import { useLLMStatus } from "../../hooks/use-status-operations";
import { renderIcon } from "../../lib/icon-utils";
import { cn } from "../../lib/utils";
import { Card } from "../ui/card";
import { StatusIndicator } from "../ui/status-indicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tool-tip";
import { LLMLogs } from "./LLMLogs";
import { LLMUsageBarChart } from "./llm-usage-bar-chart";

interface VectorConverterStatusProps {
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
  showLogs?: boolean;
}

const statusColors = {
  healthy: "bg-green-500",
  loading: "bg-yellow-500",
  starting: "bg-blue-500",
  connecting: "bg-yellow-400",
  error: "bg-red-500",
};

const statusSizes = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

const _statusLabels = {
  healthy: "LLM Ready",
  loading: "Model Downloading",
  starting: "Service Starting",
  connecting: "Connecting",
  error: "LLM Error",
};

// Compact error display component
const CompactErrorDisplay = ({ error }: { error: string }) => {
  const [copied, setCopied] = useState(false);
  
  const truncateError = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(error);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy error message:', err);
    }
  };
  
  return (
    <div className="flex gap-2 items-center max-w-full">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex gap-2 items-center cursor-pointer">
            {renderIcon(AlertCircle, { className: "w-4 h-4 text-red-400 flex-shrink-0" })}
            <span className="text-xs text-red-300 truncate max-w-[200px]">
              {truncateError(error)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="p-3 max-w-sm border bg-slate-800 border-slate-600">
          <div className="space-y-2">
            <div className="text-xs font-medium text-red-400">Error Details:</div>
            <div className="text-xs whitespace-pre-wrap break-words text-slate-200">
              {error}
            </div>
            <button
              onClick={copyToClipboard}
              className="flex gap-1 items-center text-xs transition-colors text-slate-400 hover:text-slate-200"
            >
              {copied ? (
                <>
                  {renderIcon(Check, { className: "w-3 h-3" })}
                  Copied!
                </>
              ) : (
                <>
                  {renderIcon(Copy, { className: "w-3 h-3" })}
                  Copy Error
                </>
              )}
            </button>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export const VectorConverterStatus = ({
  size = "md",
  showLabel = true,
  className,
  showLogs = true,
}: VectorConverterStatusProps): React.ReactElement => {
  const { status: llmStatus, loading } = useLLMStatus();

  // Extract values from the status object
  const { status, ready, message, model, details } = llmStatus;
  const [isExpanded, setIsExpanded] = useState(false);
  const getStatusIcon = () => {
    if (status === "healthy" && ready) {
      return renderIcon(CheckCircle, { className: "w-4 h-4 text-green-400" });
    } else if (status === "error") {
      return renderIcon(AlertCircle, { className: "w-4 h-4 text-red-400" });
    } else if (status === "starting") {
      return renderIcon(Loader2, {
        className: "w-4 h-4 text-blue-400 animate-spin",
      });
    } else if (status === "connecting") {
      return renderIcon(Loader2, {
        className: "w-4 h-4 text-yellow-300 animate-spin",
      });
    } else {
      return renderIcon(Loader2, {
        className: "w-4 h-4 text-yellow-400 animate-spin",
      });
    }
  };

  const getStatusText = () => {
    if (status === "healthy" && ready) {
      return "Vector Transformer Ready";
    } else if (status === "error") {
      return "Vector Transformer Error";
    } else if (status === "starting") {
      return "Service Starting...";
    } else if (status === "connecting") {
      return "Connecting to Vector Transformer...";
    } else if (status === "loading") {
      return "Model Downloading...";
    } else {
      return "Loading Vector Transformer...";
    }
  };

  const getStatusColor = () => {
    if (status === "healthy" && ready) {
      return "text-green-400";
    } else if (status === "error") {
      return "text-red-400";
    } else if (status === "starting") {
      return "text-blue-400";
    } else if (status === "connecting") {
      return "text-yellow-300";
    } else {
      return "text-yellow-400";
    }
  };

  const formatUptime = (uptime?: string) => {
    if (!uptime) return null;
    const seconds = parseFloat(uptime);
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const getProgressMessage = () => {
    if (status === "loading" && !ready) {
      return "Model is loading, this may take a few minutes...";
    }
    return message;
  };

  return (
    <Card
      className={cn(
        "overflow-hidden p-0 w-full max-w-full",
        className
      )}
    >
      <div className="flex gap-3 items-center p-3">
        <div className="flex gap-2 items-center">
          {renderIcon(Brain, { className: "w-5 h-5 text-slate-400" })}
          <StatusIndicator 
            status={status === "healthy" && ready ? "connected" : status === "error" ? "disconnected" : "connecting"}
            size={size}
            showLabel={false}
          />
        </div>

        {showLabel && (
          <div className="flex-1 min-w-0">
            <div className={cn("text-sm font-medium", getStatusColor())}>
              {getStatusText()}
            </div>
            
            {/* Show compact error display for error status */}
            {status === "error" && details?.error ? (
              <div className="mt-1">
                <CompactErrorDisplay error={details.error} />
              </div>
            ) : (
              <div className="text-xs text-slate-300">{getProgressMessage()}</div>
            )}
            
            {model && status === "healthy" && (
              <div className="mt-1 text-xs text-slate-300">Sentence Transformer: {model}</div>
            )}
            {details?.uptime && (
              <div className="mt-1 text-xs text-slate-300">
                Uptime: {formatUptime(details.uptime)}
              </div>
            )}
            {details?.timestamp && (
              <div className="mt-1 text-xs text-slate-300">
                Last checked: {new Date(details.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 items-center ml-auto">
          {getStatusIcon()}
          {showLogs && details && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 transition-colors text-slate-400 hover:text-cyan-400"
              title="View detailed logs"
            >
              {renderIcon(Info, { className: "w-4 h-4" })}
            </button>
          )}
          {showLogs && details && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 transition-colors text-slate-400 hover:text-cyan-400"
            >
              {renderIcon(isExpanded ? ChevronUp : ChevronDown, {
                className: "w-4 h-4",
              })}
            </button>
          )}
        </div>
      </div>

      {/* Expandable logs section */}
      {isExpanded && details && (
        <div className="p-3 border-t border-slate-700/50 bg-slate-950/50">
          <div className="space-y-2">
            <div className="flex gap-2 items-center mb-2 text-xs text-slate-400">
              {renderIcon(Info, { className: "w-3 h-3" })}
              <span className="font-medium">Service Details</span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs">
              {details.service_status && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Service Status:</span>
                  <span className="font-mono text-slate-200">
                    {details.service_status}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-slate-400">Model Loaded:</span>
                <span
                  className={cn(
                    "font-mono",
                    details.model_loaded ? "text-cyan-400" : "text-yellow-400"
                  )}
                >
                  {details.model_loaded ? "✓ Yes" : "⏳ Loading..."}
                </span>
              </div>

              {details.uptime && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Uptime:</span>
                  <span className="font-mono text-slate-200">
                    {formatUptime(details.uptime)}
                  </span>
                </div>
              )}

              {details.timestamp && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Check:</span>
                  <span className="font-mono text-slate-200">
                    {new Date(details.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )}

              {llmStatus.memory_usage && (
                <>
                  <div className="pt-2 my-2 border-t border-slate-600">
                    <div className="mb-2 text-xs font-medium text-slate-400">
                      Memory & CPU Usage
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Process Memory:</span>
                    <span className="font-mono text-slate-200">
                      {llmStatus.memory_usage.process_memory_mb?.toFixed(1) ||
                        "0"}{" "}
                      MB
                      {llmStatus.memory_usage.process_memory_percent && (
                        <span className="ml-1 text-slate-500">
                          (
                          {llmStatus.memory_usage.process_memory_percent.toFixed(
                            1
                          )}
                          %)
                        </span>
                      )}
                    </span>
                  </div>

                  {llmStatus.memory_usage.process_cpu_percent !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Process CPU:</span>
                      <span className="font-mono text-slate-200">
                        {llmStatus.memory_usage.process_cpu_percent.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-slate-400">System Memory:</span>
                    <span className="font-mono text-slate-200">
                      {llmStatus.memory_usage.system_memory_used_percent?.toFixed(
                        1
                      ) || "0"}
                      % used
                      {llmStatus.memory_usage.system_memory_available_gb && (
                        <span className="ml-1 text-slate-500">
                          (
                          {llmStatus.memory_usage.system_memory_available_gb.toFixed(
                            1
                          )}
                          GB free)
                        </span>
                      )}
                    </span>
                  </div>

                  {llmStatus.memory_usage.system_memory_total_gb && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total System RAM:</span>
                      <span className="font-mono text-slate-200">
                        {llmStatus.memory_usage.system_memory_total_gb.toFixed(
                          1
                        )}{" "}
                        GB
                      </span>
                    </div>
                  )}

                  {llmStatus.memory_usage.error && (
                    <div className="p-2 mt-2 rounded border border-yellow-800 bg-yellow-900/30">
                      <div className="mb-1 text-xs font-medium text-yellow-400">
                        Memory Monitoring Error:
                      </div>
                      <div className="font-mono text-xs text-yellow-300 break-all">
                        {llmStatus.memory_usage.error}
                      </div>
                    </div>
                  )}
                </>
              )}

              {details.error && (
                <div className="p-2 mt-2 rounded border border-red-800 bg-red-900/30">
                  <div className="mb-1 text-xs font-medium text-red-400">
                    Error Details:
                  </div>
                  <div className="font-mono text-xs text-red-300 break-all">
                    {details.error}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="my-4">
            <LLMUsageBarChart />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Note: Memory and CPU usage is updated every 5 seconds.
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <LLMLogs />
          </div>
        </div>
      )}
    </Card>
  );
};
