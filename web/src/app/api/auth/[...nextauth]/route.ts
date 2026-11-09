import NextAuth from "next-auth";
import { authEnabled, authOptions } from "@/lib/auth";

const notFound = () => new Response("Not Found", { status: 404 });
const handler = authEnabled ? NextAuth(authOptions) : notFound;

export { handler as GET, handler as POST };
