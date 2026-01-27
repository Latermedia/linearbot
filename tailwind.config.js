/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic CSS variable colors (shadcn)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ============================================
        // Custom Color Palette
        // ============================================

        // Black/Offline (Grays) - DEFAULT at 900
        black: {
          20: "#FAFAFA",
          50: "#F2F2F2",
          100: "#E5E5E5",
          200: "#CCCCCC",
          300: "#B2B2B2",
          400: "#999999",
          500: "#808080",
          600: "#666666",
          700: "#4D4D4D",
          800: "#333333",
          DEFAULT: "#1A1A1A",
          900: "#1A1A1A",
          950: "#000000",
        },

        // Success (Greens) - DEFAULT at 600
        // Used in 5-stop gradient: 400 (peakFlow), 500 (strongRhythm)
        success: {
          50: "#EDF8F2",
          100: "#D7F0E4",
          200: "#AFE1CA",
          300: "#86D1B0",
          400: "#55BF8C",
          500: "#49AA7C",
          DEFAULT: "#3F956C",
          600: "#3F956C",
          700: "#347D5B",
          800: "#296649",
          900: "#1E4F38",
          950: "#0F4023",
        },

        // Warning (Yellows/Ambers) - DEFAULT at 600
        // Used in 5-stop gradient: 500 (steadyProgress)
        warning: {
          50: "#FFF7E5",
          100: "#FFEEC8",
          200: "#FFE09D",
          300: "#FFD271",
          400: "#FFCA5A",
          500: "#E7B24F",
          DEFAULT: "#C69343",
          600: "#C69343",
          700: "#A37435",
          800: "#81582A",
          900: "#5F3E1E",
          950: "#53371B",
        },

        // Danger (Reds/Roses) - DEFAULT at 500
        // Used in 5-stop gradient: 500 (earlyTraction), 600 (lowTraction)
        danger: {
          50: "#FDF1F4",
          100: "#F9DFE5",
          200: "#F5B8C5",
          300: "#F196A9",
          400: "#EB7A93",
          DEFAULT: "#D86982",
          500: "#D86982",
          600: "#B6556D",
          700: "#934259",
          800: "#702F44",
          900: "#4E1E30",
          950: "#2E121D",
        },

        // Brand/Viral Crush (Purples) - DEFAULT at 800
        brand: {
          50: "#F5F3FB",
          100: "#EEE9F9",
          200: "#D5C9F1",
          300: "#BCA5E7",
          400: "#977CDA",
          500: "#8661D2",
          600: "#7450CD",
          700: "#633CC6",
          DEFAULT: "#5124C1",
          800: "#5124C1",
          900: "#3D1C91",
          950: "#2A1363",
        },

        // Accent/Hot Take (Oranges) - DEFAULT at 800
        // Note: shadcn 'accent' semantic color is separate
        "hot-take": {
          50: "#FFF6F3",
          100: "#FFECE5",
          200: "#FFD1C4",
          300: "#FFC6B2",
          400: "#FE9479",
          500: "#FE7A54",
          600: "#FE6030",
          700: "#FE4A14",
          DEFAULT: "#FE3F00",
          800: "#FE3F00",
          900: "#BA2F00",
          950: "#8C2000",
        },

        // Ambient/Grid Glow (Light Neutrals) - DEFAULT at 900
        ambient: {
          100: "#FEFEFD",
          200: "#FEFCFB",
          300: "#FDFBF9",
          400: "#FFFCFA",
          500: "#FBF9F5",
          600: "#FBF7F2",
          700: "#FAF6F0",
          800: "#F9F5EE",
          DEFAULT: "#F9F3EC",
          900: "#F9F3EC",
          950: "#F8F2EA",
        },

        // ============================================
        // Color Expansions (Charts/Visuals)
        // ============================================

        // Yellow - DEFAULT at 400
        yellow: {
          50: "#FEFCE8",
          100: "#FEF9C3",
          200: "#FEF08A",
          300: "#FDE047",
          DEFAULT: "#FACC15",
          400: "#FACC15",
          500: "#EAB308",
          600: "#CA8A04",
          700: "#A16207",
          800: "#854D0E",
          900: "#713F12",
          950: "#422006",
        },

        // Lime - DEFAULT at 400
        lime: {
          50: "#F7FEE7",
          100: "#ECFCCB",
          200: "#D9F99D",
          300: "#BEF264",
          DEFAULT: "#A3E635",
          400: "#A3E635",
          500: "#84CC16",
          600: "#65A30D",
          700: "#4D7C0F",
          800: "#3F6212",
          900: "#365314",
          950: "#1A2E05",
        },

        // Teal - DEFAULT at 500
        teal: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF",
          DEFAULT: "#14B8A6",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
          800: "#115E59",
          900: "#134E4A",
          950: "#042F2E",
        },

        // Blue - DEFAULT at 600
        blue: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          DEFAULT: "#2563EB",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
          950: "#172554",
        },

        // Sky - DEFAULT at 400
        sky: {
          50: "#F0F9FF",
          100: "#E0F2FE",
          200: "#BAE6FD",
          300: "#7DD3FC",
          DEFAULT: "#38BDF8",
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369A1",
          800: "#075985",
          900: "#0C4A6E",
          950: "#082F49",
        },

        // Purple - DEFAULT at 600
        purple: {
          50: "#FAF5FF",
          100: "#F3E8FF",
          200: "#E9D5FF",
          300: "#D8B4FE",
          400: "#C084FC",
          500: "#A855F7",
          DEFAULT: "#9333EA",
          600: "#9333EA",
          700: "#7E22CE",
          800: "#6B21A8",
          900: "#581C87",
          950: "#3B0764",
        },

        // Fuchsia - DEFAULT at 500
        fuchsia: {
          50: "#FDF4FF",
          100: "#FAE8FF",
          200: "#F5D0FE",
          300: "#F0ABFC",
          400: "#E879F9",
          DEFAULT: "#D946EF",
          500: "#D946EF",
          600: "#C026D3",
          700: "#A21CAF",
          800: "#86198F",
          900: "#701A75",
          950: "#4A044E",
        },

        // Pink - DEFAULT at 500
        pink: {
          50: "#FDF2F8",
          100: "#FCE7F3",
          200: "#FBCFE8",
          300: "#F9A8D4",
          400: "#F472B6",
          DEFAULT: "#EC4899",
          500: "#EC4899",
          600: "#DB2777",
          700: "#BE185D",
          800: "#9D174D",
          900: "#831843",
          950: "#500724",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
