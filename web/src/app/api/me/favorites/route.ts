import { proxyUserApi } from "@/lib/auth";

export async function GET() {
  return proxyUserApi("/favorites", "GET");
}

export async function POST(req: Request) {
  return proxyUserApi("/favorites", "POST", await req.text());
}
