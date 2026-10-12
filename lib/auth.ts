import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
});

export type SessionUser = {
  email: string;
  name: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return null;
  }

  return {
    email,
    name: session?.user?.name?.trim() || email,
  };
}
