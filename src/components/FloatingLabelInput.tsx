import { motion } from "framer-motion";
import { useState } from "react";

interface FloatingLabelInputProps {
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  onKeyPress?: (e: React.KeyboardEvent) => void;
  showPasswordToggle?: boolean;
  icon?: React.ReactNode;
  error?: boolean;
  rightElement?: React.ReactNode;
  accentColor?: "indigo" | "purple" | "blue" | "pink";
}

export default function FloatingLabelInput({
  label,
  type = "text",
  value,
  onChange,
  onKeyPress,
  showPasswordToggle = false,
  icon,
  error = false,
  rightElement,
  accentColor = "indigo",
}: FloatingLabelInputProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const inputType = showPasswordToggle
    ? showPassword
      ? "text"
      : "password"
    : type;

  const colorClasses = {
    indigo: {
      label: "#4f46e5",
      border: "border-indigo-500",
      shadow: "shadow-indigo-500/10",
      icon: "text-indigo-500",
      hover: "hover:text-indigo-500",
    },
    purple: {
      label: "#9333ea",
      border: "border-purple-500",
      shadow: "shadow-purple-500/10",
      icon: "text-purple-500",
      hover: "hover:text-purple-500",
    },
    blue: {
      label: "#2563eb",
      border: "border-blue-500",
      shadow: "shadow-blue-500/10",
      icon: "text-blue-500",
      hover: "hover:text-blue-500",
    },
    pink: {
      label: "#ec4899",
      border: "border-pink-500",
      shadow: "shadow-pink-500/10",
      icon: "text-pink-500",
      hover: "hover:text-pink-500",
    },
  };

  const colors = colorClasses[accentColor];

  return (
    <div className="relative">
      <motion.label
        animate={{
          y: focused || value ? -24 : 0,
          scale: focused || value ? 0.85 : 1,
          color: focused ? colors.label : "#6b7280",
        }}
        transition={{ duration: 0.2 }}
        className="absolute left-4 top-4 text-gray-500 pointer-events-none origin-left"
      >
        {label}
      </motion.label>

      <motion.input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyPress={onKeyPress}
        whileFocus={{ scale: 1.01 }}
        className={`w-full px-4 py-4 pt-6 bg-gray-50/50 border-2 rounded-xl outline-none transition-all duration-200 ${
          focused
            ? `${colors.border} bg-white shadow-lg ${colors.shadow}`
            : error
            ? "border-red-300 hover:border-red-400"
            : "border-gray-200 hover:border-gray-300"
        }`}
      />

      {/* Left Icon */}
      {icon && (
        <motion.div
          initial={false}
          animate={{
            scale: focused ? 1 : 0,
            opacity: focused ? 1 : 0,
          }}
          className={`absolute right-4 top-1/2 -translate-y-1/2 ${colors.icon}`}
        >
          {icon}
        </motion.div>
      )}

      {/* Password Toggle */}
      {showPasswordToggle && (
        <motion.button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className={`absolute ${
            rightElement ? "right-14" : "right-4"
          } top-1/2 -translate-y-1/2 text-gray-400 ${
            colors.hover
          } transition-colors`}
        >
          {showPassword ? (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
          )}
        </motion.button>
      )}

      {/* Right Element (like match indicator) */}
      {rightElement && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          {rightElement}
        </div>
      )}
    </div>
  );
}