// 아주 단순한 타임스탬프 로거. (추후 pino 등으로 교체 가능)

function ts(): string {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

export const log = {
  info: (m: string) => console.log(`[${ts()}] ${m}`),
  error: (m: string) => console.error(`[${ts()}] ⚠️  ${m}`),
  event: (m: string) => console.log(`[${ts()}] ${m}`),
};
