import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "无限白纸留言",
  description: "一张无限延展的白纸地图，每次支付 0.01 元写下一条留言。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
