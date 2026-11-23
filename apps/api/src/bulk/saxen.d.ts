declare module 'saxen' {
  export class Parser {
    on(
      event: 'openTag',
      listener: (name: string, attributes: () => Record<string, string | undefined>, decode: (text: string) => string) => void,
    ): void;
    on(event: 'error', listener: (error: Error) => void): void;
    parse(source: string): void;
  }
}
