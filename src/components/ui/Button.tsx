import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => {
    const base = "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none rounded-md";
    
    const variants = {
      primary: "bg-blue-600 text-white hover:bg-blue-700 border border-transparent shadow-xs",
      secondary: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-2xs",
      danger: "bg-red-600 text-white hover:bg-red-700 border border-transparent shadow-xs",
      ghost: "hover:bg-slate-100 text-slate-700",
      outline: "border border-blue-600 text-blue-600 hover:bg-blue-50",
    };

    const sizes = {
      sm: "h-8 px-2.5 text-xs gap-1.5",
      md: "h-9 px-3 text-sm gap-2",
      lg: "h-10 px-4 text-base gap-2.5",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
