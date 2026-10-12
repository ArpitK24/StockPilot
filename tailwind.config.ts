import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: "#F5F3EE", raised: "#FBFAF7", sunk: "#EDEAE3" },
        ink: { DEFAULT: "#141413", soft: "#3A3936", mute: "#76736C", faint: "#A6A29A" },
        line: { DEFAULT: "#E2DED5", strong: "#CFCAC0" },
        night: { DEFAULT: "#0D0D0C", raised: "#171715", line: "#2A2926", mute: "#8C8981" },
        signal: { DEFAULT: "#FF5A1F", deep: "#E0450D", soft: "#FFE7DC" },
        st: {
          pending: "#B7791F",
          confirmed: "#2E5BFF",
          completed: "#16834A",
          cancelled: "#8A877F",
          low: "#D9480F",
          out: "#B42318",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      fontSize: { "2xs": ["0.6875rem", { lineHeight: "1rem" }] },
      boxShadow: {
        lift: "0 1px 0 rgba(20,20,19,0.04), 0 8px 24px -12px rgba(20,20,19,0.18)",
        pop: "0 24px 60px -20px rgba(13,13,12,0.45)",
      },
      keyframes: {
        ticker: { from: { transform: "translateY(0)" }, to: { transform: "translateY(-50%)" } },
        drift: {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(4%,-6%,0) scale(1.08)" },
        },
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        ticker: "ticker 38s linear infinite",
        drift: "drift 18s ease-in-out infinite",
        rise: "rise .35s cubic-bezier(.2,.7,.2,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
