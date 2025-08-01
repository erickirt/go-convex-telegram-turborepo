"use client";
import { ChevronDown } from "lucide-react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Transition,
  type Variant,
  type Variants,
} from "motion/react";
import React, {
  createContext,
  type ReactNode,
  useContext,
  useState,
} from "react";
import { renderIcon } from "../../lib/icon-utils";
import { cn } from "../../lib/utils";

export type AccordionContextType = {
  expandedValue: React.Key | null;
  toggleItem: (value: React.Key) => void;
  variants?: { expanded: Variant; collapsed: Variant };
};

const AccordionContext = createContext<AccordionContextType | undefined>(
  undefined
);

function useAccordion() {
  const context = useContext(AccordionContext);
  if (!context) {
    // During prerendering, return a default context instead of throwing
    if (typeof window === 'undefined') {
      return {
        expandedValue: null,
        toggleItem: () => {},
        variants: undefined,
      };
    }
    throw new Error("useAccordion must be used within an AccordionProvider");
  }
  return context;
}

export type AccordionProviderProps = {
  children: ReactNode;
  variants?: { expanded: Variant; collapsed: Variant };
  expandedValue?: React.Key | null;
  onValueChange?: (value: React.Key | null) => void;
};

function AccordionProvider({
  children,
  variants,
  expandedValue: externalExpandedValue,
  onValueChange,
}: AccordionProviderProps) {
  const [internalExpandedValue, setInternalExpandedValue] =
    useState<React.Key | null>(null);

  const expandedValue =
    externalExpandedValue !== undefined
      ? externalExpandedValue
      : internalExpandedValue;

  const toggleItem = (value: React.Key) => {
    const newValue = expandedValue === value ? null : value;
    if (onValueChange) {
      onValueChange(newValue);
    } else {
      setInternalExpandedValue(newValue);
    }
  };

  return (
    <AccordionContext.Provider value={{ expandedValue, toggleItem, variants }}>
      {children}
    </AccordionContext.Provider>
  );
}

export type AccordionProps = {
  children: ReactNode;
  className?: string;
  transition?: Transition;
  variants?: { expanded: Variant; collapsed: Variant };
  expandedValue?: React.Key | null;
  onValueChange?: (value: React.Key | null) => void;
  type?: string;
  collapsible?: boolean;
};

function Accordion({
  children,
  className,
  transition,
  variants,
  expandedValue,
  onValueChange,
}: AccordionProps) {
  return (
    <MotionConfig transition={transition}>
      <div className={cn("relative", className)} aria-orientation="vertical">
        <AccordionProvider
          variants={variants}
          expandedValue={expandedValue}
          onValueChange={onValueChange}
        >
          {children}
        </AccordionProvider>
      </div>
    </MotionConfig>
  );
}

export type AccordionItemProps = {
  value: React.Key;
  children: ReactNode;
  className?: string;
};

function AccordionItem({ value, children, className }: AccordionItemProps) {
  const { expandedValue } = useAccordion();
  const isExpanded = value === expandedValue;

  return (
    <div
      className={cn("overflow-hidden", className)}
      {...(isExpanded ? { "data-expanded": "" } : { "data-closed": "" })}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            ...(child.props as any),
            value,
            expanded: isExpanded,
          });
        }
        return child;
      })}
    </div>
  );
}

export type AccordionTriggerProps = {
  children: ReactNode;
  className?: string;
};

function AccordionTrigger({
  children,
  className,
  ...props
}: AccordionTriggerProps) {
  const { toggleItem, expandedValue } = useAccordion();
  const value = (props as { value?: React.Key }).value;
  const isExpanded = value === expandedValue;

  return (
    <button
      onClick={() => value !== undefined && toggleItem(value)}
      aria-expanded={isExpanded}
      type="button"
      className={cn(
        "flex justify-between items-center w-full transition-opacity duration-200 group hover:opacity-80",
        className
      )}
      {...(isExpanded ? { "data-expanded": "" } : { "data-closed": "" })}
    >
      <span className="flex-1">{children}</span>
      {renderIcon(ChevronDown, {
        className: cn(
          "w-4 h-4 transition-transform duration-200 shrink-0",
          isExpanded ? "rotate-180" : "rotate-0"
        ),
        "aria-hidden": "true",
      })}
    </button>
  );
}

export type AccordionContentProps = {
  children: ReactNode;
  className?: string;
};

function AccordionContent({
  children,
  className,
  ...props
}: AccordionContentProps) {
  const { expandedValue, variants } = useAccordion();
  const value = (props as { value?: React.Key }).value;
  const isExpanded = value === expandedValue;

  const BASE_VARIANTS: Variants = {
    expanded: { height: "auto", opacity: 1 },
    collapsed: { height: 0, opacity: 0 },
  };

  const combinedVariants = {
    expanded: { ...BASE_VARIANTS.expanded, ...variants?.expanded },
    collapsed: { ...BASE_VARIANTS.collapsed, ...variants?.collapsed },
  };

  return (
    <AnimatePresence initial={false}>
      {isExpanded && (
        <motion.div
          initial="collapsed"
          animate="expanded"
          exit="collapsed"
          variants={combinedVariants}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
