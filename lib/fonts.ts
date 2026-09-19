import { Caveat, DM_Sans, DM_Serif_Display, Geist_Mono } from "next/font/google";

export const fontSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const fontDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
  display: "swap",
});

export const fontHandwritten = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
