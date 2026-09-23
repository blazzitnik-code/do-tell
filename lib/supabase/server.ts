import { createServerClient, type CookieOptions } from "@supabase/ssr";
type C = { name: string; value: string; options?: CookieOptions };
import { cookies } from "next/headers";
export async function serverClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: C[]) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* server component */ } },
    },
  });
}
