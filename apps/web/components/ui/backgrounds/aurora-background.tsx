"use client";
import { motion } from "motion/react";
import type React from "react";
import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
  animationEnabled?: boolean;
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  animationEnabled = true,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <div
      className={cn(
        "flex relative flex-col justify-center items-center w-full min-h-screen transition-bg bg-zinc-50 text-slate-950 dark:bg-zinc-900",
        className
      )}
      {...props}
    >
      <div
        className="overflow-hidden absolute inset-0"
        style={
          {
            "--aurora":
              "repeating-linear-gradient(100deg,#3b82f6_10%,#a5b4fc_15%,#93c5fd_20%,#ddd6fe_25%,#60a5fa_30%)",
            "--dark-gradient":
              "repeating-linear-gradient(100deg,#000_0%,#000_7%,transparent_10%,transparent_12%,#000_16%)",
            "--white-gradient":
              "repeating-linear-gradient(100deg,#fff_0%,#fff_7%,transparent_10%,transparent_12%,#fff_16%)",

            "--cyan-300": "#93c5fd",
            "--cyan-400": "#60a5fa",
            "--cyan-500": "#3b82f6",
            "--indigo-300": "#a5b4fc",
            "--violet-200": "#ddd6fe",
            "--black": "#000",
            "--white": "#fff",
            "--transparent": "transparent",
          } as React.CSSProperties
        }
      >
        <motion.div
          className={cn(
            "pointer-events-none absolute -inset-[10px] opacity-50 blur-[10px] invert filter will-change-transform",
            "[background-image:var(--white-gradient),var(--aurora)] [background-size:300%,_200%]",
            "[--aurora:repeating-linear-gradient(100deg,var(--cyan-500)_10%,var(--indigo-300)_15%,var(--cyan-300)_20%,var(--violet-200)_25%,var(--cyan-400)_30%)]",
            "[--dark-gradient:repeating-linear-gradient(100deg,var(--black)_0%,var(--black)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--black)_16%)]",
            "[--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)]",
            'after:absolute after:inset-0 after:[background-image:var(--white-gradient),var(--aurora)] after:[background-size:200%,_100%] after:mix-blend-difference after:content-[""]',
            "dark:[background-image:var(--dark-gradient),var(--aurora)] dark:invert-0 after:dark:[background-image:var(--dark-gradient),var(--aurora)]",
            showRadialGradient &&
              "[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]"
          )}
          animate={
            animationEnabled
              ? {
                  backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                }
              : {}
          }
          transition={
            animationEnabled
              ? {
                  duration: 60,
                  ease: "linear",
                  repeat: Infinity,
                }
              : {}
          }
        />
      </div>
      {children}
    </div>
  );
};
