export type ApiHttpErrorCheck = { id?: string; ok?: boolean; message?: string };

export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly serverMessage: string,
    public readonly code?: string,
    public readonly serverHint?: string,
    public readonly checks?: ApiHttpErrorCheck[]
  ) {
    const brief = status === 403 ? "权限错误" : serverMessage;
    super(`${status} ${path}: ${brief}`);
    this.name = "ApiHttpError";
  }
}
