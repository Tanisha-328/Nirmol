import { createAuthClient } from "@/lib/auth-server";
import { authDependencies, handleAuthCallback } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAuthCallback(request, authDependencies(createAuthClient));
}
