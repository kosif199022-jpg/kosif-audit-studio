export default function pino() {
  const noop = () => {};
  return { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop, child: () => pino() };
}
