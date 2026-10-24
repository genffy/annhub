import { llmsTxt } from '@/lib/llms-txt'

// Generated once at build time: the static export writes the body to out/llms.txt.
export const dynamic = 'force-static'

export function GET() {
  return new Response(llmsTxt(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
