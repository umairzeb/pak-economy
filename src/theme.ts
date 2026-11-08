import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

// Chart code reads colours from the CSS tokens so light/dark stay defined in one place.
const VARS = {
  surface: "--surface-1",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textMuted: "--text-muted",
  axisMuted: "--axis-muted",
  grid: "--grid",
  axis: "--axis",
  border: "--border",
  s1: "--series-1",
  s2: "--series-2",
  s3: "--series-3",
  s1Soft: "--series-1-soft",
  divPos: "--div-pos",
  divNeg: "--div-neg",
  band: "--band",
} as const;

export type Tokens = Record<keyof typeof VARS, string>;

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(VARS).map(([k, v]) => [k, cs.getPropertyValue(v).trim()]),
  ) as Tokens;
}

export type ThemePref = "auto" | "light" | "dark";
const KEY = "pak-economy:theme";

function storedPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function useThemeState() {
  const [pref, setPref] = useState<ThemePref>(storedPref);
  const [tokens, setTokens] = useState<Tokens>(readTokens);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (pref === "auto") delete root.dataset.theme;
    else root.dataset.theme = pref;
    try {
      if (pref === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch {
      /* storage unavailable: preference lasts for this visit only */
    }
    setTokens(readTokens());
  }, [pref]);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTokens(readTokens());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return { pref, setPref, tokens };
}

export const TokensContext = createContext<Tokens | null>(null);

export function useTokens(): Tokens {
  const t = useContext(TokensContext);
  if (!t) throw new Error("useTokens outside TokensContext");
  return t;
}
