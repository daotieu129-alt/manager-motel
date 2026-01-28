import { motion } from "framer-motion";

interface AnimatedBackgroundProps {
  variant?: "blue" | "purple" | "gradient";
}

export default function AnimatedBackground({
  variant = "blue",
}: AnimatedBackgroundProps) {
  const variants = {
    blue: {
      container: "from-slate-50 via-blue-50 to-indigo-50",
      orb1: "bg-blue-400/20",
      orb2: "bg-indigo-400/20",
      orb3: "bg-purple-300/10",
    },
    purple: {
      container: "from-slate-50 via-purple-50 to-pink-50",
      orb1: "bg-purple-400/20",
      orb2: "bg-pink-400/20",
      orb3: "bg-indigo-300/10",
    },
    gradient: {
      container: "from-gray-900 via-gray-800 to-gray-900",
      orb1: "bg-blue-500/10",
      orb2: "bg-purple-500/10",
      orb3: "bg-pink-500/10",
    },
  };

  const colors = variants[variant];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Orb 1 - Top Left */}
      <motion.div
        className={`absolute -top-40 -left-40 w-80 h-80 ${colors.orb1} rounded-full blur-3xl`}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Orb 2 - Bottom Right */}
      <motion.div
        className={`absolute -bottom-40 -right-40 w-80 h-80 ${colors.orb2} rounded-full blur-3xl`}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />

      {/* Orb 3 - Center */}
      <motion.div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 ${colors.orb3} rounded-full blur-3xl`}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />
    </div>
  );
}