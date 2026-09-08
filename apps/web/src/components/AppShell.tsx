"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { brandConfig } from "@/lib/brand";

interface AppShellProps {
  userEmail: string;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  children: ReactNode;
}

export function AppShell({
  userEmail,
  activeTab,
  onSelectTab,
  children,
}: AppShellProps) {
  const [greeting, setGreeting] = useState("☀️ Good morning!");
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("☀️ Good morning!");
    else if (hour < 18) setGreeting("🌤️ Good afternoon!");
    else setGreeting("🌙 Good evening!");
  }, []);

  const initials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : "JD";

  const navItems = [
    { id: "overview", label: "Overview", icon: "🏠" },
    { id: "new_simulation", label: "New Simulation", icon: "➕" },
    { id: "simulations", label: "Simulations", icon: "🗂️" },
    { id: "personas", label: "Personas", icon: "👥" },
    { id: "reports", label: "Reports", icon: "📑" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-[#fbfaf8] text-stone-900 flex font-sans antialiased">
      {/* ── Left Sidebar Navigation ── */}
      <aside className="w-64 shrink-0 hidden md:flex flex-col justify-between border-r border-[#eee9e2] bg-[#fdfcfb] p-5 sticky top-0 h-screen overflow-y-auto">
        {/* Top: Brand Logo & Nav items */}
        <div className="space-y-6">
          {/* Brand Logo */}
          <Link
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab("overview");
            }}
            className="flex items-center gap-3 px-2 group"
          >
            <span className="text-2xl transition-transform group-hover:scale-110">{brandConfig.mark}</span>
            <div>
              <span className="text-base font-black tracking-tight text-stone-900 block leading-none">
                {brandConfig.name}
              </span>
              <span className="text-[11px] text-stone-500 font-medium block mt-1 leading-tight">
                {brandConfig.descriptor}
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="space-y-1 pt-2">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all text-left ${
                    isActive
                      ? "bg-[#fef3c7] text-[#78350f] shadow-2xs font-extrabold"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Promo/Quote Card with Pastel Blob Backdrop */}
        <div className="relative overflow-hidden rounded-2xl border border-[#eee9e2] bg-[#fbf9f4] p-4 bg-pastel-blob-card shadow-2xs">
          <p className="text-xs font-black text-stone-800 leading-snug relative z-10 max-w-[140px]">
            Better products start with better questions.
          </p>
          <div className="w-8 h-1 bg-amber-400/80 rounded-full mt-3" />
        </div>
      </aside>

      {/* ── Main Content Shell ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 border-b border-[#eee9e2] bg-[#fdfcfb]/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          {/* Mobile Menu & Brand Link */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => onSelectTab("overview")}
              className="flex items-center gap-2"
            >
              <span className="text-xl">{brandConfig.mark}</span>
              <span className="text-sm font-black text-stone-900">{brandConfig.name}</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="hidden sm:flex items-center flex-1 max-w-xs relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search simulations, personas..."
              className="w-full rounded-xl border border-stone-200 bg-stone-50/70 py-1.5 pl-8 pr-3 text-xs text-stone-800 placeholder:text-stone-400 focus:bg-white focus:outline-hidden focus:border-stone-400"
            />
          </div>

          {/* Right Header Controls: Dynamic Greeting & User Profile Dropdown */}
          <div className="flex items-center gap-3 sm:gap-4 ml-auto">
            {/* Dynamic Time Greeting */}
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 bg-amber-50/60 px-3 py-1 rounded-full border border-amber-200/50">
              {greeting}
            </span>

            {/* Mobile Tab Selectors */}
            <div className="flex md:hidden items-center gap-1">
              <button
                onClick={() => onSelectTab("overview")}
                className={`px-2 py-1 text-xs font-bold rounded-lg ${
                  activeTab === "overview" ? "bg-stone-900 text-white" : "text-stone-600"
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => onSelectTab("new_simulation")}
                className={`px-2 py-1 text-xs font-bold rounded-lg ${
                  activeTab === "new_simulation" ? "bg-stone-900 text-white" : "text-stone-600"
                }`}
              >
                + New
              </button>
            </div>

            {/* User Avatar Chip with Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 rounded-full border border-stone-200 bg-white p-1 pr-2.5 hover:border-stone-300 transition-all shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d97706] text-[11px] font-black text-white shadow-2xs">
                  {initials}
                </div>
                <span className="text-[11px] text-stone-500 font-bold hidden sm:inline">⌄</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-stone-200 bg-white p-2 shadow-lg z-50 space-y-1">
                  <div className="px-3 py-2 border-b border-stone-100">
                    <p className="text-xs font-bold text-stone-900 truncate">{userEmail}</p>
                    <p className="text-[10px] text-stone-400">Autonomous AI Validator</p>
                  </div>
                  <button
                    onClick={() => {
                      onSelectTab("settings");
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 rounded-xl text-left"
                  >
                    <span>⚙️</span>
                    <span>Account Settings</span>
                  </button>
                  <div className="pt-1">
                    <SignOutButton />
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Main View Container ── */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
