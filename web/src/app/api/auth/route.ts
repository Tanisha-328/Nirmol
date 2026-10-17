import { createAuthClient } from "@/lib/auth-server";
import { authDependencies, handleAuthGet, handleAuthPost } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleAuthGet(authDependencies(createAuthClient));
}

export async function POST(request: Request) {
  return handleAuthPost(request, authDependencies(createAuthClient));
}
