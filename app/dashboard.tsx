"use client";
import { useEffect } from "react";
import { browserClient } from "@/lib/supabase/client";
import { MARKUP } from "./markup";

export default function Dashboard() {
  useEffect(() => {
    let started = false;
    (async () => {
      if (started) return; started = true;
      const { init } = await import("./engine.js");
      await init(browserClient());
    })();
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
